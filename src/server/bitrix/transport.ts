import "server-only";
import { BitrixError, classifyBitrixError } from "./errors";
import { parseRetryAfter } from "./limiter";
import type { BitrixCredentials } from "./webhook-url";

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export interface BitrixEnvelope {
  result: unknown;
  next?: number;
  total?: number;
}

export const DEFAULT_TIMEOUT_MS = 20_000;
const METHOD_PATTERN = /^[a-z][a-z0-9_]*(?:\.[a-z0-9_]+)*$/i;

export const isValidMethod = (method: string): boolean => METHOD_PATTERN.test(method);

const asNumber = (value: unknown): number | undefined => (typeof value === "number" && Number.isFinite(value) ? value : undefined);

function isTimeout(error: unknown): boolean {
  return error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
}

/**
 * Uma chamada REST ao webhook: POST JSON em `${portal}/rest/${userId}/${secret}/${method}.json`, sem seguir redirecionamentos
 * e com timeout. Os erros nunca carregam o URL (que contém o segredo).
 */
export async function sendBitrixRequest(
  credentials: BitrixCredentials,
  method: string,
  params: Record<string, unknown>,
  options: { transport: FetchLike; timeoutMs?: number; now?: () => number },
): Promise<BitrixEnvelope> {
  if (!isValidMethod(method)) throw new BitrixError("METHOD_INVALID", {}, "Método do Bitrix24 inválido.");
  const url = `${credentials.portal}/rest/${credentials.userId}/${credentials.secret}/${method}.json`;
  let response: Response;
  let text: string;
  try {
    response = await options.transport(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(params),
      redirect: "error",
      signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });
    text = await response.text();
  } catch (error) {
    // Só o código técnico (ENOTFOUND, ECONNRESET…): a mensagem original poderia conter o URL.
    const cause = error instanceof Error ? (error.cause as { code?: unknown } | undefined)?.code : undefined;
    const description = typeof cause === "string" ? cause : error instanceof Error ? error.name : null;
    throw new BitrixError(isTimeout(error) ? "TIMEOUT" : "TRANSPORT_ERROR", { retryable: true, uncertain: true, description });
  }
  let payload: unknown;
  try {
    payload = text ? JSON.parse(text) : undefined;
  } catch {
    payload = undefined;
  }
  const envelope = payload !== null && typeof payload === "object" && !Array.isArray(payload) ? (payload as Record<string, unknown>) : null;
  const code = envelope && typeof envelope.error === "string" && envelope.error ? envelope.error : null;
  if (code || !response.ok) {
    const description = envelope && typeof envelope.error_description === "string" ? envelope.error_description.slice(0, 300) : null;
    throw classifyBitrixError(code, response.status, parseRetryAfter(response.headers.get("retry-after"), options.now?.()), description);
  }
  if (!envelope || !("result" in envelope)) throw new BitrixError("RESPONSE_INVALID", { retryable: true, uncertain: true });
  return { result: envelope.result, next: asNumber(envelope.next), total: asNumber(envelope.total) };
}
