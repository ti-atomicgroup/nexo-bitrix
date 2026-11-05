import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { audit, listAudit } from "@/server/db/repos/audit";
import { insertDetectionIfNew, getDetection } from "@/server/db/repos/detections";
import { insertLedgerItem, getLedgerItem, updateLedgerItem } from "@/server/db/repos/ledger";
import { createPerson, findPerson, setPersonInvite, upsertBitrixPeople, findPersonByBitrixId } from "@/server/db/repos/people";
import { getJourney, updateJourney } from "@/server/db/repos/journeys";
import { setWebhookRecord } from "@/server/db/repos/settings";
import { createUser } from "@/server/db/repos/users";
import { migrate, MIGRATIONS } from "@/server/db/migrate";
import { getDb } from "@/server/db";
import { openDb } from "@/server/db/driver";
import { join } from "node:path";
import { resetInstanceKeyForTests } from "@/server/security/crypto";
import { openField, sealField } from "@/server/security/fields";
import { seedJourney, seedManualPerson, seedTemplate } from "../../api/support/seed";
import { useTestDb } from "../../support/db";

let dataDir: string;
let cleanup: () => void;
beforeEach(() => {
  resetInstanceKeyForTests();
  ({ dataDir, cleanup } = useTestDb());
});
afterEach(() => {
  cleanup();
  resetInstanceKeyForTests();
});

const raw = (table: string, column: string, id: string) => String(getDb().prepare(`SELECT ${column} AS value FROM ${table} WHERE id = ?`).get<{ value: unknown }>(id)?.value);

describe("cifragem de campos", () => {
  it("cifra e abre, e aceita valor antigo em texto", () => {
    const sealed = sealField("Notebook 4471")!;
    expect(sealed).toMatch(/^enc:v1:/);
    expect(sealed).not.toContain("4471");
    expect(openField(sealed)).toBe("Notebook 4471");
    expect(openField("texto antigo")).toBe("texto antigo");
    expect(sealField(sealed)).toBe(sealed);
    expect(sealField(null)).toBeNull();
    expect(sealField("")).toBe("");
    expect(openField(null)).toBeNull();
  });

  it("motivo e dados do inventário não ficam em texto no banco; a leitura continua igual", () => {
    const person = seedManualPerson("Ana");
    const journey = seedJourney({ person, template: seedTemplate("offboarding"), offboardingReason: "involuntary" });
    expect(getDb().prepare("SELECT offboarding_reason AS value FROM journeys WHERE id = ?").get<{ value: unknown }>(journey.id)?.value).toBeNull();
    expect(raw("journeys", "offboarding_reason_sealed", journey.id)).not.toContain("involuntary");
    expect(getJourney(journey.id)?.offboardingReason).toBe("involuntary");

    updateJourney(journey.id, { cancelReason: "Pedido sigiloso", offboardingReason: "voluntary" });
    expect(raw("journeys", "cancel_reason", journey.id)).not.toContain("sigiloso");
    expect(getJourney(journey.id)).toMatchObject({ cancelReason: "Pedido sigiloso", offboardingReason: "voluntary" });

    const item = insertLedgerItem({ personId: person.id, kind: "equipment", name: "Notebook", detail: "Patrimônio 4471", status: "active", source: "manual" });
    expect(raw("ledger_items", "detail", item.id)).not.toContain("4471");
    expect(getLedgerItem(item.id)?.detail).toBe("Patrimônio 4471");
    updateLedgerItem(item.id, { status: "waived", waivedReason: "Doado à pessoa" });
    expect(raw("ledger_items", "waived_reason", item.id)).not.toContain("Doado");
    expect(getLedgerItem(item.id)?.waivedReason).toBe("Doado à pessoa");
  });

  it("e-mail das pessoas e dos candidatos fica cifrado", () => {
    const person = createPerson({ name: "Ana", email: "ana@exemplo.com", source: "crm" });
    expect(raw("people", "email", person.id)).not.toContain("ana@");
    expect(findPerson(person.id)?.email).toBe("ana@exemplo.com");
    setPersonInvite(person.id, { status: "sending", email: "ana2@exemplo.com" });
    expect(raw("people", "email", person.id)).not.toContain("ana2@");
    expect(findPerson(person.id)?.email).toBe("ana2@exemplo.com");
    upsertBitrixPeople([{ bitrixUserId: "9", name: "Bia", email: "bia@exemplo.com", active: true }]);
    const bia = findPersonByBitrixId("9")!;
    expect(raw("people", "email", bia.id)).not.toContain("bia@");
    expect(bia.email).toBe("bia@exemplo.com");
  });

  it("o registro de atividades guarda o texto cifrado e o principal do Bitrix24 usado", () => {
    setWebhookRecord({ encryptedUrl: "v1.a.b.c", portal: "https://e.bitrix24.com.br", owner: { bitrixUserId: "7", name: "Conta Técnica", position: null }, scopes: [], verifiedAt: new Date().toISOString() });
    const user = createUser({ name: "Rita", email: "rita@empresa.com.br", passwordHash: "x", role: "rh", bitrixUserId: "21" });
    audit({ actorType: "user", actorId: user.id, actorName: user.name, action: "Jornada cancelada", entity: "journey", entityId: "j1", detail: { text: "Motivo: assunto sigiloso" } });
    const stored = getDb().prepare("SELECT detail, actor_bitrix_id, bitrix_principal_id, bitrix_principal_name FROM audit_log ORDER BY id DESC LIMIT 1").get<Record<string, unknown>>()!;
    expect(String(stored.detail)).not.toContain("sigiloso");
    expect(stored).toMatchObject({ actor_bitrix_id: "21", bitrix_principal_id: "7", bitrix_principal_name: "Conta Técnica" });
    const [entry] = listAudit({ entity: "journey", entityId: "j1" });
    expect(entry).toMatchObject({ actor: "Rita", detail: "Motivo: assunto sigiloso", via: "Conta Técnica (Bitrix24 #7)", actorBitrixId: "21" });
  });
});

describe("migração dos dados que já existem", () => {
  it("sela os valores antigos, uma vez só, sem perder nada", () => {
    // Banco antigo: migrado até a 7 (esquema novo) e com valores em texto, como uma instalação da v2.
    const file = join(dataDir, "antigo.sqlite");
    const db = openDb(file);
    try {
      migrate(db, MIGRATIONS.filter((item) => item.id <= 7));
      const now = new Date().toISOString();
      db.prepare("INSERT INTO people (id, name, email, source, updated_at) VALUES ('p1', 'Ana', 'ana@exemplo.com', 'manual', ?)").run(now);
      db.prepare(
        "INSERT INTO journeys (id, kind, person_id, template_id, template_version, template_snapshot, anchor_date, status, offboarding_reason, cancel_reason, source_type, created_at, updated_at) VALUES ('j1', 'offboarding', 'p1', 't', 1, '{}', '2026-11-03', 'cancelled', 'involuntary', 'Motivo antigo', 'manual', ?, ?)",
      ).run(now, now);
      db.prepare("INSERT INTO ledger_items (id, person_id, kind, name, detail, status, source, created_at, updated_at) VALUES ('l1', 'p1', 'equipment', 'Notebook', 'Patrimônio 4471', 'active', 'manual', ?, ?)").run(now, now);
      db.prepare("INSERT INTO audit_log (at, actor_type, action, detail) VALUES (?, 'system', 'Antigo', ?)").run(now, JSON.stringify({ text: "Motivo antigo" }));

      expect(migrate(db, MIGRATIONS, { dataDir })).toEqual(expect.arrayContaining([8]));
      const journey = db.prepare("SELECT offboarding_reason, offboarding_reason_sealed, cancel_reason FROM journeys WHERE id = 'j1'").get<Record<string, string | null>>()!;
      expect(journey.offboarding_reason).toBeNull();
      expect(openField(journey.offboarding_reason_sealed)).toBe("involuntary");
      expect(journey.cancel_reason).toMatch(/^enc:v1:/);
      expect(openField(journey.cancel_reason)).toBe("Motivo antigo");
      expect(db.prepare("SELECT detail FROM ledger_items").get<{ detail: string }>()?.detail).toMatch(/^enc:v1:/);
      expect(db.prepare("SELECT email FROM people").get<{ email: string }>()?.email).toMatch(/^enc:v1:/);
      expect(db.prepare("SELECT detail FROM audit_log").get<{ detail: string }>()?.detail).toMatch(/^enc:v1:/);
      expect(migrate(db, MIGRATIONS, { dataDir })).toEqual([]);
    } finally {
      db.close();
    }
  });
});

describe("detecções do CRM", () => {
  it("o e-mail do candidato fica cifrado", () => {
    const db = getDb();
    const now = new Date().toISOString();
    db.prepare("INSERT INTO triggers (id, name, journey_kind, entity_type_id, stage_id, template_id, created_at, updated_at) VALUES ('t1', 'Contratados', 'onboarding', 2, 'WON', 'x', ?, ?)").run(now, now);
    const detection = insertDetectionIfNew({ triggerId: "t1", entityTypeId: 2, entityId: 5, title: "Ana", personName: "Ana", personEmail: "ana@exemplo.com", bitrixUserId: null, suggestedDate: null, crmUrl: null })!;
    expect(raw("detections", "person_email", detection.id)).not.toContain("ana@");
    expect(getDetection(detection.id)?.personEmail).toBe("ana@exemplo.com");
  });
});
