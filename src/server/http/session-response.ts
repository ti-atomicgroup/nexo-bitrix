import "server-only";
import type { SessionDTO } from "@/shared/contracts";
import { clearedSessionCookies, sessionCookies } from "../auth/session-cookie";
import { SESSION_MAX_MS } from "../auth/sessions";

/** Entrega a sessão ao navegador. No cookie protegido, o token não aparece no corpo: o JavaScript nunca o vê. */
export function sessionResponse(session: SessionDTO): Response {
  if (session.transport !== "cookie" || !session.token) return Response.json(session);
  const { token, ...body } = session;
  const headers = new Headers();
  for (const cookie of sessionCookies(token, Math.floor(SESSION_MAX_MS / 1000))) headers.append("Set-Cookie", cookie);
  return Response.json(body, { headers });
}

/** Sair: apaga os cookies, se houver. */
export function loggedOutResponse(): Response {
  const headers = new Headers();
  for (const cookie of clearedSessionCookies()) headers.append("Set-Cookie", cookie);
  return Response.json({ ok: true }, { headers });
}
