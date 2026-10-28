import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb } from "@/server/db/driver";
import { migrate } from "@/server/db/migrate";
import { migration001 } from "@/server/db/migrations/001-init";
import { migration002 } from "@/server/db/migrations/002-documents";
import { useTestDb } from "../support/db";

let cleanup: (() => void) | undefined;
afterEach(() => cleanup?.());

describe("migrações", () => {
  it("cria todas as tabelas do esquema inicial", () => {
    const test = useTestDb();
    cleanup = test.cleanup;
    const tables = test.db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
      .all<{ name: string }>()
      .map((row) => row.name);
    expect(tables).toEqual([
      "api_log",
      "app_users",
      "audit_log",
      "detections",
      "documents",
      "jobs",
      "journey_activities",
      "journeys",
      "leases",
      "ledger_items",
      "operations",
      "people",
      "schema_migrations",
      "sessions",
      "settings",
      "template_activities",
      "template_stages",
      "templates",
      "triggers",
    ]);
  });

  it("é idempotente: reaplicar não faz nada", () => {
    const test = useTestDb();
    cleanup = test.cleanup;
    expect(migrate(test.db)).toEqual([]);
  });

  it("liga chaves estrangeiras (apagar trilha apaga etapas)", () => {
    const test = useTestDb();
    cleanup = test.cleanup;
    const now = new Date().toISOString();
    test.db.prepare("INSERT INTO templates (id, kind, name, created_at, updated_at) VALUES ('t1','onboarding','Geral',?,?)").run(now, now);
    test.db.prepare("INSERT INTO template_stages (id, template_id, position, name, release_mode) VALUES ('s1','t1',0,'Antes','start')").run();
    test.db.prepare("DELETE FROM templates WHERE id = 't1'").run();
    expect(test.db.prepare("SELECT COUNT(*) AS total FROM template_stages").get()).toEqual({ total: 0 });
  });

  it("002: a atividade inicial \"Envie seus documentos\" passa a pedir a lista padrão", () => {
    const dataDir = mkdtempSync(join(tmpdir(), "nexo-migrate-"));
    const db = openDb(join(dataDir, "nexo.sqlite"));
    cleanup = () => {
      db.close();
      rmSync(dataDir, { recursive: true, force: true });
    };
    migrate(db, [migration001]);
    const now = new Date().toISOString();
    db.prepare("INSERT INTO templates (id, kind, name, created_at, updated_at) VALUES ('t1','onboarding','Geral',?,?)").run(now, now);
    db.prepare("INSERT INTO template_stages (id, template_id, position, name, release_mode) VALUES ('s1','t1',0,'Antes','start')").run();
    const insert = db.prepare("INSERT INTO template_activities (id, stage_id, position, title, role, visibility) VALUES (?, 's1', ?, ?, ?, ?)");
    insert.run("a1", 0, "Envie seus documentos", "colaborador", "employee");
    insert.run("a2", 1, "Envie seus documentos", "rh", "team");
    expect(migrate(db)).toEqual([2, 3, 4, 5, 6]);
    const documents = (id: string) => JSON.parse(String(db.prepare("SELECT documents FROM template_activities WHERE id = ?").get<{ documents: string }>(id)?.documents));
    expect(documents("a1").map((item: { key: string }) => item.key)).toEqual(["documento-com-foto", "comprovante-residencia", "dados-bancarios"]);
    expect(documents("a2")).toEqual([]);
  });

  it("003: data-limite em \"Primeiras semanas\" e texto novo de \"Envie seus documentos\"", () => {
    const dataDir = mkdtempSync(join(tmpdir(), "nexo-migrate-"));
    const db = openDb(join(dataDir, "nexo.sqlite"));
    cleanup = () => {
      db.close();
      rmSync(dataDir, { recursive: true, force: true });
    };
    migrate(db, [migration001, migration002]);
    const now = new Date().toISOString();
    db.prepare("INSERT INTO templates (id, kind, name, created_at, updated_at) VALUES ('t1','onboarding','Geral',?,?)").run(now, now);
    const stage = db.prepare("INSERT INTO template_stages (id, template_id, position, name, release_mode) VALUES (?, 't1', ?, ?, ?)");
    stage.run("s1", 0, "Antes", "start");
    stage.run("s2", 1, "Primeiras semanas", "after_previous");
    stage.run("s3", 2, "Outra", "after_previous");
    db.prepare("INSERT INTO template_activities (id, stage_id, position, title, role, visibility, instructions, documents) VALUES ('a1','s1',0,'Envie seus documentos','colaborador','employee',?, '[{\"key\":\"rg\"}]')").run(
      "Envie ao RH os documentos pedidos na mensagem de boas-vindas. Se tiver qualquer dúvida, fale com o RH.",
    );
    expect(migrate(db)).toEqual([3, 4, 5, 6]);
    const latest = (id: string) => db.prepare("SELECT release_latest_offset_days AS days, release_offset_unit AS unit FROM template_stages WHERE id = ?").get(id);
    expect(latest("s2")).toEqual({ days: 2, unit: "business" });
    expect(latest("s3")).toMatchObject({ days: null });
    expect(String(db.prepare("SELECT instructions FROM template_activities WHERE id = 'a1'").get<{ instructions: string }>()?.instructions)).toContain("por aqui mesmo");
  });
});
