import "server-only";
import { getDb } from "..";
import { nowIso, toStringOrNull } from "./util";

export type OperationStatus = "sending" | "confirmed" | "uncertain" | "failed";

/** Diário de idempotência de escritas no Bitrix (ex.: chave `task:create:<atividade>`). */
export interface OperationRow {
  key: string;
  status: OperationStatus;
  attempts: number;
  resultId: string | null;
  startedAt: string;
  updatedAt: string;
}

function map(row: Record<string, unknown>): OperationRow {
  return {
    key: String(row.key),
    status: row.status as OperationStatus,
    attempts: Number(row.attempts),
    resultId: toStringOrNull(row.result_id),
    startedAt: String(row.started_at),
    updatedAt: String(row.updated_at),
  };
}

export function getOperation(key: string): OperationRow | null {
  const row = getDb().prepare("SELECT * FROM operations WHERE key = ?").get(key);
  return row ? map(row) : null;
}

/** Marca o início de uma tentativa (status `sending`, tentativas + 1). */
export function beginOperation(key: string): OperationRow {
  const now = nowIso();
  getDb()
    .prepare(`
      INSERT INTO operations (key, status, attempts, started_at, updated_at) VALUES (?, 'sending', 1, ?, ?)
      ON CONFLICT(key) DO UPDATE SET status = 'sending', attempts = attempts + 1, started_at = excluded.started_at, updated_at = excluded.updated_at`)
    .run(key, now, now);
  return getOperation(key)!;
}

export function confirmOperation(key: string, resultId: string): void {
  getDb().prepare("UPDATE operations SET status = 'confirmed', result_id = ?, updated_at = ? WHERE key = ?").run(resultId, nowIso(), key);
}

/** O Bitrix pode ter gravado (timeout, 5xx): é preciso conferir antes de reenviar. */
export function markOperationUncertain(key: string): void {
  getDb().prepare("UPDATE operations SET status = 'uncertain', updated_at = ? WHERE key = ?").run(nowIso(), key);
}

export function markOperationFailed(key: string): void {
  getDb().prepare("UPDATE operations SET status = 'failed', updated_at = ? WHERE key = ?").run(nowIso(), key);
}
