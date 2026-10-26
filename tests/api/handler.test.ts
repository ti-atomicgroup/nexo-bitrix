import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import * as engine from "@/server/engine";
import { AppError } from "@/server/errors";
import { FORBIDDEN_MESSAGE, INTERNAL_MESSAGE, route, UNAUTHENTICATED_MESSAGE } from "@/server/http/handler";
import { loginInput, peopleQueryInput } from "@/shared/schemas";
import { useTestDb } from "../support/db";
import { call, seedUser, type ApiErrorBody } from "./support/seed";

vi.mock("@/server/engine", async () => (await import("./support/engine-mock")).engineMock());

let cleanup: () => void;
let logs: string[];
beforeEach(() => {
  cleanup = useTestDb().cleanup;
  logs = [];
  vi.spyOn(console, "log").mockImplementation((line: unknown) => void logs.push(String(line)));
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("envoltório das rotas", () => {
  it("responde JSON sem cache e com o id da requisição", async () => {
    const handler = route({ auth: "public" }, () => ({ hello: "mundo" }));
    const result = await call<{ hello: string }>(handler);
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ hello: "mundo" });
    expect(result.headers.get("cache-control")).toBe("no-store");
    expect(result.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("religa o agendador a cada requisição sem nunca falhar por causa dele", async () => {
    vi.mocked(engine.ensureScheduler).mockImplementation(() => {
      throw new Error("agendador fora do ar");
    });
    const result = await call(route({ auth: "public" }, () => ({ ok: true })));
    expect(result.status).toBe(200);
    expect(engine.ensureScheduler).toHaveBeenCalled();
  });

  it("devolve 401 sem token ou com token inválido, antes de ler o corpo", async () => {
    const service = vi.fn(() => ({ ok: true }));
    const handler = route({ auth: "user", input: loginInput }, service);
    for (const token of [undefined, "token-que-nao-existe-1234567890"]) {
      const result = await call<ApiErrorBody>(handler, { token, rawBody: "{quebrado" });
      expect(result.status).toBe(401);
      expect(result.body.error).toEqual({ code: "UNAUTHENTICATED", message: UNAUTHENTICATED_MESSAGE });
      expect(result.headers.get("cache-control")).toBe("no-store");
    }
    expect(service).not.toHaveBeenCalled();
  });

  it("devolve 403 para RH em rota de administrador e libera o administrador", async () => {
    const rh = await seedUser({ role: "rh" });
    const admin = await seedUser({ role: "admin" });
    const handler = route({ auth: "admin" }, ({ user, actor }) => ({ user: user.id, actor }));
    const denied = await call<ApiErrorBody>(handler, { token: rh.token });
    expect(denied.status).toBe(403);
    expect(denied.body.error).toEqual({ code: "FORBIDDEN", message: FORBIDDEN_MESSAGE });
    const allowed = await call<{ user: string; actor: unknown }>(handler, { token: admin.token });
    expect(allowed.status).toBe(200);
    expect(allowed.body).toEqual({ user: admin.user.id, actor: { type: "user", id: admin.user.id, name: admin.user.name } });
  });

  it("valida o corpo com zod e devolve a primeira mensagem em pt-BR", async () => {
    const handler = route({ auth: "public", input: loginInput }, ({ input }) => input);
    const missing = await call<ApiErrorBody>(handler, { body: { email: "a@b.com" } });
    expect(missing.status).toBe(400);
    expect(missing.body.error).toMatchObject({ code: "INVALID_INPUT", message: "Preencha este campo.", details: { field: "password" } });
    const custom = await call<ApiErrorBody>(handler, { body: { email: "nao-e-email", password: "x" } });
    expect(custom.body.error.message).toBe("Informe um e-mail válido.");
    const broken = await call<ApiErrorBody>(handler, { rawBody: "{quebrado" });
    expect(broken.status).toBe(400);
    expect(broken.body.error).toEqual({ code: "INVALID_INPUT", message: "Envie os dados em JSON válido." });
    const ok = await call<{ email: string }>(handler, { body: { email: "a@b.com", password: "x" } });
    expect(ok.body.email).toBe("a@b.com");
  });

  it("traduz mensagens padrão do zod sem mensagem própria", async () => {
    const handler = route({ auth: "public", input: z.object({ n: z.number().max(3), kind: z.enum(["a", "b"]), list: z.array(z.string()).min(2) }) }, () => ({}));
    const tooBig = await call<ApiErrorBody>(handler, { body: { n: 9, kind: "a", list: ["x", "y"] } });
    expect(tooBig.body.error.message).toBe("Use um valor até 3.");
    const option = await call<ApiErrorBody>(handler, { body: { n: 1, kind: "z", list: ["x", "y"] } });
    expect(option.body.error.message).toBe("Escolha uma das opções disponíveis.");
    const short = await call<ApiErrorBody>(handler, { body: { n: 1, kind: "a", list: ["x"] } });
    expect(short.body.error.message).toBe("Inclua pelo menos 2 itens.");
  });

  it("lê a query string em GET", async () => {
    const handler = route({ auth: "public", input: peopleQueryInput }, ({ input }) => input);
    const result = await call<{ query: string; limit: number }>(handler, { path: "/api/people?query=%20ana%20&limit=5" });
    expect(result.body).toEqual({ query: "ana", limit: 5 });
    const invalid = await call<ApiErrorBody>(handler, { path: "/api/people?limit=500" });
    expect(invalid.body.error).toMatchObject({ code: "INVALID_INPUT", message: "Use um valor até 50.", details: { field: "limit" } });
  });

  it("recusa corpo acima de 1 MB", async () => {
    const handler = route({ auth: "public", input: z.object({ text: z.string() }) }, () => ({}));
    const result = await call<ApiErrorBody>(handler, { body: { text: "x".repeat(1024 * 1024 + 10) } });
    expect(result.status).toBe(413);
    expect(result.body.error.code).toBe("PAYLOAD_TOO_LARGE");
  });

  it("devolve 404 quando falta um parâmetro do caminho", async () => {
    const handler = route({ auth: "public", params: ["journeyId"] }, ({ params }) => params);
    expect((await call(handler, { params: { journeyId: "" } })).status).toBe(404);
    expect((await call<{ journeyId: string }, "journeyId">(handler, { params: { journeyId: "j1" } })).body).toEqual({ journeyId: "j1" });
  });

  it("converte AppError no status, código e mensagem do serviço (com detalhes seguros)", async () => {
    const handler = route({ auth: "public" }, () => {
      throw new AppError("SCOPES_MISSING", "Marque CRM no webhook.", 422, { missing: ["crm"] });
    });
    const result = await call<ApiErrorBody>(handler);
    expect(result.status).toBe(422);
    expect(result.body.error).toEqual({ code: "SCOPES_MISSING", message: "Marque CRM no webhook.", details: { missing: ["crm"] } });
  });

  it("erro inesperado vira 500 genérico, sem vazar a causa, e vai para o log com o id", async () => {
    const handler = route({ auth: "public" }, async () => {
      throw new Error("falha interna em https://empresa.bitrix24.com.br/rest/1/segredo123/");
    });
    const result = await call<ApiErrorBody>(handler);
    expect(result.status).toBe(500);
    expect(result.body.error).toMatchObject({ code: "INTERNAL", message: INTERNAL_MESSAGE });
    expect(result.text).not.toContain("falha interna");
    const requestId = result.headers.get("x-request-id");
    expect(result.body.error.requestId).toBe(requestId);
    const line = logs.map((entry) => JSON.parse(entry) as Record<string, unknown>).find((entry) => entry.event === "request_failed");
    expect(line).toMatchObject({ level: "error", requestId, status: 500 });
    expect(logs.join("\n")).not.toContain("segredo123");
  });

  it("deixa o Next tratar notFound()/redirect()", async () => {
    const control = Object.assign(new Error("NEXT_HTTP_ERROR_FALLBACK;404"), { digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
    const handler = route({ auth: "public" }, () => {
      throw control;
    });
    await expect(handler(new Request("http://localhost/api/x"))).rejects.toBe(control);
  });
});
