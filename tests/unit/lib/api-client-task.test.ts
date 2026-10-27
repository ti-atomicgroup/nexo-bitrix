import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, ApiError } from "@/lib/api-client";

/** Respostas em sequência para o fetch do cliente; cada chamada registra método e caminho. */
function mockFetch(responses: Array<Response | Error>) {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string, init: RequestInit) => {
      calls.push(`${init.method} ${path}`);
      const next = responses.shift();
      if (!next) throw new Error("sem resposta preparada");
      if (next instanceof Error) throw next;
      return next;
    }),
  );
  return calls;
}

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("trabalho em segundo plano no cliente (202 + consulta)", () => {
  it("começa, consulta até terminar e devolve o resultado; tolera uma falha de rede no meio", async () => {
    const calls = mockFetch([
      json(202, { taskId: "t1" }),
      json(200, { state: "running" }),
      new TypeError("Failed to fetch"),
      json(200, { state: "done", result: { portal: "empresa.bitrix24.com.br" } }),
    ]);
    const pending = api.setupConnect({ webhookUrl: "https://empresa.bitrix24.com.br/rest/1/abc/" });
    await vi.advanceTimersByTimeAsync(5_000);
    await expect(pending).resolves.toEqual({ portal: "empresa.bitrix24.com.br" });
    expect(calls).toEqual(["POST /api/setup/connect", "GET /api/tasks/t1", "GET /api/tasks/t1", "GET /api/tasks/t1"]);
  });

  it("falha do trabalho chega como ApiError com a mensagem do servidor", async () => {
    mockFetch([
      json(202, { taskId: "t2" }),
      json(422, { error: { code: "SCOPES_MISSING", message: "Marque CRM no webhook do Bitrix24, salve e cole o endereço de novo." } }),
    ]);
    const pending = api.setupPrepare({ companyName: "Atomic" }).catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(2_000);
    const error = await pending;
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ code: "SCOPES_MISSING", status: 422, message: "Marque CRM no webhook do Bitrix24, salve e cole o endereço de novo." });
  });

  it("desiste depois de 3 minutos com mensagem clara", async () => {
    mockFetch([json(202, { taskId: "t3" }), ...Array.from({ length: 400 }, () => json(200, { state: "running" }))]);
    const pending = api.setupConnect({ webhookUrl: "https://empresa.bitrix24.com.br/rest/1/abc/" }).catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(4 * 60 * 1000);
    expect(await pending).toMatchObject({ code: "task_timeout" });
  });
});
