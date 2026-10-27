import "server-only";
import { safeEqual } from "../security/crypto";
import type { FetchLike } from "./transport";

/**
 * Chamadas ao Bitrix24 pelo worker (scripts/bitrix-worker.mjs), como a Onnira pede: o servidor do Nexo não abre conexão
 * com o Bitrix; manda cada chamada ao worker por http://127.0.0.1 e recebe a resposta como veio do Bitrix.
 * Sem o worker configurado (testes, `next dev`, `npm run start:web`), chama o Bitrix direto.
 */
export interface WorkerConfig {
  url: string;
  token: string;
}

export function workerConfig(): WorkerConfig | null {
  const url = process.env.NEXO_BITRIX_WORKER_URL?.trim();
  const token = process.env.NEXO_WORKER_TOKEN?.trim();
  return url && token ? { url: url.replace(/\/+$/, ""), token } : null;
}

/** Recria o erro de rede que o worker viu, para a classificação de sempre (TIMEOUT ou TRANSPORT_ERROR com o código). */
function networkFailure(code: string): Error {
  if (code === "TimeoutError") return new DOMException("O Bitrix24 não respondeu a tempo.", "TimeoutError");
  return Object.assign(new TypeError("fetch failed"), { cause: { code } });
}

export function relayTransport(config: WorkerConfig, transport: FetchLike = (input, init) => fetch(input, init)): FetchLike {
  return async (input, init) => {
    let response: Response;
    try {
      response = await transport(`${config.url}/bitrix`, {
        method: "POST",
        headers: { Authorization: `Bearer ${config.token}`, "Content-Type": "application/json", "X-Nexo-Target": input },
        body: init.body,
        redirect: "error",
        signal: init.signal,
      });
    } catch (error) {
      if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) throw error;
      // O worker não respondeu (subindo ou reiniciando): erro de transporte, o motor tenta de novo.
      throw networkFailure("NEXO_WORKER_OFFLINE");
    }
    const relayError = response.headers.get("x-nexo-relay-error");
    if (relayError) {
      await response.body?.cancel();
      throw networkFailure(relayError);
    }
    return response;
  };
}

/** Transporte padrão do cliente Bitrix: pelo worker quando ele está configurado; senão, direto. */
export function bitrixTransport(): FetchLike {
  const config = workerConfig();
  return config ? relayTransport(config) : (input, init) => fetch(input, init);
}

/** Pedido interno do worker (rota /api/jobs/tick): só com o token combinado no `npm start`. */
export function isWorkerRequest(request: Request): boolean {
  const config = workerConfig();
  const header = request.headers.get("authorization") ?? "";
  return Boolean(config) && safeEqual(header, `Bearer ${config!.token}`);
}

/** Teste de saída feito pelo próprio worker (é ele que conversa com o Bitrix24). */
export async function workerProbe(host: string): Promise<Record<string, unknown> | null> {
  const config = workerConfig();
  if (!config) return null;
  try {
    const response = await fetch(`${config.url}/probe?host=${encodeURIComponent(host)}`, {
      headers: { Authorization: `Bearer ${config.token}` },
      signal: AbortSignal.timeout(15_000),
    });
    return (await response.json()) as Record<string, unknown>;
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.name : String(error), worker: "sem resposta" };
  }
}
