import "server-only";
import { accessSync, constants, existsSync } from "node:fs";
import { availableParallelism, totalmem } from "node:os";
import { join, resolve } from "node:path";
import { nodeSqliteAvailable, openDb, type DriverName } from "../db/driver";
import { recordBoot } from "./boot";
import { buildInfo } from "./build-info";
import { ONNIRA_VOLUME, resolveDataDir } from "./data-dir";

interface SqliteCheck {
  driver: DriverName;
  ok: boolean;
  rows?: number;
  journalMode?: string;
  error?: string;
}

function dirStatus(path: string) {
  const absolute = resolve(path);
  let writable = false;
  try {
    accessSync(absolute, constants.W_OK);
    writable = true;
  } catch {
    writable = false;
  }
  return { path: absolute, exists: existsSync(absolute), writable };
}

function maskIp(value: string | null): string | null {
  if (!value) return null;
  return value
    .split(",")
    .map((ip) => ip.trim().replace(/(\d+)\.(\d+)\.\d+\.\d+$/, "$1.$2.x.x").replace(/:[0-9a-f]*:[0-9a-f]*$/i, ":x:x"))
    .join(", ");
}

function checkSqlite(dataDir: string, driver: DriverName): SqliteCheck {
  const file = join(dataDir, `probe-${driver.replace(/[^a-z0-9]/gi, "-")}.sqlite`);
  try {
    const db = openDb(file, { driver });
    try {
      if (db.driver !== driver) return { driver, ok: false, error: `indisponível (abriu ${db.driver})` };
      db.exec("CREATE TABLE IF NOT EXISTS hits (id INTEGER PRIMARY KEY, at TEXT NOT NULL)");
      db.tx(() => db.prepare("INSERT INTO hits (at) VALUES (?)").run(new Date().toISOString()));
      const rows = db.prepare("SELECT COUNT(*) AS total FROM hits").get<{ total: number }>()?.total ?? 0;
      return { driver, ok: true, rows: Number(rows), journalMode: db.journalMode };
    } finally {
      db.close();
    }
  } catch (error) {
    return { driver, ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/** Relatório da sonda de ambiente: nada aqui expõe segredos (cookies e Authorization aparecem só como presença). */
export function serverProbe(headers: Headers) {
  const boot = recordBoot();
  const dir = resolveDataDir();
  const sqlite: SqliteCheck[] = [];
  sqlite.push(nodeSqliteAvailable() ? checkSqlite(dir.path, "node:sqlite") : { driver: "node:sqlite", ok: false, error: `node:sqlite ausente no Node ${process.version}` });
  sqlite.push(checkSqlite(dir.path, "better-sqlite3"));

  const header = (name: string) => headers.get(name);
  return {
    at: new Date().toISOString(),
    build: buildInfo(),
    runtime: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      pid: process.pid,
      uptimeSeconds: Math.round(process.uptime()),
      cwd: process.cwd(),
      nodeEnv: process.env.NODE_ENV ?? null,
      portEnv: process.env.PORT ?? null,
      cpus: availableParallelism(),
      memory: {
        rssMb: Math.round(process.memoryUsage().rss / 1048576),
        heapUsedMb: Math.round(process.memoryUsage().heapUsed / 1048576),
        totalMb: Math.round(totalmem() / 1048576),
        constrainedMb: typeof process.constrainedMemory === "function" ? Math.round(Number(process.constrainedMemory()) / 1048576) || null : null,
      },
    },
    dataDir: {
      chosen: dir,
      candidates: {
        env: process.env.NEXO_DATA_DIR ? dirStatus(process.env.NEXO_DATA_DIR) : null,
        onniraVolume: dirStatus(ONNIRA_VOLUME),
        local: dirStatus("./data"),
      },
    },
    boot,
    sqlite,
    request: {
      host: header("host"),
      forwardedHost: header("x-forwarded-host"),
      forwardedProto: header("x-forwarded-proto"),
      forwardedFor: maskIp(header("x-forwarded-for")),
      referer: header("referer"),
      origin: header("origin"),
      secFetchSite: header("sec-fetch-site"),
      secFetchMode: header("sec-fetch-mode"),
      secFetchDest: header("sec-fetch-dest"),
      authorizationPresent: headers.has("authorization"),
      sessionHeaderPresent: headers.has("x-nexo-session"),
      cookieNames: (header("cookie") ?? "")
        .split(";")
        .map((part) => part.split("=")[0]?.trim())
        .filter(Boolean),
      userAgent: header("user-agent"),
    },
  };
}

export type ServerProbe = ReturnType<typeof serverProbe>;
