import "server-only";
import { AppError } from "../errors";

export interface BitrixErrorOptions {
  /** Vale tentar de novo mais tarde (limite, instabilidade, rede). */
  retryable?: boolean;
  /** O Bitrix pode ter gravado mesmo assim (timeout, 5xx, resposta ilegível): conferir antes de reenviar. */
  uncertain?: boolean;
  /** Limite de requisições: o limitador compartilhado segura as próximas chamadas. */
  rateLimited?: boolean;
  httpStatus?: number | null;
  retryAfterMs?: number | null;
  /** Texto técnico do Bitrix (error_description), só para diagnóstico; nunca contém o URL do webhook. */
  description?: string | null;
}

export const RATE_LIMIT_CODES = new Set(["QUERY_LIMIT_EXCEEDED", "OPERATION_TIME_LIMIT"]);
const DENIED_CODES = new Set(["ACCESS_DENIED", "INSUFFICIENT_SCOPE", "insufficient_scope", "user_access_error", "ERROR_ACCESS_DENIED"]);
const REJECTED_WEBHOOK_CODES = new Set(["INVALID_CREDENTIALS", "NO_AUTH_FOUND", "expired_token", "invalid_token", "WRONG_AUTH_TYPE", "PASSWORD_REQUIRED"]);
const NOT_FOUND_CODES = new Set(["NOT_FOUND", "ERROR_NOT_FOUND", "ERROR_ENTITY_NOT_FOUND"]);

function bitrixMessage(code: string, options: BitrixErrorOptions): string {
  if (DENIED_CODES.has(code)) return "O Bitrix24 negou a operação. Revise as permissões do webhook.";
  if (REJECTED_WEBHOOK_CODES.has(code)) return "O Bitrix24 recusou o webhook. Confira se o endereço está completo e se o webhook ainda existe.";
  if (options.rateLimited) return "O Bitrix24 pediu uma pausa (limite de requisições). O Nexo tenta de novo sozinho em instantes.";
  if (code === "TIMEOUT") return "O Bitrix24 não respondeu a tempo. O Nexo vai conferir e tentar de novo.";
  if (code === "TRANSPORT_ERROR") return "Não foi possível falar com o Bitrix24 agora. Confira o endereço do portal; o Nexo tenta de novo.";
  if (code === "NOT_CONFIGURED") return "Conecte o Bitrix24 antes de continuar.";
  if (NOT_FOUND_CODES.has(code)) return "O registro não foi encontrado no Bitrix24.";
  if (code === "ERROR_METHOD_NOT_FOUND") return "Este recurso não está disponível no seu Bitrix24 ou falta permissão no webhook.";
  if (options.retryable) return "O Bitrix24 está instável agora. O Nexo tenta de novo sozinho.";
  return `O Bitrix24 recusou a operação (${code}).`;
}

export class BitrixError extends AppError {
  readonly retryable: boolean;
  readonly uncertain: boolean;
  readonly rateLimited: boolean;
  readonly httpStatus: number | null;
  readonly retryAfterMs: number | null;

  constructor(code: string, options: BitrixErrorOptions = {}, message?: string) {
    const retryable = Boolean(options.retryable || options.rateLimited);
    const status = REJECTED_WEBHOOK_CODES.has(code) ? 400 : code === "NOT_CONFIGURED" ? 409 : retryable ? 503 : 502;
    super(code, message ?? bitrixMessage(code, { ...options, retryable }), status, options.description ? { description: options.description } : undefined);
    this.name = "BitrixError";
    this.retryable = retryable;
    this.uncertain = Boolean(options.uncertain);
    this.rateLimited = Boolean(options.rateLimited);
    this.httpStatus = options.httpStatus ?? null;
    this.retryAfterMs = options.retryAfterMs ?? null;
  }
}

export const isBitrixError = (error: unknown): error is BitrixError => error instanceof BitrixError;

/** Classifica um erro do envelope (`error`) e/ou do status HTTP. */
export function classifyBitrixError(code: string | null, httpStatus: number, retryAfterMs: number | null, description: string | null): BitrixError {
  const finalCode = code || `HTTP_${httpStatus}`;
  if ((code && RATE_LIMIT_CODES.has(code)) || httpStatus === 429 || httpStatus === 503) {
    return new BitrixError(finalCode, { rateLimited: true, retryable: true, httpStatus, retryAfterMs, description });
  }
  if (httpStatus >= 500 || code === "INTERNAL_SERVER_ERROR") {
    return new BitrixError(finalCode, { retryable: true, uncertain: true, httpStatus, description });
  }
  return new BitrixError(finalCode, { httpStatus, description });
}
