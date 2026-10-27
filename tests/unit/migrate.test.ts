import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb } from "@/server/db/driver";
import { migrate } from "@/server/db/migrate";
import { migration001 } from "@/server/db/migrations/001-init";
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
    expect(migrate(db)).toEqual([2]);
    const documents = (id: string) => JSON.parse(String(db.prepare("SELECT documents FROM template_activities WHERE id = ?").get<{ documents: string }>(id)?.documents));
    expect(documents("a1").map((item: { key: string }) => item.key)).toEqual(["documento-com-foto", "comprovante-residencia", "dados-bancarios"]);
    expect(documents("a2")).toEqual([]);
  });
});
