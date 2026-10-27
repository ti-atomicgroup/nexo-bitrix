import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { allowedTarget, createWorker } from "../../../scripts/bitrix-worker.mjs";
import { isWorkerRequest, relayTransport } from "@/server/bitrix/relay";
import { sendBitrixRequest } from "@/server/bitrix/transport";

const TOKEN = "token-interno-de-teste-123";
const CREDENTIALS = { portal: "https://empresa.bitrix24.com.br", userId: "7", secret: "s3gr3d0" };

let close: (() => Promise<void>) | null = null;
afterEach(async () => {
  await close?.();
  close = null;
  vi.unstubAllEnvs();
});

/** Worker de verdade numa porta livre, com o "Bitrix" simulado por `fetchImpl`. */
async function startWorker(fetchImpl: typeof fetch) {
  const { server, tick } = createWorker({ token: TOKEN, appPort: 4999, fetchImpl });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  close = () => new Promise((resolve) => server.close(() => resolve()));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { url, tick, transport: relayTransport({ url, token: TOKEN }) };
}

describe("worker do Bitrix24", () => {
  it("faz a chamada REST no lugar do Nexo e devolve a resposta como veio", async () => {
    const bitrix = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(async () => Response.json({ result: { ID: "7" } }));
    const { transport } = await startWorker(bitrix as unknown as typeof fetch);
    const envelope = await sendBitrixRequest(CREDENTIALS, "user.current", { a: 1 }, { transport });
    expect(envelope.result).toEqual({ ID: "7" });
    const [target, init] = bitrix.mock.calls[0]!;
    expect(target).toBe("https://empresa.bitrix24.com.br/rest/7/s3gr3d0/user.current.json");
    expect(init).toMatchObject({ method: "POST", redirect: "error", body: expect.anything() });
  });

  it("repassa o erro de rede com o código técnico (ex.: UND_ERR_CONNECT_TIMEOUT)", async () => {
    const offline = async () => {
      throw Object.assign(new TypeError("fetch failed"), { cause: { code: "UND_ERR_CONNECT_TIMEOUT" } });
    };
    const { transport } = await startWorker(offline as unknown as typeof fetch);
    await expect(sendBitrixRequest(CREDENTIALS, "user.current", {}, { transport })).rejects.toMatchObject({
      code: "TRANSPORT_ERROR",
      details: { description: "UND_ERR_CONNECT_TIMEOUT" },
    });
  });

  it("repassa o limite do Bitrix24 (status e Retry-After)", async () => {
    const limited = async () => Response.json({ error: "QUERY_LIMIT_EXCEEDED" }, { status: 503, headers: { "Retry-After": "2" } });
    const { transport } = await startWorker(limited as unknown as typeof fetch);
    await expect(sendBitrixRequest(CREDENTIALS, "user.current", {}, { transport })).rejects.toMatchObject({ rateLimited: true });
  });

  it("recusa token errado e endereço fora do Bitrix24 sem chamar ninguém", async () => {
    const bitrix = vi.fn(async () => Response.json({ result: true }));
    const { url } = await startWorker(bitrix as unknown as typeof fetch);
    const wrong = await fetch(`${url}/bitrix`, { method: "POST", headers: { Authorization: "Bearer outro", "X-Nexo-Target": "https://empresa.bitrix24.com.br/rest/1/x/scope.json" } });
    expect(wrong.status).toBe(401);
    const outside = await fetch(`${url}/bitrix`, { method: "POST", headers: { Authorization: `Bearer ${TOKEN}`, "X-Nexo-Target": "https://exemplo.com/rest/1/x/scope.json" } });
    expect(outside.status).toBe(400);
    expect(bitrix).not.toHaveBeenCalled();
    expect(allowedTarget("http://empresa.bitrix24.com.br/rest/x")).toBeNull();
    expect(allowedTarget("https://empresa.bitrix24.com.br/admin")).toBeNull();
    expect(allowedTarget("https://empresa.bitrix24.com.br:8443/rest/x")).toBeNull();
    expect(allowedTarget("https://empresa.bitrix24.com.br/rest/1/x/scope.json")?.hostname).toBe("empresa.bitrix24.com.br");
  });

  it("acorda o motor pela rota interna em 127.0.0.1 com o token", async () => {
    const calls: Array<[string, RequestInit | undefined]> = [];
    const spy = async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push([String(input), init]);
      return Response.json({ ok: true });
    };
    const { tick } = await startWorker(spy as unknown as typeof fetch);
    await tick();
    expect(calls[0]?.[0]).toBe("http://127.0.0.1:4999/api/jobs/tick");
    expect(calls[0]?.[1]?.headers).toEqual({ Authorization: `Bearer ${TOKEN}` });
  });

  it("worker fora do ar vira erro de transporte que o motor tenta de novo", async () => {
    const transport = relayTransport({ url: "http://127.0.0.1:1", token: TOKEN });
    await expect(sendBitrixRequest(CREDENTIALS, "scope", {}, { transport })).rejects.toMatchObject({
      code: "TRANSPORT_ERROR",
      retryable: true,
      details: { description: "NEXO_WORKER_OFFLINE" },
    });
  });

  it("a rota interna só aceita o token do worker", () => {
    vi.stubEnv("NEXO_BITRIX_WORKER_URL", "http://127.0.0.1:3901");
    vi.stubEnv("NEXO_WORKER_TOKEN", TOKEN);
    expect(isWorkerRequest(new Request("http://localhost/api/jobs/tick", { headers: { authorization: `Bearer ${TOKEN}` } }))).toBe(true);
    expect(isWorkerRequest(new Request("http://localhost/api/jobs/tick", { headers: { authorization: "Bearer outro" } }))).toBe(false);
    vi.unstubAllEnvs();
    vi.stubEnv("NEXO_WORKER_TOKEN", "");
    expect(isWorkerRequest(new Request("http://localhost/api/jobs/tick", { headers: { authorization: `Bearer ${TOKEN}` } }))).toBe(false);
  });
});
