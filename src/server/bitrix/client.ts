import "server-only";
import { logBitrixCall } from "../db/repos/api-log";
import { BitrixError, classifyBitrixError, isBitrixError } from "./errors";
import { blockedUntil, noteRateLimit, noteSuccess, takeToken } from "./limiter";
import { buildQuery } from "./query";
import { DEFAULT_TIMEOUT_MS, isValidMethod, sendBitrixRequest, type BitrixEnvelope, type FetchLike } from "./transport";
import type { BitrixCredentials } from "./webhook-url";

export type BitrixParams = Record<string, unknown>;
export type BatchCommands = Record<string, { method: string; params?: BitrixParams }>;

export interface BatchResult {
  results: Record<string, unknown>;
  errors: Record<string, BitrixError>;
}

export interface ListOptions {
  /** Para respostas como { tasks: [...] } ou { items: [...] }. */
  itemsKey?: string;
  maxPages?: number;
}

export interface BitrixClient {
  readonly portal: string;
  /** `timeoutMs` só para chamadas longas (ex.: envio de arquivo ao Drive). */
  call<T = unknown>(method: string, params?: BitrixParams, options?: { timeoutMs?: number }): Promise<T>;
  /** Lê todas as páginas (50 por página) seguindo `next`. */
  list<T = unknown>(method: string, params?: BitrixParams, options?: ListOptions): Promise<T[]>;
  /** Até 50 comandos por chamada (divide sozinho); erros por comando vêm em `errors`. */
  batch(commands: BatchCommands, options?: { halt?: boolean }): Promise<BatchResult>;
}

export interface BitrixCallLog {
  method: string;
  ok: boolean;
  errorCode?: string | null;
  durationMs: number;
}

export interface BitrixClientOptions {
  credentials: BitrixCredentials | (() => BitrixCredentials | null);
  transport?: FetchLike;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  log?: (entry: BitrixCallLog) => void;
  /** Avisado quando o Bitrix limita a taxa (ex.: espelhar em `patchSyncState`). */
  onRateLimit?: (until: number) => void;
  /** Pausas curtas acontecem dentro da chamada; acima disso a chamada falha como `rateLimited` e o ciclo tenta depois. */
  maxInlineWaitMs?: number;
  maxAttempts?: number;
  timeoutMs?: number;
}

const BATCH_LIMIT = 50;
const PAGE_SIZE = 50;

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function safeLog(entry: BitrixCallLog): void {
  try {
    logBitrixCall(entry);
  } catch {
    // o registro de chamadas nunca pode derrubar a integração
  }
}

export const asRecord = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

/** No PHP, objeto vazio vira `[]` e chaves numéricas viram lista: normaliza para objeto. */
function keyed(value: unknown): Record<string, unknown> {
  if (Array.isArray(value)) return Object.fromEntries(value.map((item, index) => [String(index), item]));
  return asRecord(value);
}

export function createBitrixClient(options: BitrixClientOptions): BitrixClient {
  const transport: FetchLike = options.transport ?? ((input, init) => fetch(input, init));
  const sleep = options.sleep ?? defaultSleep;
  const now = options.now ?? Date.now;
  const log = options.log ?? safeLog;
  const maxInlineWaitMs = options.maxInlineWaitMs ?? 5_000;
  const maxAttempts = options.maxAttempts ?? 3;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const credentials = (): BitrixCredentials => {
    const value = typeof options.credentials === "function" ? options.credentials() : options.credentials;
    if (!value) throw new BitrixError("NOT_CONFIGURED", {});
    return value;
  };

  const rateLimited = (code: string, retryAfterMs: number | null): number => {
    const until = noteRateLimit(now(), retryAfterMs, code);
    try {
      options.onRateLimit?.(until);
    } catch {
      // só espelhamento
    }
    return until;
  };

  async function gate(): Promise<void> {
    const wait = blockedUntil() - now();
    if (wait > 0) {
      if (wait > maxInlineWaitMs) throw new BitrixError("RATE_LIMITED", { rateLimited: true, retryAfterMs: wait });
      await sleep(wait);
    }
    await takeToken(now, sleep);
  }

  async function request(method: string, params: BitrixParams, callTimeoutMs = timeoutMs): Promise<BitrixEnvelope> {
    const target = credentials();
    for (let attempt = 1; ; attempt++) {
      await gate();
      const started = now();
      try {
        const envelope = await sendBitrixRequest(target, method, params, { transport, timeoutMs: callTimeoutMs, now });
        log({ method, ok: true, durationMs: now() - started });
        noteSuccess();
        return envelope;
      } catch (error) {
        const failure = isBitrixError(error) ? error : new BitrixError("TRANSPORT_ERROR", { retryable: true, uncertain: true });
        log({ method, ok: false, errorCode: failure.code, durationMs: now() - started });
        if (failure.rateLimited) {
          const until = rateLimited(failure.code, failure.retryAfterMs);
          if (attempt < maxAttempts && until - now() <= maxInlineWaitMs) continue;
        }
        throw failure;
      }
    }
  }

  async function call<T>(method: string, params: BitrixParams = {}, callOptions: { timeoutMs?: number } = {}): Promise<T> {
    return (await request(method, params, callOptions.timeoutMs ?? timeoutMs)).result as T;
  }

  async function list<T>(method: string, params: BitrixParams = {}, listOptions: ListOptions = {}): Promise<T[]> {
    const maxPages = listOptions.maxPages ?? 100;
    const items: T[] = [];
    let start = 0;
    for (let page = 0; page < maxPages; page++) {
      const envelope = await request(method, { ...params, start });
      const raw = listOptions.itemsKey ? asRecord(envelope.result)[listOptions.itemsKey] : envelope.result;
      const pageItems = (Array.isArray(raw) ? raw : Object.values(keyed(raw))) as T[];
      items.push(...pageItems);
      if (envelope.next !== undefined && envelope.next > start) start = envelope.next;
      else if (envelope.total !== undefined && pageItems.length === PAGE_SIZE && start + PAGE_SIZE < envelope.total) start += PAGE_SIZE;
      else return items;
    }
    throw new BitrixError("PAGINATION_LIMIT", {}, "Há registros demais no Bitrix24 para ler de uma vez. Refine a configuração.");
  }

  async function batch(commands: BatchCommands, batchOptions: { halt?: boolean } = {}): Promise<BatchResult> {
    const entries = Object.entries(commands);
    const results: Record<string, unknown> = {};
    const errors: Record<string, BitrixError> = {};
    for (let index = 0; index < entries.length; index += BATCH_LIMIT) {
      const cmd: Record<string, string> = {};
      for (const [key, command] of entries.slice(index, index + BATCH_LIMIT)) {
        // Chaves numéricas fariam o PHP devolver lista em vez de objeto.
        if (!/^[A-Za-z_][\w-]*$/.test(key)) throw new BitrixError("BATCH_KEY_INVALID", {}, "Chave de comando inválida no lote.");
        if (!isValidMethod(command.method) || command.method === "batch") throw new BitrixError("METHOD_INVALID", {}, "Método do Bitrix24 inválido.");
        const query = buildQuery(command.params ?? {});
        cmd[key] = query ? `${command.method}?${query}` : command.method;
      }
      const response = asRecord(await call("batch", { halt: batchOptions.halt ? 1 : 0, cmd }));
      Object.assign(results, keyed(response.result));
      for (const [key, value] of Object.entries(keyed(response.result_error))) {
        const detail = asRecord(value);
        const code = typeof detail.error === "string" && detail.error ? detail.error : "BATCH_COMMAND_FAILED";
        const description = typeof detail.error_description === "string" ? detail.error_description.slice(0, 300) : null;
        const failure = classifyBitrixError(code, 400, null, description);
        if (failure.rateLimited) rateLimited(code, null);
        errors[key] = failure;
      }
      if (batchOptions.halt && Object.keys(errors).length) break;
    }
    return { results, errors };
  }

  return {
    get portal() {
      return credentials().portal;
    },
    call,
    list,
    batch,
  };
}
