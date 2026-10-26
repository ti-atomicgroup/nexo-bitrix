import "server-only";
import { getDb } from "../db";
import { createSession, deleteSession, findSessionWithUser, touchSession } from "../db/repos/sessions";
import type { AppUserRow } from "../db/repos/users";
import { hashToken, newToken } from "../security/crypto";

/** Sessão deslizante: 12 h sem uso encerra; nunca passa de 7 dias desde o login; renovada no máximo a cada 5 min. */
export const SESSION_IDLE_MS = 12 * 60 * 60 * 1000;
export const SESSION_MAX_MS = 7 * 24 * 60 * 60 * 1000;
export const SESSION_REFRESH_MS = 5 * 60 * 1000;

export interface IssuedSession {
  token: string;
  tokenHash: string;
  expiresAt: string;
}

export interface Authenticated {
  user: AppUserRow;
  tokenHash: string;
  expiresAt: string;
}

const BEARER = /^Bearer[ \t]+([A-Za-z0-9_-]{20,200})[ \t]*$/i;

function expiryFrom(createdAtMs: number, nowMs: number): string {
  return new Date(Math.min(nowMs + SESSION_IDLE_MS, createdAtMs + SESSION_MAX_MS)).toISOString();
}

/** Cria a sessão: só o hash do token vai para o banco; o token volta uma única vez para o navegador. */
export function issueSession(user: Pick<AppUserRow, "id">, now = Date.now()): IssuedSession {
  const token = newToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(now + SESSION_IDLE_MS).toISOString();
  createSession({ tokenHash, userId: user.id, expiresAt });
  return { token, tokenHash, expiresAt };
}

/** Cabeçalho próprio: a borda da Onnira remove `Authorization` antes de chegar ao app. */
export const SESSION_HEADER = "x-nexo-session";

/** Lê o token de `X-Nexo-Session` ou, como alternativa, de `Authorization: Bearer` (sem cookies: o Nexo roda num iframe cross-site). */
export function readBearerToken(request: Request): string | null {
  const own = request.headers.get(SESSION_HEADER)?.trim();
  if (own && /^[A-Za-z0-9_-]{20,200}$/.test(own)) return own;
  const header = request.headers.get("authorization");
  if (!header) return null;
  return BEARER.exec(header)?.[1] ?? null;
}

/** Sessão válida → usuário ativo e hash do token; renova o prazo quando a última renovação passou de 5 min. */
export function authenticate(request: Request, now = Date.now()): Authenticated | null {
  const token = readBearerToken(request);
  if (!token) return null;
  const tokenHash = hashToken(token);
  const found = findSessionWithUser(tokenHash);
  if (!found) return null;
  const { session, user } = found;
  const createdAtMs = Date.parse(session.createdAt);
  const expired = !(Date.parse(session.expiresAt) > now) || !(createdAtMs + SESSION_MAX_MS > now);
  if (expired || !user.active) {
    deleteSession(tokenHash);
    return null;
  }
  let expiresAt = session.expiresAt;
  if (!(now - Date.parse(session.lastSeenAt) < SESSION_REFRESH_MS)) {
    expiresAt = expiryFrom(createdAtMs, now);
    touchSession(tokenHash, { lastSeenAt: new Date(now).toISOString(), expiresAt });
  }
  return { user, tokenHash, expiresAt };
}

export function revoke(tokenHash: string): void {
  deleteSession(tokenHash);
}

/** Encerra as outras sessões do usuário (troca de senha), mantendo a atual. */
export function revokeOtherSessions(userId: string, keepTokenHash: string): number {
  return getDb().prepare("DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?").run(userId, keepTokenHash).changes;
}
