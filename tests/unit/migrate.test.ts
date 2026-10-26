import { afterEach, describe, expect, it } from "vitest";
import { migrate } from "@/server/db/migrate";
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
});
