import "server-only";
import { log } from "../../log";
import { keyedHash } from "../../security/crypto";
import { getDb } from "..";
import { nowIso } from "./util";

/**
 * Tentativas suspeitas, para monitorar: conta e origem só como HMAC, nunca credenciais. Permite ver um ataque (muitas falhas
 * contra uma conta, ou de uma origem) sem guardar quem é quem. Registrar nunca derruba a rota.
 */
export type SecurityEventType = "login_failed" | "login_locked" | "rate_limited";

export const KEEP_SECURITY_EVENTS_MS = 90 * 24 * 3_600_000;
/** Recusar é barato para quem ataca: um teto evita que a inundação encha o disco ou o log. */
export const MAX_SECURITY_EVENTS = 10_000;
const PRUNE_EVERY = 200;
const LOG_EVERY_MS = 60_000;
let insertsSincePrune = 0;
const loggedAt = new Map<string, number>();

export function recordSecurityEvent(type: SecurityEventType, subject: { account?: string; origin?: string } = {}): void {
  const subjectHash = subject.account ? keyedHash(`account:${subject.account.trim().toLowerCase()}`).slice(0, 16) : null;
  const originHash = subject.origin ? keyedHash(`origin:${subject.origin}`).slice(0, 16) : null;
  try {
    const db = getDb();
    db.prepare("INSERT INTO security_events (at, type, subject_hash, origin_hash) VALUES (?, ?, ?, ?)").run(nowIso(), type, subjectHash, originHash);
    if (++insertsSincePrune >= PRUNE_EVERY) {
      insertsSincePrune = 0;
      db.prepare("DELETE FROM security_events WHERE id <= (SELECT MAX(id) FROM security_events) - ?").run(MAX_SECURITY_EVENTS);
    }
  } catch (error) {
    log.warn("security_event_failed", { type, error });
  }
  if (type === "login_failed" || Date.now() - (loggedAt.get(type) ?? 0) < LOG_EVERY_MS) return;
  loggedAt.set(type, Date.now());
  log.warn("security_event", { type, subjectHash, originHash });
}

export function countSecurityEvents(sinceIso: string): Record<SecurityEventType, number> {
  const counts: Record<SecurityEventType, number> = { login_failed: 0, login_locked: 0, rate_limited: 0 };
  const rows = getDb().prepare("SELECT type, COUNT(*) AS total FROM security_events WHERE at >= ? GROUP BY type").all<{ type: SecurityEventType; total: number }>(sinceIso);
  for (const row of rows) counts[row.type] = Number(row.total);
  return counts;
}

export function purgeSecurityEvents(beforeIso: string): number {
  return getDb().prepare("DELETE FROM security_events WHERE at < ?").run(beforeIso).changes;
}
