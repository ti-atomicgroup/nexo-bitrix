import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDb } from "@/server/db/driver";
import { migrate, MIGRATIONS } from "@/server/db/migrate";
import { resetInstanceKeyForTests } from "@/server/security/crypto";
import { openField } from "@/server/security/fields";
import { useTestDb } from "../support/db";

let env: ReturnType<typeof useTestDb>;
beforeEach(() => {
  resetInstanceKeyForTests();
  env = useTestDb();
});
afterEach(() => {
  env.cleanup();
  resetInstanceKeyForTests();
});

describe("atualização de uma instalação da v2", () => {
  it("encerra as sessões antigas, mantém os acessos e cifra o que estava em texto, de uma vez", () => {
    const db = openDb(join(env.dataDir, "v2.sqlite"));
    try {
      migrate(db, MIGRATIONS.filter((item) => item.id <= 6));
      const now = new Date().toISOString();
      db.prepare("INSERT INTO app_users (id, name, email, password_hash, role, created_at) VALUES ('u1', 'Marina', 'marina@empresa.com.br', 'h', 'admin', ?)").run(now);
      db.prepare("INSERT INTO sessions (token_hash, user_id, created_at, last_seen_at, expires_at) VALUES ('t', 'u1', ?, ?, ?)").run(now, now, "2999-01-01T00:00:00.000Z");
      db.prepare("INSERT INTO people (id, name, email, source, updated_at) VALUES ('p1', 'Ana', 'ana@exemplo.com', 'manual', ?)").run(now);
      db.prepare("INSERT INTO jobs (id, kind, payload, run_at, status, created_at, updated_at) VALUES ('j1', 'task.comment', ?, ?, 'queued', ?, ?)").run(JSON.stringify({ activityId: "a", message: "Motivo" }), now, now, now);

      expect(migrate(db, MIGRATIONS, { dataDir: env.dataDir })).toEqual([7, 8]);

      expect(db.prepare("SELECT COUNT(*) AS total FROM sessions").get<{ total: number }>()?.total).toBe(0);
      expect(db.prepare("SELECT email FROM app_users WHERE id = 'u1'").get<{ email: string }>()?.email).toBe("marina@empresa.com.br");
      expect(openField(db.prepare("SELECT email FROM people").get<{ email: string }>()?.email)).toBe("ana@exemplo.com");
      expect(db.prepare("SELECT payload FROM jobs").get<{ payload: string }>()?.payload).toMatch(/^enc:v1:/);
      expect(db.prepare("PRAGMA integrity_check").get<{ integrity_check: string }>()?.integrity_check).toBe("ok");
    } finally {
      db.close();
    }
  });
});
