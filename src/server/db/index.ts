import "server-only";
import { join } from "node:path";
import { resolveDataDir } from "../runtime/data-dir";
import { openDb, type Db } from "./driver";
import { migrate } from "./migrate";

const DB_KEY = Symbol.for("nexo.db");
type DbGlobal = typeof globalThis & { [DB_KEY]?: { db: Db; dataDir: string } };

/**
 * Conexão única e preguiçosa, compartilhada por rotas, instrumentation e motor (mesmo que o bundler duplique módulos).
 * Nunca é aberta na importação: o build pré-renderiza páginas e não pode tocar no disco de dados.
 */
export function getDb(): Db {
  const global = globalThis as DbGlobal;
  const existing = global[DB_KEY];
  if (existing) return existing.db;
  const dataDir = resolveDataDir().path;
  const db = openDb(join(dataDir, "nexo.sqlite"));
  migrate(db);
  global[DB_KEY] = { db, dataDir };
  return db;
}

export function getDataDir(): string {
  const global = globalThis as DbGlobal;
  return global[DB_KEY]?.dataDir ?? resolveDataDir().path;
}

/** Para testes: usa um banco já aberto (ex.: em pasta temporária) como conexão global. */
export function setDbForTests(db: Db | null, dataDir = ""): void {
  const global = globalThis as DbGlobal;
  if (db) {
    migrate(db);
    global[DB_KEY] = { db, dataDir };
  } else {
    delete global[DB_KEY];
  }
}
