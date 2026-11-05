import "server-only";
import { randomUUID } from "node:crypto";
import type { z } from "zod";
import { ensureScheduler, type Actor } from "@/server/engine";
import type { Operation } from "@/shared/permissions";
import { assertCan, FORBIDDEN_MESSAGE } from "../auth/authorize";
import { clearedSessionCookies, isCrossSiteWrite, isOwnClient, readCookie, SESSION_COOKIE } from "../auth/session-cookie";
import { authenticate } from "../auth/sessions";
import type { AppUserRow } from "../db/repos/users";
import { AppError, isAppError } from "../errors";
import { log, redact, redactText } from "../log";
import { assertBitrixAccess } from "../services/bitrix-access";
import { parseInput, readJsonBody, readQuery } from "./input";
import { errorJson, json, withBaseHeaders } from "./respond";

export { FORBIDDEN_MESSAGE };

/**
 * Envoltório das rotas da API: id da requisição → religa o agendador → recusa escrita vinda de outro site → sessão →
 * senha temporária → matriz de papel × operação → conta da pessoa no Bitrix24 → parâmetros → entrada validada (zod) → serviço → JSON sem cache.
 * Erros viram `ApiErrorDTO` em pt-BR; nada interno vaza.
 */
export type AuthMode = "public" | "install" | "session";

type RouteAccess<A extends AuthMode> = A extends "session" ? { operation: Operation } : { operation?: undefined };

export type RouteOptions<A extends AuthMode, S extends z.ZodType | undefined, K extends string> = RouteAccess<A> & {
  /** public e install não exigem sessão (install confere o token de instalação no serviço). */
  auth: A;
  input?: S;
  /** Padrão: query string em GET/HEAD/DELETE e corpo JSON nos demais métodos. */
  source?: "body" | "query";
  /** Segmentos dinâmicos do caminho (ex.: ["journeyId"]); ausente → 404. */
  params?: readonly K[];
};

export interface RouteArgs<A extends AuthMode, I, K extends string> {
  request: Request;
  params: Record<K, string>;
  input: I;
  user: A extends "session" ? AppUserRow : null;
  tokenHash: A extends "session" ? string : null;
  actor: Actor;
  requestId: string;
}

type InputOf<S> = S extends z.ZodType ? z.output<S> : undefined;

export type RouteHandler<K extends string> = (request: Request, context: { params: Promise<Record<K, string>> }) => Promise<Response>;

export const UNAUTHENTICATED_MESSAGE = "Sua sessão expirou. Entre de novo.";
export const INTERNAL_MESSAGE = "Algo deu errado. Tente de novo.";
export const CROSS_SITE_MESSAGE = "Este pedido veio de outra página e foi recusado.";
export const PASSWORD_CHANGE_MESSAGE = "Troque a senha temporária para continuar.";

const SCHEDULER_WARN_EVERY_MS = 10 * 60 * 1000;
let schedulerWarnedAt = 0;

/** O laço de sincronização se religa a partir das requisições; uma falha aqui nunca derruba a rota. */
function nudgeScheduler(requestId: string): void {
  try {
    ensureScheduler();
  } catch (error) {
    const now = Date.now();
    if (now - schedulerWarnedAt >= SCHEDULER_WARN_EVERY_MS) {
      schedulerWarnedAt = now;
      log.warn("scheduler_unavailable", { message: "Agendador indisponível; a requisição seguiu normalmente.", requestId, error });
    }
  }
}

/** notFound()/redirect() do Next sinalizam por exceção com `digest` NEXT_*: deixa o framework tratar. */
function isNextControlFlow(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("digest" in error)) return false;
  const digest = (error as { digest: unknown }).digest;
  return typeof digest === "string" && digest.startsWith("NEXT_");
}

function pathOf(request: Request): string {
  try {
    return new URL(request.url).pathname;
  } catch {
    return "";
  }
}

async function resolveParams<K extends string>(context: { params: Promise<Record<K, string>> } | undefined, names: readonly K[]): Promise<Record<K, string>> {
  const raw = ((await context?.params) ?? {}) as Record<string, unknown>;
  const out = {} as Record<K, string>;
  for (const name of names) {
    const value = raw[name];
    if (typeof value !== "string" || !value.trim() || value.length > 200) throw new AppError("NOT_FOUND", "Não encontramos o que você procurou.", 404);
    out[name] = value;
  }
  return out;
}

/**
 * Sessão inválida: o navegador também apaga o cookie, se veio um. Só pedido da própria interface: um link externo para a
 * API também traz o cookie e cai aqui, e não pode encerrar a sessão de quem clicou.
 */
function unauthenticated(request: Request, requestId: string): Response {
  const response = errorJson(requestId, 401, "UNAUTHENTICATED", UNAUTHENTICATED_MESSAGE);
  if (readCookie(request, SESSION_COOKIE) && isOwnClient(request)) for (const cookie of clearedSessionCookies()) response.headers.append("Set-Cookie", cookie);
  return response;
}

export function route<A extends AuthMode, S extends z.ZodType | undefined = undefined, K extends string = never>(
  options: RouteOptions<A, S, K>,
  handler: (args: RouteArgs<A, InputOf<S>, K>) => unknown,
): RouteHandler<K> {
  return async (request, context) => {
    const requestId = randomUUID();
    const started = Date.now();
    const method = request.method.toUpperCase();
    const path = pathOf(request);
    let status = 500;
    try {
      nudgeScheduler(requestId);

      if (isCrossSiteWrite(request)) {
        status = 403;
        return errorJson(requestId, 403, "CROSS_SITE_REQUEST", CROSS_SITE_MESSAGE);
      }

      let user: AppUserRow | null = null;
      let tokenHash: string | null = null;
      if (options.auth === "session") {
        const session = authenticate(request);
        if (!session) {
          status = 401;
          return unauthenticated(request, requestId);
        }
        const operation = options.operation as Operation;
        // Antes da matriz e do Bitrix24: com senha temporária, a sessão só serve para trocá-la, ver a própria conta e sair.
        if (session.user.mustChangePassword && operation !== "session.self") {
          status = 403;
          return errorJson(requestId, 403, "PASSWORD_CHANGE_REQUIRED", PASSWORD_CHANGE_MESSAGE);
        }
        assertCan(session.user, operation);
        user = await assertBitrixAccess(session.user, operation);
        tokenHash = session.tokenHash;
      }

      const params = await resolveParams(context, options.params ?? []);

      let input: unknown = undefined;
      if (options.input) {
        const source = options.source ?? (method === "GET" || method === "HEAD" || method === "DELETE" ? "query" : "body");
        input = parseInput(options.input, source === "query" ? readQuery(request) : await readJsonBody(request));
      }

      const actor: Actor = user ? { type: "user", id: user.id, name: user.name } : { type: "system", id: null, name: null };
      const args = { request, params, input, user, tokenHash, actor, requestId } as RouteArgs<A, InputOf<S>, K>;
      const result = await handler(args);
      const response = result instanceof Response ? withBaseHeaders(result, requestId) : json(result === undefined ? { ok: true } : result, requestId);
      status = response.status;
      return response;
    } catch (error) {
      if (isNextControlFlow(error)) throw error;
      if (isAppError(error)) {
        status = error.status;
        if (error.status >= 500) log.error("request_failed", { message: "Erro interno ao atender a requisição.", requestId, method, path, status, error });
        // Mensagem e detalhes vão para a tela: passam pelo mesmo filtro de segredos do log, por garantia.
        const details = error.details ? (redact(error.details) as Record<string, unknown>) : undefined;
        return errorJson(requestId, error.status, error.code, redactText(error.message), details);
      }
      status = 500;
      log.error("request_failed", { message: "Falha inesperada ao atender a requisição.", requestId, method, path, status, error });
      return errorJson(requestId, 500, "INTERNAL", INTERNAL_MESSAGE);
    } finally {
      // Leituras bem-sucedidas (o painel recarrega a cada 30 s) não poluem o log.
      if (status < 500 && (method !== "GET" || status >= 400)) {
        log.info("request", { message: status < 400 ? "Requisição atendida." : "Requisição recusada.", requestId, method, path, status, ms: Date.now() - started });
      }
    }
  };
}
