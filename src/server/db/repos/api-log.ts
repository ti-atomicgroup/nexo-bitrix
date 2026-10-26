import "server-only";
import { getDb } from "..";
import { nowIso, toStringOrNull } from "./util";

const KEEP_ROWS = 2000;
let insertsSincePrune = 0;

/** Registro de chamadas ao Bitrix: só o nome do método, nunca o URL (que contém o segredo do webhook). */
export function logBitrixCall(entry: { method: string; ok: boolean; errorCode?: string | null; durationMs: number }): void {
  const db = getDb();
  db.prepare("INSERT INTO api_log (at, method, ok, error_code, duration_ms) VALUES (?, ?, ?, ?, ?)").run(
    nowIso(),
    entry.method,
    entry.ok,
    entry.errorCode ?? null,
    Math.round(entry.durationMs),
  );
  insertsSincePrune++;
  if (insertsSincePrune >= 200) {
    insertsSincePrune = 0;
    db.prepare("DELETE FROM api_log WHERE id <= (SELECT MAX(id) FROM api_log) - ?").run(KEEP_ROWS);
  }
}

export function recentBitrixErrors(limit = 10): Array<{ at: string; method: string; code: string | null }> {
  return getDb()
    .prepare("SELECT at, method, error_code FROM api_log WHERE ok = 0 ORDER BY id DESC LIMIT ?")
    .all(limit)
    .map((row) => ({ at: String(row.at), method: String(row.method), code: toStringOrNull(row.error_code) }));
}
