import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as meRoute } from "@/app/api/me/route";
import { GET as backupRoute } from "@/app/api/backup/route";
import { GET as peopleRoute } from "@/app/api/privacy/people/route";
import { POST as eraseRoute } from "@/app/api/privacy/people/[personId]/erase/route";
import { GET as exportRoute } from "@/app/api/privacy/people/[personId]/route";
import { getDb } from "@/server/db";
import { audit, listAudit } from "@/server/db/repos/audit";
import { openDb } from "@/server/db/driver";
import { getDetection, insertDetectionIfNew } from "@/server/db/repos/detections";
import { enqueueJob } from "@/server/db/repos/jobs";
import { updateJourney } from "@/server/db/repos/journeys";
import { getLedgerItem, insertLedgerItem } from "@/server/db/repos/ledger";
import { findPerson, upsertBitrixPeople } from "@/server/db/repos/people";
import { countSecurityEvents, recordSecurityEvent, MAX_SECURITY_EVENTS } from "@/server/db/repos/security-events";
import { getDefaults, setDefaults, setRetentionMonths } from "@/server/db/repos/settings";
import { findUserByEmail, findUserById, updateUser } from "@/server/db/repos/users";
import { migrate, MIGRATIONS } from "@/server/db/migrate";
import { applyRetention, runDataCareIfDue } from "@/server/engine/data-care";
import { createBackup, listBackups, rotateBackups } from "@/server/runtime/backup";
import { resetInstanceKeyForTests } from "@/server/security/crypto";
import { rateLimit, resetRateLimitsForTests } from "@/server/security/rate-limit";
import { login } from "@/server/services/auth";
import { updateAppUser } from "@/server/services/users";
import { encryptBackupFile } from "../../scripts/lib/backup-file.mjs";
import { isBlockedAddress } from "../../scripts/lib/bitrix-policy.mjs";
import type { ErasureReceiptDTO, PersonExportDTO, PrivacyPersonDTO } from "@/shared/contracts";
import { useTestDb } from "../support/db";
import { call, PASSWORD, seedBitrixPerson, seedJourney, seedManualPerson, seedTemplate, seedUser, type ApiErrorBody } from "./support/seed";

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

const MONTH = 30 * 24 * 3_600_000;
const adminToken = async () => (await seedUser({ role: "admin" })).token;
/** Tudo o que está em disco para este banco, como um `strings` veria. */
function databaseBytes(dir = env.dataDir, base = "nexo.sqlite"): Buffer {
  return Buffer.concat(readdirSync(dir).filter((name) => name.startsWith(base)).map((name) => readFileSync(join(dir, name))));
}
const erase = (personId: string, confirmName: string, token: string) =>
  call<ErasureReceiptDTO & ApiErrorBody, "personId">(eraseRoute, { path: "/x", params: { personId }, token, body: { confirmName } });

describe("texto antigo no arquivo do banco", () => {
  it("cifrar os dados de uma instalação antiga não deixa o texto no arquivo", () => {
    const file = join(env.dataDir, "antigo.sqlite");
    const db = openDb(file);
    try {
      migrate(db, MIGRATIONS.filter((item) => item.id <= 7));
      const now = new Date().toISOString();
      for (let index = 0; index < 200; index++) {
        db.prepare("INSERT INTO people (id, name, email, source, updated_at) VALUES (?, ?, ?, 'manual', ?)").run(`p${index}`, `Pessoa ${index}`, `alvo${index}@exemplo.test`, now);
      }
      db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
      expect(databaseBytes(env.dataDir, "antigo.sqlite").includes(Buffer.from("alvo100@exemplo.test"))).toBe(true);
      migrate(db, MIGRATIONS, { dataDir: env.dataDir });
      expect(databaseBytes(env.dataDir, "antigo.sqlite").includes(Buffer.from("alvo100@exemplo.test"))).toBe(false);
    } finally {
      db.close();
    }
  });

  it("excluir uma pessoa não deixa o nome no arquivo", async () => {
    const person = seedManualPerson("Nome Bem Distinto");
    seedJourney({ person, template: seedTemplate("onboarding"), status: "cancelled" });
    getDb().exec("PRAGMA wal_checkpoint(TRUNCATE)");
    expect(databaseBytes().includes(Buffer.from("Nome Bem Distinto"))).toBe(true);
    expect((await erase(person.id, "Nome Bem Distinto", await adminToken())).status).toBe(200);
    expect(databaseBytes().includes(Buffer.from("Nome Bem Distinto"))).toBe(false);
  });
});

describe("candidatos só em detecções do CRM", () => {
  const trigger = () => {
    const now = new Date().toISOString();
    getDb().prepare("INSERT OR IGNORE INTO triggers (id, name, journey_kind, entity_type_id, stage_id, template_id, created_at, updated_at) VALUES ('t1', 'Contratados', 'onboarding', 2, 'WON', 'x', ?, ?)").run(now, now);
  };
  const detect = (entityId: number, name: string, email: string) => insertDetectionIfNew({ triggerId: "t1", entityTypeId: 2, entityId, title: `Negócio de ${name}`, personName: name, personEmail: email, bitrixUserId: null, suggestedDate: null, crmUrl: "https://empresa.bitrix24.com.br/crm/1/" })!;

  it("aparecem na busca, são exportados e excluídos, sem perder a marca que evita detectar de novo", async () => {
    trigger();
    const detection = detect(5, "Clara Candidata", "clara@exemplo.test");
    audit({ actorType: "user", actorName: "Rita", action: "Detecção dispensada", entity: "trigger", entityId: "t1", detail: { text: detection.title } });
    const token = await adminToken();
    const found = await call<PrivacyPersonDTO[]>(peopleRoute, { path: "/api/privacy/people?query=clara", token });
    expect(found.body).toHaveLength(1);
    const subject = found.body[0]!;
    expect(subject).toMatchObject({ name: "Clara Candidata", email: "clara@exemplo.test", source: "crm", journeys: 0 });

    const exported = await call<PersonExportDTO, "personId">(exportRoute, { path: "/x", params: { personId: subject.id }, token });
    expect(exported.body.person).toMatchObject({ name: "Clara Candidata", email: "clara@exemplo.test" });

    expect((await erase(subject.id, "Clara Candidata", token)).status).toBe(200);
    expect(getDetection(detection.id)).toMatchObject({ title: "Dados removidos", personName: null, personEmail: null, crmUrl: null, status: "dismissed" });
    expect(listAudit({ entity: "trigger", entityId: "t1" })[0]?.detail).toBe("");
    expect((await call<PrivacyPersonDTO[]>(peopleRoute, { path: "/api/privacy/people?query=clara", token })).body).toEqual([]);
    expect(databaseBytes().includes(Buffer.from("clara@exemplo.test"))).toBe(false);
  });

  it("quem tem jornada manual e detecção dispensada perde as duas ao excluir", async () => {
    trigger();
    const person = seedManualPerson("Ana Dupla");
    getDb().prepare("UPDATE people SET email = ? WHERE id = ?").run("ana.dupla@exemplo.test", person.id);
    const detection = detect(6, "Ana D.", "ana.dupla@exemplo.test");
    seedJourney({ person, template: seedTemplate("onboarding"), status: "cancelled" });
    expect((await erase(person.id, "Ana Dupla", await adminToken())).status).toBe(200);
    expect(getDetection(detection.id)?.personEmail).toBeNull();
  });

  it("a retenção limpa as detecções antigas que não viraram jornada, e não as pendentes", () => {
    trigger();
    setRetentionMonths(12);
    const old = detect(7, "Antiga", "antiga@exemplo.test");
    const pending = detect(8, "Pendente", "pendente@exemplo.test");
    getDb().prepare("UPDATE detections SET status = 'dismissed', detected_at = ? WHERE id = ?").run(new Date(Date.now() - 13 * MONTH).toISOString(), old.id);
    getDb().prepare("UPDATE detections SET detected_at = ? WHERE id = ?").run(new Date(Date.now() - 13 * MONTH).toISOString(), pending.id);
    applyRetention(Date.now());
    expect(getDetection(old.id)?.personEmail).toBeNull();
    expect(getDetection(pending.id)?.personEmail).toBe("pendente@exemplo.test");
  });
});

describe("fila", () => {
  it("o texto dos trabalhos fica cifrado no banco", () => {
    enqueueJob({ kind: "task.comment", payload: { activityId: "a1", message: "Motivo muito sigiloso" } });
    const raw = getDb().prepare("SELECT payload FROM jobs").get<{ payload: string }>()!;
    expect(raw.payload).not.toContain("sigiloso");
    expect(enqueueJob({ kind: "task.comment", dedupeKey: "x", payload: { message: "Lido de volta" } }).payload.message).toBe("Lido de volta");
  });

  it("a exclusão também tira avisos que citam a jornada só na chave ou a conta da pessoa", async () => {
    const person = seedBitrixPerson("60", "Eva Aviso");
    upsertBitrixPeople([{ bitrixUserId: "60", name: "Eva Aviso", active: false }]);
    const journey = seedJourney({ person, template: seedTemplate("onboarding"), status: "cancelled" });
    enqueueJob({ kind: "im.notify", dedupeKey: `notify:stage:${journey.id}:0`, payload: { userId: "99", message: "Sua jornada avançou" } });
    enqueueJob({ kind: "im.notify", payload: { userId: "60", message: "Outro aviso" } });
    enqueueJob({ kind: "im.notify", payload: { userId: "61", message: "De outra pessoa" } });
    expect((await erase(person.id, "Eva Aviso", await adminToken())).status).toBe(200);
    const left = getDb().prepare("SELECT COUNT(*) AS total FROM jobs").get<{ total: number }>()?.total;
    expect(left).toBe(1);
  });
});

describe("quem também tem acesso ao Nexo, ou é responsável padrão", () => {
  it("com acesso ativo, a exclusão pede para desativar antes", async () => {
    const person = seedBitrixPerson("70", "Rita Saindo");
    upsertBitrixPeople([{ bitrixUserId: "70", name: "Rita Saindo", email: "rita.saindo@empresa.com.br", active: false }]);
    await seedUser({ role: "rh", email: "rita.saindo@empresa.com.br", name: "Rita Saindo" });
    const result = await erase(person.id, "Rita Saindo", await adminToken());
    expect(result.status).toBe(409);
    expect(result.body.error.code).toBe("ACCESS_ACTIVE");
  });

  it("com acesso desativado, some nome, e-mail e o texto do histórico desse acesso", async () => {
    const person = seedBitrixPerson("71", "Rita Saiu");
    upsertBitrixPeople([{ bitrixUserId: "71", name: "Rita Saiu", email: "rita.saiu@empresa.com.br", active: false }]);
    const { user } = await seedUser({ role: "rh", email: "rita.saiu@empresa.com.br", name: "Rita Saiu" });
    updateUser(user.id, { active: false, bitrixUserId: "71" });
    audit({ actorType: "user", actorId: user.id, actorName: "Rita Saiu", action: "Trilha criada", entity: "template", entityId: "t", detail: { text: "Entrada" } });
    audit({ actorType: "system", action: "Conta do Bitrix24 vinculada", entity: "user", entityId: user.id, detail: { text: "Rita Saiu foi ligado" } });
    expect((await erase(person.id, "Rita Saiu", await adminToken())).status).toBe(200);
    expect(findUserByEmail("rita.saiu@empresa.com.br")).toBeNull();
    expect(findUserById(user.id)).toMatchObject({ name: "Acesso removido", active: false, bitrixUserId: null });
    expect(listAudit({ entity: "user", entityId: user.id })[0]?.detail).toBe("");
    expect(listAudit({ entity: "template", entityId: "t" })[0]?.actor).toBe("Acesso removido");
    expect(databaseBytes().includes(Buffer.from("rita.saiu@empresa.com.br"))).toBe(false);
  });

  it("deixa de ser responsável padrão", async () => {
    const person = seedBitrixPerson("72", "Gil Padrão");
    upsertBitrixPeople([{ bitrixUserId: "72", name: "Gil Padrão", active: false }]);
    setDefaults({ ti: { bitrixUserId: "72", name: "Gil Padrão", position: null }, rh: { bitrixUserId: "73", name: "Outra", position: null } });
    expect((await erase(person.id, "Gil Padrão", await adminToken())).status).toBe(200);
    expect(getDefaults()).toEqual({ rh: { bitrixUserId: "73", name: "Outra", position: null } });
  });
});

describe("retenção com inventário em aberto", () => {
  it("não apaga o que ainda não voltou, nem de quem nunca teve conta", () => {
    setRetentionMonths(12);
    const person = seedManualPerson("Sem Conta");
    const journey = seedJourney({ person, template: seedTemplate("onboarding"), status: "completed" });
    updateJourney(journey.id, { completedAt: new Date(Date.now() - 13 * MONTH).toISOString() });
    const notebook = insertLedgerItem({ personId: person.id, kind: "equipment", name: "Notebook", status: "active", source: "manual" });
    expect(applyRetention(Date.now())).toBe(1);
    expect(getLedgerItem(notebook.id)?.status).toBe("active");
    expect(findPerson(person.id)?.name).toBe("Sem Conta");
  });
});

describe("cópia de segurança", () => {
  it("falha no meio não deixa arquivo com cara de cópia válida, e o erro real aparece", async () => {
    const target = join(env.dataDir, "nexo-teste.sqlite.enc");
    await expect(encryptBackupFile(join(env.dataDir, "nao-existe.sqlite"), target, "a".repeat(64))).rejects.toMatchObject({ code: "ENOENT" });
    expect(readdirSync(env.dataDir).filter((name) => name.includes("nexo-teste"))).toEqual([]);
  });

  it("o descarte apaga restos de cópia interrompida e roda mesmo se a cópia do dia falhar", async () => {
    const old = await createBackup(Date.parse("2020-01-01T03:00:00Z"));
    const folder = join(env.dataDir, "backups");
    writeFileSync(join(folder, ".retrato-velho.tmp"), "texto em claro");
    writeFileSync(join(folder, "nexo-x.sqlite.enc.parcial"), "pela metade");
    const { utimesSync } = await import("node:fs");
    for (const name of [".retrato-velho.tmp", "nexo-x.sqlite.enc.parcial"]) utimesSync(join(folder, name), new Date("2020-01-01"), new Date("2020-01-01"));
    rotateBackups(Date.now());
    expect(existsSync(old.path)).toBe(false);
    expect(readdirSync(folder)).toEqual([]);

    const again = await createBackup(Date.parse("2020-01-01T03:00:00Z"));
    vi.spyOn(getDb(), "exec").mockImplementation(() => {
      throw new Error("disco cheio");
    });
    await runDataCareIfDue(Date.now());
    expect(existsSync(again.path)).toBe(false);
  });

  it("baixar sempre gera uma cópia nova: excluir e baixar em seguida não leva a pessoa junto", async () => {
    const token = await adminToken();
    expect((await call(backupRoute, { path: "/api/backup", token })).status).toBe(200);
    const first = listBackups().length;
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect((await call(backupRoute, { path: "/api/backup", token })).status).toBe(200);
    expect(listBackups().length).toBe(first + 1);
    let last = 200;
    for (let attempt = 0; attempt < 8 && last === 200; attempt++) last = (await call(backupRoute, { path: "/api/backup", token })).status;
    expect(last).toBe(429);
  });
});

describe("limites e monitoramento", () => {
  it("inundar com e-mails aleatórios de várias origens não tranca o login de quem tem a senha certa", async () => {
    const { user } = await seedUser({ email: "rita@empresa.com.br" });
    const now = Date.now();
    for (let attempt = 0; attempt < 305; attempt++) {
      rateLimit(`login-origin:ip${attempt % 11}`, { limit: 1000, windowMs: 1000 }, now);
    }
    for (let origin = 0; origin < 11; origin++) {
      for (let attempt = 0; attempt < 30; attempt++) {
        await login({ email: `aleatorio${origin}-${attempt}@exemplo.test`, password: "x" }, now, `10.0.0.${origin}`).catch(() => undefined);
      }
    }
    await expect(login({ email: "rita@empresa.com.br", password: PASSWORD }, now, "200.1.1.1")).resolves.toMatchObject({ me: { user: { id: user.id } } });
  }, 120_000);

  it("redefinir a senha libera as tentativas na hora", async () => {
    const { user } = await seedUser({ email: "rita@empresa.com.br" });
    const admin = await seedUser({ role: "admin" });
    const now = Date.now();
    for (let attempt = 0; attempt < 5; attempt++) await login({ email: "rita@empresa.com.br", password: "errada-000" }, now).catch(() => undefined);
    await expect(login({ email: "rita@empresa.com.br", password: PASSWORD }, now)).rejects.toMatchObject({ code: "LOGIN_LOCKED" });
    await updateAppUser(user.id, { resetPassword: "senha-nova-456" }, { type: "user", id: admin.user.id, name: admin.user.name });
    await expect(login({ email: "rita@empresa.com.br", password: "senha-nova-456" }, now)).resolves.toBeTruthy();
  });

  it("eventos têm teto: inundar não enche o disco, e o que é recente fica", () => {
    for (let attempt = 0; attempt < MAX_SECURITY_EVENTS + 300; attempt++) recordSecurityEvent("rate_limited", { origin: "6.6.6.6" });
    const total = Number(getDb().prepare("SELECT COUNT(*) AS total FROM security_events").get<{ total: number }>()?.total);
    expect(total).toBeLessThanOrEqual(MAX_SECURITY_EVENTS + 200);
    expect(countSecurityEvents(new Date(Date.now() - 60_000).toISOString()).rate_limited).toBeGreaterThan(0);
  });

  it("relógio que volta para trás não prolonga o bloqueio", () => {
    const rule = { limit: 2, windowMs: 1000 };
    rateLimit("k", rule, 100_000);
    rateLimit("k", rule, 100_001);
    expect(rateLimit("k", rule, 100_002).allowed).toBe(false);
    expect(rateLimit("k", rule, 50_000).allowed).toBe(true);
  });

  it("endereço IPv4 embutido no formato antigo de IPv6 também é bloqueado", () => {
    expect(isBlockedAddress("::127.0.0.1")).toBe(true);
    expect(isBlockedAddress("::a9fe:a9fe")).toBe(true);
  });
});

describe("cookie vencido", () => {
  it("clicar num link externo para a API não derruba a sessão de quem está no Nexo", async () => {
    const { user } = await seedUser();
    const { issueSession } = await import("@/server/auth/sessions");
    const { token } = issueSession(user, Date.now(), "cookie");
    const navigation = await call(meRoute, { path: "/api/me", headers: { cookie: `__Host-nexo_session=${token}`, "sec-fetch-site": "cross-site", "sec-fetch-dest": "document" } });
    expect(navigation.status).toBe(401);
    expect(navigation.headers.getSetCookie()).toEqual([]);
  });
});

