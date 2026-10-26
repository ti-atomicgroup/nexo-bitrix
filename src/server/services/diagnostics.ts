import "server-only";
import type { DiagnosticsDTO } from "@/shared/contracts";
import { bitrixRateLimitedUntil, schedulerStatus } from "@/server/engine";
import { getDataDir, getDb } from "../db";
import { recentBitrixErrors } from "../db/repos/api-log";
import { countJobs } from "../db/repos/jobs";
import { getSyncState } from "../db/repos/settings";
import { buildInfo } from "../runtime/build-info";

/** Diagnóstico (Ajustes): nunca falha por causa do motor; sem ele, mostra o último estado gravado. */
export function getDiagnostics(): DiagnosticsDTO {
  const db = getDb();
  const sync = getSyncState();

  let scheduler: DiagnosticsDTO["scheduler"];
  try {
    const status = schedulerStatus();
    scheduler = { running: status.running, lastCycleAt: status.lastCycleAt, lastCycleMs: status.lastCycleMs, lastError: status.lastError, nextCycleAt: status.nextCycleAt };
  } catch {
    scheduler = { running: false, lastCycleAt: sync.lastCycleAt, lastCycleMs: sync.lastCycleMs, lastError: sync.lastError, nextCycleAt: sync.nextCycleAt };
  }

  let rateLimitedUntil: string | null;
  try {
    rateLimitedUntil = bitrixRateLimitedUntil();
  } catch {
    rateLimitedUntil = sync.rateLimitedUntil;
  }

  return {
    build: buildInfo(),
    node: process.version,
    database: { driver: db.driver, journalMode: db.journalMode, dataDir: getDataDir() },
    scheduler,
    queue: { queued: countJobs("queued"), failed: countJobs("failed") },
    rateLimitedUntil,
    recentBitrixErrors: recentBitrixErrors(10),
  };
}
