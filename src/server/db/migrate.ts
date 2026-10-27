import "server-only";
import type { Db } from "./driver";
import { migration001 } from "./migrations/001-init";
import { migration002 } from "./migrations/002-documents";

export interface Migration {
  id: number;
  name: string;
  sql: string;
}

/** Ordem de aplicação. Novas migrações entram no fim, com id crescente; nunca editar uma já publicada. */
export const MIGRATIONS: Migration[] = [migration001, migration002];

export function migrate(db: Db, migrations: Migration[] = MIGRATIONS): number[] {
  db.exec("CREATE TABLE IF NOT EXISTS schema_migrations (id INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)");
  const applied = new Set(db.prepare("SELECT id FROM schema_migrations").all<{ id: number }>().map((row) => Number(row.id)));
  const done: number[] = [];
  for (const migration of [...migrations].sort((a, b) => a.id - b.id)) {
    if (applied.has(migration.id)) continue;
    db.tx(() => {
      db.exec(migration.sql);
      db.prepare("INSERT INTO schema_migrations (id, name, applied_at) VALUES (?, ?, ?)").run(migration.id, migration.name, new Date().toISOString());
    });
    done.push(migration.id);
  }
  return done;
}
