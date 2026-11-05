import "server-only";
import { accessSync, constants, rmSync } from "node:fs";
import { totalmem } from "node:os";
import { join } from "node:path";
import type { BasicProbeDTO, FullProbeDTO } from "@/shared/contracts";
import { nodeSqliteAvailable, openDb, type DriverName } from "../db/driver";
import { getDb } from "../db";
import { recordBoot } from "./boot";
import { buildInfo } from "./build-info";
import { inspectDataProtection } from "./data-protection";
import { resolveDataDir } from "./data-dir";

/**
 * Sonda em dois níveis:
 * - básica (`/api/probe`, sem sessão): serve ao suporte antes do login. Não grava, não chama ninguém e não diz nada do ambiente;
 * - completa (`/api/probe/full`, só administração): o que resolve um problema de hospedagem, sem caminhos, pid nem cabeçalhos.
 */
export function basicProbe(headers: Headers): BasicProbeDTO {
  let database = false;
  try {
    getDb().prepare("SELECT 1").get();
    database = true;
  } catch {
    database = false;
  }
  return { ok: true, database, sessionHeader: headers.has("x-nexo-session"), authorizationHeader: headers.has("authorization") };
}

/** Abre um banco de teste com o driver, grava, lê e apaga: confere o driver sem deixar arquivo na pasta de dados. */
function checkSqlite(dataDir: string, driver: DriverName): FullProbeDTO["sqlite"][number] {
  const file = join(dataDir, `probe-${driver.replace(/[^a-z0-9]/gi, "-")}.sqlite`);
  try {
    const db = openDb(file, { driver });
    try {
      if (db.driver !== driver) return { driver, ok: false, error: "indisponível" };
      db.exec("CREATE TABLE IF NOT EXISTS hits (id INTEGER PRIMARY KEY, at TEXT NOT NULL)");
      db.tx(() => db.prepare("INSERT INTO hits (at) VALUES (?)").run(new Date().toISOString()));
      return { driver, ok: true, journalMode: db.journalMode };
    } finally {
      db.close();
    }
  } catch {
    return { driver, ok: false, error: "indisponível" };
  } finally {
    for (const suffix of ["", "-wal", "-shm", "-journal"]) rmSync(`${file}${suffix}`, { force: true });
  }
}

function isWritable(path: string): boolean {
  try {
    accessSync(path, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

export function fullProbe(egress: FullProbeDTO["egress"], bitrixWorker: boolean): FullProbeDTO {
  const dir = resolveDataDir();
  const memory = process.memoryUsage();
  return {
    build: buildInfo(),
    runtime: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      uptimeSeconds: Math.round(process.uptime()),
      rssMb: Math.round(memory.rss / 1048576),
      totalMb: Math.round(totalmem() / 1048576),
      constrainedMb: typeof process.constrainedMemory === "function" ? Math.round(Number(process.constrainedMemory()) / 1048576) || null : null,
    },
    dataDir: { source: dir.source, persistent: dir.source !== "local", writable: isWritable(dir.path) },
    dataProtection: inspectDataProtection(dir.path),
    boots: recordBoot().record?.count ?? null,
    sqlite: [
      nodeSqliteAvailable() ? checkSqlite(dir.path, "node:sqlite") : { driver: "node:sqlite", ok: false, error: "indisponível" },
      checkSqlite(dir.path, "better-sqlite3"),
    ],
    bitrixWorker,
    egress,
  };
}
