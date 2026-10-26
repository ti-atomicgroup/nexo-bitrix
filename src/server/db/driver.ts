import "server-only";
import { createRequire } from "node:module";

export type SqlValue = string | number | bigint | null | Uint8Array;
export type SqlInput = SqlValue | boolean | undefined;
export type SqlParams = SqlInput[] | [Record<string, SqlInput>];

export interface RunResult {
  changes: number;
  lastInsertRowid: number | bigint;
}

export interface Statement {
  run(...params: SqlParams): RunResult;
  get<T = Record<string, unknown>>(...params: SqlParams): T | undefined;
  all<T = Record<string, unknown>>(...params: SqlParams): T[];
}

export type DriverName = "node:sqlite" | "better-sqlite3";

export interface Db {
  readonly driver: DriverName;
  readonly path: string;
  readonly journalMode: string;
  exec(sql: string): void;
  prepare(sql: string): Statement;
  /** Transação síncrona (BEGIN IMMEDIATE). Rejeita funções assíncronas; chamadas aninhadas reutilizam a transação externa. */
  tx<T>(fn: () => T): T;
  close(): void;
}

interface RawStatement {
  run(...params: unknown[]): { changes: number | bigint; lastInsertRowid: number | bigint };
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
}

interface RawDatabase {
  exec(sql: string): void;
  prepare(sql: string): RawStatement;
  close(): void;
}

function normalize(value: SqlInput): SqlValue {
  if (value === undefined) return null;
  if (typeof value === "boolean") return value ? 1 : 0;
  return value;
}

function normalizeParams(params: SqlParams): unknown[] {
  if (params.length === 1 && params[0] !== null && typeof params[0] === "object" && !(params[0] instanceof Uint8Array)) {
    const named = params[0] as Record<string, SqlInput>;
    return [Object.fromEntries(Object.entries(named).map(([key, value]) => [key, normalize(value)]))];
  }
  return (params as SqlInput[]).map(normalize);
}

function plain<T>(row: unknown): T {
  // node:sqlite devolve objetos sem protótipo; convertemos para objetos comuns.
  return row && typeof row === "object" ? ({ ...(row as object) } as T) : (row as T);
}

export function nodeSqliteAvailable(): boolean {
  try {
    return Boolean(process.getBuiltinModule?.("node:sqlite"));
  } catch {
    return false;
  }
}

function openRaw(path: string, preferred?: DriverName): { raw: RawDatabase; driver: DriverName } {
  const tryNode = (): RawDatabase | null => {
    try {
      const sqlite = process.getBuiltinModule?.("node:sqlite") as typeof import("node:sqlite") | undefined;
      if (!sqlite) return null;
      return new sqlite.DatabaseSync(path) as unknown as RawDatabase;
    } catch {
      return null;
    }
  };
  const tryBetter = (): RawDatabase | null => {
    try {
      const require = createRequire(import.meta.url);
      const Better = require("better-sqlite3") as new (file: string) => RawDatabase;
      return new Better(path);
    } catch {
      return null;
    }
  };
  const order: Array<[DriverName, () => RawDatabase | null]> =
    preferred === "better-sqlite3" ? [["better-sqlite3", tryBetter], ["node:sqlite", tryNode]] : [["node:sqlite", tryNode], ["better-sqlite3", tryBetter]];
  for (const [driver, open] of order) {
    const raw = open();
    if (raw) return { raw, driver };
  }
  throw new Error(`Nenhum driver SQLite disponível (Node ${process.version}). Use Node 22.13+ ou instale better-sqlite3.`);
}

export function openDb(path: string, options: { driver?: DriverName } = {}): Db {
  const { raw, driver } = openRaw(path, options.driver);
  const cache = new Map<string, RawStatement>();
  let depth = 0;

  const prepare = (sql: string): Statement => {
    let statement = cache.get(sql);
    if (!statement) {
      statement = raw.prepare(sql);
      cache.set(sql, statement);
    }
    const target = statement;
    return {
      run: (...params) => {
        const result = target.run(...normalizeParams(params));
        return { changes: Number(result.changes), lastInsertRowid: result.lastInsertRowid };
      },
      get: <T,>(...params: SqlParams) => {
        const row = target.get(...normalizeParams(params));
        return row === undefined || row === null ? undefined : plain<T>(row);
      },
      all: <T,>(...params: SqlParams) => target.all(...normalizeParams(params)).map((row) => plain<T>(row)),
    };
  };

  raw.exec("PRAGMA busy_timeout = 5000");
  raw.exec("PRAGMA foreign_keys = ON");
  const requested = prepare("PRAGMA journal_mode = WAL").get<{ journal_mode: string }>();
  let journalMode = String(requested?.journal_mode ?? "").toLowerCase();
  if (journalMode !== "wal") {
    // Alguns sistemas de arquivos (rede/overlay) não aceitam WAL; DELETE é o modo seguro.
    journalMode = String(prepare("PRAGMA journal_mode = DELETE").get<{ journal_mode: string }>()?.journal_mode ?? "delete").toLowerCase();
  }
  raw.exec("PRAGMA synchronous = NORMAL");

  return {
    driver,
    path,
    journalMode,
    exec: (sql) => raw.exec(sql),
    prepare,
    tx<T>(fn: () => T): T {
      if (depth > 0) return fn();
      raw.exec("BEGIN IMMEDIATE");
      depth++;
      try {
        const result = fn();
        if (result instanceof Promise) throw new Error("tx() aceita apenas funções síncronas.");
        raw.exec("COMMIT");
        return result;
      } catch (error) {
        try {
          raw.exec("ROLLBACK");
        } catch {
          // a transação já pode ter sido desfeita pelo SQLite
        }
        throw error;
      } finally {
        depth--;
      }
    },
    close: () => {
      cache.clear();
      raw.close();
    },
  };
}
