import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createBitrixClient, type BitrixCallLog } from "@/server/bitrix/client";
import { BitrixError } from "@/server/bitrix/errors";
import { limiterState, rateLimitedUntil, resetLimiterForTests } from "@/server/bitrix/limiter";
import type { FetchLike } from "@/server/bitrix/transport";

const credentials = { portal: "https://empresa.bitrix24.com.br", userId: "1", secret: "s3cr3t" };

/** Relógio falso: `sleep` avança o tempo em vez de esperar. */
function fakeClock(start = 1_000_000) {
  let current = start;
  const sleeps: number[] = [];
  return {
    now: () => current,
    sleep: async (ms: number) => {
      sleeps.push(ms);
      current += ms;
    },
    advance: (ms: number) => (current += ms),
    sleeps,
  };
}

type Reply = { status?: number; body: unknown; headers?: Record<string, string> } | Error;

function scripted(replies: Reply[]) {
  const requests: Array<{ url: string; body: Record<string, unknown> }> = [];
  const transport: FetchLike = async (url, init) => {
    requests.push({ url, body: JSON.parse(String(init.body)) as Record<string, unknown> });
    const reply = replies.shift();
    if (!reply) throw new Error("sem resposta roteirizada");
    if (reply instanceof Error) throw reply;
    return new Response(JSON.stringify(reply.body), { status: reply.status ?? 200, headers: reply.headers });
  };
  return { transport, requests };
}

let logs: BitrixCallLog[];
beforeEach(() => {
  resetLimiterForTests();
  logs = [];
});
afterEach(() => resetLimiterForTests());

function client(replies: Reply[], clock = fakeClock(), extra: Partial<Parameters<typeof createBitrixClient>[0]> = {}) {
  const { transport, requests } = scripted(replies);
  const instance = createBitrixClient({ credentials, transport, sleep: clock.sleep, now: clock.now, log: (entry) => logs.push(entry), ...extra });
  return { instance, requests, clock };
}

describe("transporte e envelope", () => {
  it("faz POST JSON no método do webhook e registra só o nome do método", async () => {
    const { instance, requests } = client([{ body: { result: { ID: "1" }, time: {} } }]);
    await expect(instance.call("user.current")).resolves.toEqual({ ID: "1" });
    expect(requests[0]?.url).toBe("https://empresa.bitrix24.com.br/rest/1/s3cr3t/user.current.json");
    expect(logs).toEqual([{ method: "user.current", ok: true, durationMs: 0 }]);
    expect(JSON.stringify(logs)).not.toContain("s3cr3t");
  });

  it("classifica erros: negado não repete; timeout é incerto; 5xx é incerto e repetível", async () => {
    const denied = client([{ status: 401, body: { error: "insufficient_scope", error_description: "x" } }]);
    const error = await denied.instance.call("crm.item.get").catch((failure: unknown) => failure);
    expect(error).toBeInstanceOf(BitrixError);
    expect(error).toMatchObject({ code: "insufficient_scope", retryable: false, uncertain: false, message: "O Bitrix24 negou a operação. Revise as permissões do webhook." });

    const timeout = client([new DOMException("timeout", "TimeoutError")]);
    await expect(timeout.instance.call("tasks.task.add")).rejects.toMatchObject({ code: "TIMEOUT", uncertain: true, retryable: true });

    const server = client([{ status: 502, body: "<html>" }]);
    await expect(server.instance.call("tasks.task.add")).rejects.toMatchObject({ code: "HTTP_502", uncertain: true, retryable: true });

    const webhook = client([{ status: 401, body: { error: "INVALID_CREDENTIALS" } }]);
    await expect(webhook.instance.call("user.current")).rejects.toMatchObject({ status: 400, message: expect.stringMatching(/recusou o webhook/) });
  });

  it("recusa nomes de método estranhos sem chamar a rede", async () => {
    const { instance, requests } = client([]);
    await expect(instance.call("../user.get")).rejects.toMatchObject({ code: "METHOD_INVALID" });
    expect(requests).toHaveLength(0);
  });
});

describe("limite de taxa", () => {
  it("espera e repete em QUERY_LIMIT_EXCEEDED, 429 e 503, com pausa exponencial", async () => {
    const { instance, clock } = client([
      { status: 503, body: { error: "QUERY_LIMIT_EXCEEDED" } },
      { status: 429, body: {} },
      { body: { result: [1] } },
    ]);
    await expect(instance.call("user.get")).resolves.toEqual([1]);
    // 2 s e depois 4 s de pausa compartilhada.
    expect(clock.sleeps.filter((ms) => ms >= 1000)).toEqual([2000, 4000]);
    expect(limiterState().strikes).toBe(0);
  });

  it("respeita Retry-After e falha como rateLimited quando a pausa é longa", async () => {
    const onRateLimit = vi.fn();
    const { instance, clock } = client([{ status: 429, body: {}, headers: { "Retry-After": "120" } }], fakeClock(), { onRateLimit });
    await expect(instance.call("tasks.task.list")).rejects.toMatchObject({ rateLimited: true, retryable: true });
    expect(onRateLimit).toHaveBeenCalledWith(clock.now() + 120_000);
    expect(rateLimitedUntil(clock.now())).toBe(new Date(clock.now() + 120_000).toISOString());
    // Durante a pausa, novas chamadas nem saem.
    const second = client([{ body: { result: true } }], clock);
    await expect(second.instance.call("scope")).rejects.toMatchObject({ code: "RATE_LIMITED" });
    expect(second.requests).toHaveLength(0);
  });

  it("limita a pausa a 15 minutos", async () => {
    const { instance, clock } = client([{ status: 429, body: {}, headers: { "Retry-After": "99999" } }]);
    await instance.call("x.y").catch(() => undefined);
    expect(limiterState().blockedUntil - clock.now()).toBe(15 * 60_000);
  });

  it("espaça as chamadas em ~2 por segundo", async () => {
    const replies = Array.from({ length: 6 }, () => ({ body: { result: true } }));
    const { instance, clock } = client(replies);
    for (let index = 0; index < 6; index++) await instance.call("scope");
    // Balde de 2: as 4 seguintes esperam 500 ms cada.
    expect(clock.sleeps).toEqual([500, 500, 500, 500]);
  });

  it("divide o mesmo limitador entre cópias do módulo", async () => {
    const first = await import("@/server/bitrix/limiter");
    vi.resetModules();
    const second = await import("@/server/bitrix/limiter");
    expect(second).not.toBe(first);
    first.noteRateLimit(5_000, null, "QUERY_LIMIT_EXCEEDED");
    expect(second.limiterState().blockedUntil).toBe(7_000);
    expect(second.limiterState()).toBe(first.limiterState());
  });
});

describe("paginação e lote", () => {
  it("segue `next` até a última página e lê a chave de itens", async () => {
    const page = (ids: number[], next?: number) => ({ body: { result: { tasks: ids.map((id) => ({ id: String(id) })) }, total: 3, ...(next ? { next } : {}) } });
    const { instance, requests } = client([page([1, 2], 50), page([3])]);
    const tasks = await instance.list<{ id: string }>("tasks.task.list", { filter: { GROUP_ID: 4 } }, { itemsKey: "tasks" });
    expect(tasks.map((task) => task.id)).toEqual(["1", "2", "3"]);
    expect(requests.map((request) => request.body.start)).toEqual([0, 50]);
  });

  it("monta os comandos do batch e separa result_error", async () => {
    const { instance, requests } = client([
      { body: { result: { result: { a_1: 10 }, result_error: { b_2: { error: "ACCESS_DENIED", error_description: "no" } }, result_total: [], result_next: [] } } },
    ]);
    const { results, errors } = await instance.batch({
      a_1: { method: "task.checklistitem.add", params: { TASKID: 1, FIELDS: { TITLE: "Conta", PARENT_ID: 9 } } },
      b_2: { method: "tasks.task.get", params: { taskId: 2 } },
    });
    expect(requests[0]?.body).toEqual({
      halt: 0,
      cmd: { a_1: "task.checklistitem.add?TASKID=1&FIELDS[TITLE]=Conta&FIELDS[PARENT_ID]=9", b_2: "tasks.task.get?taskId=2" },
    });
    expect(results).toEqual({ a_1: 10 });
    expect(errors.b_2).toMatchObject({ code: "ACCESS_DENIED", retryable: false });
  });

  it("divide lotes acima de 50 comandos e aceita respostas vazias como lista", async () => {
    const commands = Object.fromEntries(Array.from({ length: 51 }, (_, index) => [`c${index}`, { method: "scope" }]));
    const { instance, requests } = client([{ body: { result: { result: [], result_error: [] } } }, { body: { result: { result: { c50: ["task"] }, result_error: [] } } }]);
    const { results } = await instance.batch(commands);
    expect(requests).toHaveLength(2);
    expect(Object.keys((requests[0]?.body.cmd as Record<string, string>) ?? {})).toHaveLength(50);
    expect(results).toEqual({ c50: ["task"] });
  });
});
