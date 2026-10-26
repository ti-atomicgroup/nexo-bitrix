import "server-only";
import { getDb } from "..";
import { findUserById, type AppUserRow } from "./users";
import { nowIso } from "./util";

export interface SessionRow {
  tokenHash: string;
  userId: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
}

function map(row: Record<string, unknown>): SessionRow {
  return {
    tokenHash: String(row.token_hash),
    userId: String(row.user_id),
    createdAt: String(row.created_at),
    lastSeenAt: String(row.last_seen_at),
    expiresAt: String(row.expires_at),
  };
}

export function createSession(input: { tokenHash: string; userId: string; expiresAt: string }): SessionRow {
  const now = nowIso();
  getDb()
    .prepare("INSERT INTO sessions (token_hash, user_id, created_at, last_seen_at, expires_at) VALUES (?, ?, ?, ?, ?)")
    .run(input.tokenHash, input.userId, now, now, input.expiresAt);
  return { tokenHash: input.tokenHash, userId: input.userId, createdAt: now, lastSeenAt: now, expiresAt: input.expiresAt };
}

export function findSessionWithUser(tokenHash: string): { session: SessionRow; user: AppUserRow } | null {
  const row = getDb().prepare("SELECT * FROM sessions WHERE token_hash = ?").get(tokenHash);
  if (!row) return null;
  const session = map(row);
  const user = findUserById(session.userId);
  return user ? { session, user } : null;
}

export function touchSession(tokenHash: string, update: { lastSeenAt: string; expiresAt: string }): void {
  getDb().prepare("UPDATE sessions SET last_seen_at = ?, expires_at = ? WHERE token_hash = ?").run(update.lastSeenAt, update.expiresAt, tokenHash);
}

export function deleteSession(tokenHash: string): void {
  getDb().prepare("DELETE FROM sessions WHERE token_hash = ?").run(tokenHash);
}

export function deleteUserSessions(userId: string): void {
  getDb().prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
}

export function purgeExpiredSessions(now = nowIso()): number {
  return getDb().prepare("DELETE FROM sessions WHERE expires_at <= ?").run(now).changes;
}
