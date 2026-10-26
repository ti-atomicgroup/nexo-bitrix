import "server-only";
import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
import { createBitrixClient, type BitrixClient } from "../bitrix/client";
import { BitrixError } from "../bitrix/errors";
import { blockedUntil, rateLimitedUntil } from "../bitrix/limiter";
import type { FetchLike } from "../bitrix/transport";
import { parseWebhookUrl, type BitrixCredentials } from "../bitrix/webhook-url";
import { getCompany, getProject, getSyncState, getWebhookRecord, patchSyncState, type ProjectRecord } from "../db/repos/settings";
import { decrypt } from "../security/crypto";

/**
 * Cliente Bitrix do processo (um por webhook gravado) e contexto do ciclo.
 * Fica em globalThis: rotas, instrumentation e motor podem ter cópias diferentes deste módulo.
 */
const RUNTIME_KEY = Symbol.for("nexo.bitrix.runtime");

interface RuntimeState {
  key: string | null;
  client: BitrixClient | null;
  transport: FetchLike | null;
  sleep: ((ms: number) => Promise<void>) | null;
  processId: string;
}

type RuntimeGlobal = typeof globalThis & { [RUNTIME_KEY]?: RuntimeState };

function state(): RuntimeState {
  const global = globalThis as RuntimeGlobal;
  global[RUNTIME_KEY] ??= { key: null, client: null, transport: null, sleep: null, processId: `${hostname()}:${process.pid}:${randomUUID().slice(0, 8)}` };
  return global[RUNTIME_KEY];
}

/** Identifica este processo no lease do ciclo. */
export function processId(): string {
  return state().processId;
}

function mirrorRateLimit(until: number): void {
  try {
    patchSyncState({ rateLimitedUntil: new Date(until).toISOString() });
  } catch {
    // o espelhamento no SQLite é só informativo
  }
}

/** Cliente para credenciais avulsas (ex.: validar um webhook ainda não gravado). Usa o limitador compartilhado. */
export function createRuntimeClient(credentials: BitrixCredentials): BitrixClient {
  const current = state();
  return createBitrixClient({
    credentials,
    transport: current.transport ?? undefined,
    sleep: current.sleep ?? undefined,
    onRateLimit: mirrorRateLimit,
  });
}

/** Cliente do webhook gravado, ou null se o Bitrix ainda não foi conectado. */
export function getBitrix(): BitrixClient | null {
  const record = getWebhookRecord();
  if (!record) return null;
  const current = state();
  if (current.client && current.key === record.encryptedUrl) return current.client;
  const client = createRuntimeClient(parseWebhookUrl(decrypt(record.encryptedUrl)));
  current.key = record.encryptedUrl;
  current.client = client;
  return client;
}

export function requireBitrix(): BitrixClient {
  const client = getBitrix();
  if (!client) throw new BitrixError("NOT_CONFIGURED", {});
  return client;
}

/** Para testes: troca o transporte (ex.: FakeBitrix) e, por padrão, elimina as esperas do limitador. */
export function setBitrixTransportForTests(transport: FetchLike | null, options: { sleep?: (ms: number) => Promise<void> } = {}): void {
  const current = state();
  current.transport = transport;
  current.sleep = transport ? (options.sleep ?? (async () => undefined)) : null;
  current.client = null;
  current.key = null;
}

export interface EngineContext {
  client: BitrixClient;
  portal: string;
  /** Dono do webhook: cria as tarefas e organiza as reuniões. */
  ownerId: string;
  scopes: string[];
  timezone: string;
  project: ProjectRecord | null;
  /** Ligado quando o Bitrix limita a taxa: o resto do ciclo não chama mais o Bitrix. */
  rateLimited: boolean;
}

export function engineContext(): EngineContext | null {
  const record = getWebhookRecord();
  const client = getBitrix();
  if (!record || !client) return null;
  return {
    client,
    portal: record.portal,
    ownerId: record.owner.bitrixUserId,
    scopes: record.scopes,
    timezone: getCompany().timezone,
    project: getProject(),
    // Pausa longa em andamento: nem tenta (cada tentativa gastaria uma tentativa de job).
    rateLimited: blockedUntil() - Date.now() > 5_000,
  };
}

/** ISO até quando o Bitrix está limitando a taxa (memória do processo; se reiniciou, o valor gravado no SQLite). */
export function bitrixRateLimitedUntil(now: number = Date.now()): string | null {
  const live = rateLimitedUntil(now);
  if (live) return live;
  try {
    const stored = getSyncState().rateLimitedUntil;
    return stored && Date.parse(stored) > now ? stored : null;
  } catch {
    return null;
  }
}
