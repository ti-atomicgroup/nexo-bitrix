import "server-only";
import type { DiagnosticsDTO } from "@/shared/contracts";
import { bitrixRateLimitedUntil, schedulerStatus } from "@/server/engine";
import { workerConfig } from "../bitrix/relay";
import { getDataDir, getDb } from "../db";
import { recentBitrixErrors } from "../db/repos/api-log";
import { countJobs } from "../db/repos/jobs";
import { countSecurityEvents } from "../db/repos/security-events";
import { getSyncState } from "../db/repos/settings";
import { BACKUP_KEEP_DAYS, listBackups } from "../runtime/backup";
import { buildInfo } from "../runtime/build-info";
import { inspectDataProtection } from "../runtime/data-protection";
import { resolveDataDir } from "../runtime/data-dir";

const SECURITY_WINDOW_HOURS = 24;

/** Diagnóstico (Ajustes, só administração): nunca falha por causa do motor; sem ele, mostra o último estado gravado. */
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

  const backups = listBackups();
  const events = countSecurityEvents(new Date(Date.now() - SECURITY_WINDOW_HOURS * 3_600_000).toISOString());

  return {
    build: buildInfo(),
    node: process.version,
    database: { driver: db.driver, journalMode: db.journalMode, dataSource: resolveDataDir().source },
    dataProtection: inspectDataProtection(getDataDir()),
    backup: { lastAt: backups[0] ? new Date(backups[0].at).toISOString() : null, count: backups.length, keepDays: BACKUP_KEEP_DAYS, lastError: sync.lastBackupError },
    security: { hours: SECURITY_WINDOW_HOURS, loginFailures: events.login_failed, loginLocks: events.login_locked, rateLimited: events.rate_limited },
    bitrixWorker: workerConfig() !== null,
    scheduler,
    queue: { queued: countJobs("queued"), failed: countJobs("failed") },
    rateLimitedUntil,
    recentBitrixErrors: recentBitrixErrors(10),
  };
}
