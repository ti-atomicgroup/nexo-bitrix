import { randomUUID } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as backupRoute } from "@/app/api/backup/route";
import { GET as peopleRoute } from "@/app/api/privacy/people/route";
import { POST as eraseRoute } from "@/app/api/privacy/people/[personId]/erase/route";
import { GET as exportRoute } from "@/app/api/privacy/people/[personId]/route";
import { getDb } from "@/server/db";
import { audit, listAudit } from "@/server/db/repos/audit";
import { insertDocument } from "@/server/db/repos/documents";
import { enqueueJob } from "@/server/db/repos/jobs";
import { getJourney, updateJourney } from "@/server/db/repos/journeys";
import { getLedgerItem, insertLedgerItem } from "@/server/db/repos/ledger";
import { findPerson, findPersonByBitrixId, upsertBitrixPeople } from "@/server/db/repos/people";
import { getSyncState, setRetentionMonths } from "@/server/db/repos/settings";
import { applyRetention, runDataCareIfDue } from "@/server/engine/data-care";
import { createBackup, listBackups, BACKUP_KEEP_DAYS, rotateBackups } from "@/server/runtime/backup";
import { resetInstanceKeyForTests } from "@/server/security/crypto";
import { storeDocumentFile } from "@/server/security/document-vault";
import { resetRateLimitsForTests } from "@/server/security/rate-limit";
import type { ErasureReceiptDTO, PersonExportDTO, PrivacyPersonDTO } from "@/shared/contracts";
import { decryptBackupFile } from "../../scripts/lib/backup-file.mjs";
import { openDb } from "@/server/db/driver";
import { useTestDb } from "../support/db";
import { activityRow, call, seedActivities, seedBitrixPerson, seedJourney, seedManualPerson, seedTemplate, seedUser, type ApiErrorBody } from "./support/seed";

vi.mock("@/server/engine", async () => (await import("./support/engine-mock")).engineMock());

let env: ReturnType<typeof useTestDb>;
beforeEach(() => {
  resetInstanceKeyForTests();
  env = useTestDb();
  resetRateLimitsForTests();
  vi.spyOn(console, "log").mockImplementation(() => undefined);
});
afterEach(() => {
  env.cleanup();
  resetInstanceKeyForTests();
  vi.restoreAllMocks();
});

function closedJourney(name = "Ana Souza", completedAt = new Date().toISOString()) {
  const person = seedManualPerson(name);
  const journey = seedJourney({ person, template: seedTemplate("offboarding"), status: "completed", offboardingReason: "involuntary" });
  updateJourney(journey.id, { completedAt, cancelReason: "Motivo sigiloso" });
  const [activity] = seedActivities([activityRow({ journeyId: journey.id, title: "Devolver notebook", bitrixTaskId: "777", status: "done" })]);
  const documentId = randomUUID();
  const file = storeDocumentFile(documentId, new Uint8Array([1, 2, 3]));
  insertDocument({ id: documentId, journeyId: journey.id, activityId: activity!.id, requestKey: "rg", fileName: "rg-ana.pdf", mimeType: "application/pdf", size: 3, sha256: "aa", localFile: file });
  getDb().prepare("UPDATE documents SET bitrix_url = 'https://empresa.bitrix24.com.br/disk/1/'").run();
  const item = insertLedgerItem({ personId: person.id, kind: "equipment", name: "Notebook", detail: "Patrimônio 4471", status: "closed", source: "manual" });
  audit({ actorType: "user", actorName: "Rita", action: "Jornada cancelada", entity: "journey", entityId: journey.id, detail: { text: `Saída de ${name}. Motivo sigiloso` } });
  enqueueJob({ kind: "task.comment", payload: { activityId: activity!.id, message: `Mensagem sobre ${name}` } });
  return { person, journey, activity: activity!, item };
}

const admin = async () => (await seedUser({ role: "admin" })).token;

describe("dados pessoais: acesso", () => {
  it("só a administração alcança", async () => {
    const { person } = closedJourney();
    const { token } = await seedUser({ role: "rh" });
    expect((await call(peopleRoute, { path: "/api/privacy/people", token })).status).toBe(403);
    expect((await call<unknown, "personId">(exportRoute, { path: `/api/privacy/people/${person.id}`, params: { personId: person.id }, token })).status).toBe(403);
    expect((await call<unknown, "personId">(eraseRoute, { path: "/x", params: { personId: person.id }, token, body: { confirmName: "Ana Souza" } })).status).toBe(403);
    expect((await call(backupRoute, { path: "/api/backup", token })).status).toBe(403);
  });

  it("encontra quem não está na lista de responsáveis: candidatos e contas desativadas", async () => {
    closedJourney();
    upsertBitrixPeople([{ bitrixUserId: "30", name: "Bruno Inativo", email: "bruno@empresa.com.br", active: false }]);
    const token = await admin();
    const found = await call<PrivacyPersonDTO[]>(peopleRoute, { path: "/api/privacy/people?query=ana", token });
    expect(found.body).toEqual([expect.objectContaining({ name: "Ana Souza", source: "manual", journeys: 1, openJourneys: 0 })]);
    const byEmail = await call<PrivacyPersonDTO[]>(peopleRoute, { path: "/api/privacy/people?query=bruno@empresa", token });
    expect(byEmail.body[0]?.name).toBe("Bruno Inativo");
  });
});

describe("exportação por pessoa", () => {
  it("traz tudo o que o Nexo guarda, legível, e fica registrada", async () => {
    const { person } = closedJourney();
    const result = await call<PersonExportDTO, "personId">(exportRoute, { path: `/api/privacy/people/${person.id}`, params: { personId: person.id }, token: await admin() });
    expect(result.status).toBe(200);
    expect(result.body.person.name).toBe("Ana Souza");
    const [journey] = result.body.journeys;
    expect(journey).toMatchObject({ offboardingReason: "involuntary", cancelReason: "Motivo sigiloso" });
    expect(journey?.activities[0]).toMatchObject({ title: "Devolver notebook", bitrixTaskId: "777" });
    expect(journey?.documents[0]).toMatchObject({ fileName: "rg-ana.pdf", bitrixUrl: "https://empresa.bitrix24.com.br/disk/1/" });
    expect(journey?.history.some((entry) => entry.detail.includes("Motivo sigiloso"))).toBe(true);
    expect(result.body.ledger[0]).toMatchObject({ name: "Notebook", detail: "Patrimônio 4471" });
    expect(listAudit({ entity: "privacy" })[0]?.action).toBe("Dados pessoais exportados");
    expect(listAudit({ entity: "privacy" })[0]?.detail).not.toContain("Ana");
  });
});

describe("exclusão por pessoa", () => {
  const erase = async (personId: string, confirmName: string, token: string) =>
    call<ErasureReceiptDTO & ApiErrorBody, "personId">(eraseRoute, { path: "/x", params: { personId }, token, body: { confirmName } });

  it("exige o nome certo e recusa enquanto há jornada em andamento", async () => {
    const token = await admin();
    const { person } = closedJourney();
    const wrong = await erase(person.id, "Outra Pessoa", token);
    expect(wrong.status).toBe(422);
    expect(findPerson(person.id)).not.toBeNull();
    const busy = seedManualPerson("Bia");
    seedJourney({ person: busy, template: seedTemplate("onboarding"), status: "active" });
    const open = await erase(busy.id, "Bia", token);
    expect(open.status).toBe(409);
    expect(open.body.error.code).toBe("JOURNEY_OPEN");
  });

  it("apaga jornadas, atividades, documentos, inventário, fila e texto do histórico, e devolve o que ficou no Bitrix24", async () => {
    const { person, journey, activity, item } = closedJourney();
    expect(readdirSync(join(env.dataDir, "documents"))).toHaveLength(1);
    const result = await erase(person.id, "  ana souza ", await admin());
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ journeys: 1, activities: 1, documents: 1, ledgerItems: 1, bitrix: { taskIds: ["777"], fileUrls: ["https://empresa.bitrix24.com.br/disk/1/"] }, backupDays: BACKUP_KEEP_DAYS });
    expect(getJourney(journey.id)).toBeNull();
    expect(getLedgerItem(item.id)).toBeNull();
    expect(findPerson(person.id)).toBeNull();
    expect(readdirSync(join(env.dataDir, "documents"))).toHaveLength(0);
    expect(getDb().prepare("SELECT COUNT(*) AS total FROM journey_activities WHERE id = ?").get<{ total: number }>(activity.id)?.total).toBe(0);
    expect(getDb().prepare("SELECT COUNT(*) AS total FROM jobs").get<{ total: number }>()?.total).toBe(0);
    // A linha do histórico continua (quem fez e quando), sem o texto.
    const [history] = listAudit({ entity: "journey", entityId: journey.id });
    expect(history).toMatchObject({ action: "Jornada cancelada", detail: "" });
    const receipt = listAudit({ entity: "privacy" })[0];
    expect(receipt?.action).toBe("Dados pessoais excluídos");
    expect(receipt?.detail).not.toContain("Ana");
  });

  it("conta desativada no Bitrix24 não volta ao atualizar a lista; quem volta a ficar ativo reaparece", async () => {
    const person = seedBitrixPerson("40", "Carla Saiu");
    upsertBitrixPeople([{ bitrixUserId: "40", name: "Carla Saiu", email: "carla@empresa.com.br", active: false }]);
    expect((await erase(person.id, "Carla Saiu", await admin())).status).toBe(200);
    expect(findPersonByBitrixId("40")).toMatchObject({ name: "Pessoa removida", email: null, active: false });
    upsertBitrixPeople([{ bitrixUserId: "40", name: "Carla Saiu", email: "carla@empresa.com.br", active: false }]);
    expect(findPersonByBitrixId("40")).toMatchObject({ name: "Pessoa removida", email: null });
    upsertBitrixPeople([{ bitrixUserId: "40", name: "Carla Voltou", email: "carla@empresa.com.br", active: true }]);
    expect(findPersonByBitrixId("40")).toMatchObject({ name: "Carla Voltou", active: true });
  });
});

describe("retenção", () => {
  const MONTH = 30 * 24 * 3_600_000;

  it("exclui só o que passou do prazo, com registro, e respeita o prazo escolhido", () => {
    setRetentionMonths(12);
    const old = closedJourney("Antiga", new Date(Date.now() - 13 * MONTH).toISOString());
    const recent = closedJourney("Recente", new Date(Date.now() - 2 * MONTH).toISOString());
    const open = seedJourney({ person: seedManualPerson("Em andamento"), template: seedTemplate("onboarding"), status: "active" });
    expect(applyRetention(Date.now())).toBe(1);
    expect(getJourney(old.journey.id)).toBeNull();
    expect(findPerson(old.person.id)).toBeNull();
    expect(getJourney(recent.journey.id)).not.toBeNull();
    expect(getJourney(open.id)).not.toBeNull();
    expect(listAudit({ entity: "privacy" })[0]?.action).toBe("Retenção aplicada");
  });

  it("quem ainda trabalha na empresa mantém cadastro e inventário depois que a jornada antiga sai", () => {
    setRetentionMonths(12);
    const person = seedBitrixPerson("50", "Dora Ativa");
    const journey = seedJourney({ person, template: seedTemplate("onboarding"), status: "completed" });
    updateJourney(journey.id, { completedAt: new Date(Date.now() - 13 * MONTH).toISOString() });
    const notebook = insertLedgerItem({ personId: person.id, kind: "equipment", name: "Notebook", detail: "Patrimônio 9", status: "active", source: "onboarding" });
    expect(applyRetention(Date.now())).toBe(1);
    expect(getJourney(journey.id)).toBeNull();
    expect(findPerson(person.id)?.name).toBe("Dora Ativa");
    expect(getLedgerItem(notebook.id)?.status).toBe("active");
  });

  it("uma vez por dia: cópia de segurança cifrada, retenção e limpeza", async () => {
    const now = Date.now();
    await runDataCareIfDue(now);
    expect(listBackups()).toHaveLength(1);
    expect(getSyncState().dataCareAt).toBeTruthy();
    await runDataCareIfDue(now + 3_600_000);
    expect(listBackups()).toHaveLength(1);
    await runDataCareIfDue(now + 25 * 3_600_000);
    expect(listBackups()).toHaveLength(2);
  });
});

describe("cópia de segurança", () => {
  it("é cifrada, com permissão fechada, e restaura com a mesma chave", async () => {
    const { person } = closedJourney("Restaurar Teste");
    const backup = await createBackup();
    expect(backup.name).toMatch(/^nexo-.*\.sqlite\.enc$/);
    const bytes = readFileSync(backup.path);
    expect(bytes.includes(Buffer.from("SQLite format 3"))).toBe(false);
    expect(bytes.includes(Buffer.from("Restaurar Teste"))).toBe(false);
    // Nada em texto sobra na pasta durante ou depois.
    expect(readdirSync(join(env.dataDir, "backups")).filter((name) => !name.endsWith(".enc"))).toEqual([]);

    const key = readFileSync(join(env.dataDir, ".nexo-key"), "utf8").trim();
    const restored = join(env.dataDir, "restaurado.sqlite");
    await decryptBackupFile(backup.path, restored, key);
    const db = openDb(restored);
    try {
      expect(db.prepare("SELECT name FROM people WHERE id = ?").get<{ name: string }>(person.id)?.name).toBe("Restaurar Teste");
    } finally {
      db.close();
    }
  });

  it("com a chave errada, não restaura e não deixa arquivo", async () => {
    closedJourney();
    const backup = await createBackup();
    const target = join(env.dataDir, "errado.sqlite");
    await expect(decryptBackupFile(backup.path, target, "0".repeat(64))).rejects.toThrow();
    expect(existsSync(target)).toBe(false);
  });

  it("descarta as cópias vencidas", async () => {
    const first = await createBackup(Date.parse("2026-10-01T03:00:00Z"));
    const second = await createBackup(Date.parse("2026-11-01T03:00:00Z"));
    rotateBackups(Date.parse("2026-11-02T03:00:00Z"));
    expect(listBackups().map((item) => item.name)).toEqual([second.name]);
    expect(existsSync(first.path)).toBe(false);
  });

  it("a administração baixa o arquivo cifrado, e o download fica registrado", async () => {
    const result = await call(backupRoute, { path: "/api/backup", token: await admin() });
    expect(result.status).toBe(200);
    expect(result.headers.get("content-type")).toBe("application/octet-stream");
    expect(result.headers.get("content-disposition")).toMatch(/attachment; filename="nexo-.*\.sqlite\.enc"/);
    expect(listAudit({ entity: "privacy" })[0]?.action).toBe("Cópia de segurança baixada");
  });
});
