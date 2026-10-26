import "server-only";
import type { SyncStatusDTO } from "@/shared/contracts";
import { kick } from "@/server/engine";
import { countJobs } from "../db/repos/jobs";
import { getSyncState, getWebhookRecord } from "../db/repos/settings";
import { log } from "../log";

/** Estado da sincronização para a barra do console (lido só do SQLite). */
export function syncStatus(): SyncStatusDTO {
  const sync = getSyncState();
  return {
    connected: getWebhookRecord() !== null,
    lastCycleAt: sync.lastCycleAt,
    lastError: sync.lastError,
    rateLimitedUntil: sync.rateLimitedUntil,
    queued: countJobs("queued"),
  };
}

/** "Sincronizar agora": pede um ciclo imediato ao motor e devolve o estado atual. */
export function syncNow(requestId?: string): SyncStatusDTO {
  try {
    kick();
  } catch (error) {
    log.warn("sync_kick_failed", { message: "Não foi possível pedir um ciclo de sincronização agora.", requestId, error });
  }
  return syncStatus();
}
