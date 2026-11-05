import "server-only";
import type { SessionTransport } from "@/shared/enums";
import { getDb } from "../db";
import { createSession, deleteSession, findSessionWithUser, touchSession } from "../db/repos/sessions";
import type { AppUserRow } from "../db/repos/users";
import { hashToken, newToken } from "../security/crypto";
import { isOwnClient, readCookie, SESSION_COOKIE } from "./session-cookie";

/**
 * Sessão deslizante: 12 h sem uso encerra; renovada no máximo a cada 5 min.
 * Teto desde o login: 7 dias no cookie protegido (o JavaScript não alcança o token); 24 h no modo alternativo, em que o
 * token fica na memória ou no sessionStorage, porque ali um script injetado conseguiria lê-lo.
 */
export const SESSION_IDLE_MS = 12 * 60 * 60 * 1000;
export const SESSION_MAX_MS = 7 * 24 * 60 * 60 * 1000;
export const SESSION_BEARER_MAX_MS = 24 * 60 * 60 * 1000;
export const SESSION_REFRESH_MS = 5 * 60 * 1000;

const maxLifetime = (transport: SessionTransport) => (transport === "cookie" ? SESSION_MAX_MS : SESSION_BEARER_MAX_MS);

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
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{20,200}$/;

function expiryFrom(createdAtMs: number, nowMs: number, transport: SessionTransport): string {
  return new Date(Math.min(nowMs + SESSION_IDLE_MS, createdAtMs + maxLifetime(transport))).toISOString();
}

/** Cria a sessão: só o hash do token vai para o banco; o token volta uma única vez para o navegador. */
export function issueSession(user: Pick<AppUserRow, "id">, now = Date.now(), transport: SessionTransport = "bearer"): IssuedSession {
  const token = newToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(now + SESSION_IDLE_MS).toISOString();
  createSession({ tokenHash, userId: user.id, expiresAt, transport });
  return { token, tokenHash, expiresAt };
}

/** Cabeçalho próprio: a borda da Onnira remove `Authorization` antes de chegar ao app. */
export const SESSION_HEADER = "x-nexo-session";

/** Lê o token de `X-Nexo-Session` ou, como alternativa, de `Authorization: Bearer`. */
export function readBearerToken(request: Request): string | null {
  const own = request.headers.get(SESSION_HEADER)?.trim();
  if (own && TOKEN_SHAPE.test(own)) return own;
  const header = request.headers.get("authorization");
  if (!header) return null;
  return BEARER.exec(header)?.[1] ?? null;
}

/** O token e o canal por onde veio. Cabeçalho explícito ganha; cookie só vale vindo da própria interface (CSRF). */
function readCredential(request: Request): { token: string; transport: SessionTransport } | null {
  const bearer = readBearerToken(request);
  if (bearer) return { token: bearer, transport: "bearer" };
  const cookie = readCookie(request, SESSION_COOKIE);
  if (cookie && TOKEN_SHAPE.test(cookie) && isOwnClient(request)) return { token: cookie, transport: "cookie" };
  return null;
}

/** Sessão válida → usuário ativo e hash do token; renova o prazo quando a última renovação passou de 5 min. */
export function authenticate(request: Request, now = Date.now()): Authenticated | null {
  const credential = readCredential(request);
  if (!credential) return null;
  const tokenHash = hashToken(credential.token);
  const found = findSessionWithUser(tokenHash);
  if (!found) return null;
  const { session, user } = found;
  // Cada token só vale pelo canal em que foi entregue.
  if (session.transport !== credential.transport) return null;
  const createdAtMs = Date.parse(session.createdAt);
  const expired = !(Date.parse(session.expiresAt) > now) || !(createdAtMs + maxLifetime(session.transport) > now);
  if (expired || !user.active) {
    deleteSession(tokenHash);
    return null;
  }
  let expiresAt = session.expiresAt;
  if (!(now - Date.parse(session.lastSeenAt) < SESSION_REFRESH_MS)) {
    expiresAt = expiryFrom(createdAtMs, now, session.transport);
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
