import { afterEach, expect, it, vi } from "vitest";
import type { SessionInfo } from "../../src/shared/contracts";
import type { createRuntime } from "../../src/server/runtime";
import { chatApi, createOpenApiDocument, openApiResponse } from "../../src/server/chat-api";
import { workspace } from "../../src/server/workspace";

vi.mock("../../src/server/workspace", () => ({ workspace: vi.fn() }));
afterEach(() => vi.clearAllMocks());

const session: SessionInfo = {
  user: { id: "1", name: "RH de teste", position: "People", department: "RH", active: true },
  role: "admin", portalDomain: "acme.bitrix24.com", memberId: "acme.bitrix24.com", expiresAt: "2099-01-01T00:00:00.000Z", canManage: true, canConfigure: true,
};
function runtime() {
  return {
    env: { chatApiKey: "nexo-chat-key-for-tests-0123456789" },
    auth: { chatSession: vi.fn(() => session) },
    journeys: { create: vi.fn(async (_session: SessionInfo, value: unknown) => ({ id: "journey-1", ...(value as object) })), action: vi.fn(async () => ({ id: "task-1", status: "completed" })), get: vi.fn(() => ({ id: "journey-1" })), visible: vi.fn(async () => ({ id: "journey-1" })), complete: vi.fn(async () => ({ id: "journey-1", status: "completed" })), setPaused: vi.fn(async () => ({ id: "journey-1", status: "paused" })) },
  } as unknown as ReturnType<typeof createRuntime>;
}
function request(path: string, init: RequestInit = {}) {
  return new Request(`https://nexo.example.com/api/chat/v1${path}`, init);
}

it("protege chamadas com Bearer e não chama o domínio quando a chave está ausente ou errada", async () => {
  const app = runtime();
  for (const authorization of [null, "Bearer incorreta"]) {
    const headers = new Headers(); if (authorization) headers.set("Authorization", authorization);
    const response = await chatApi(request("/journeys", { headers }), "journeys", undefined, app);
    expect(response.status).toBe(401);
  }
  const disabled = runtime(); (disabled.env as { chatApiKey: string | null }).chatApiKey = null;
  const unavailable = await chatApi(request("/workspace"), "workspace", undefined, disabled);
  expect(unavailable.status).toBe(503);
  expect(app.auth.chatSession).not.toHaveBeenCalled();
});

it("consulta jornadas e cria jornada por um modelo existente usando requestId", async () => {
  const app = runtime();
  vi.mocked(workspace).mockResolvedValue({ journeys: [{ id: "journey-1", type: "onboarding", employee: { name: "Ana" }, templateName: "Vendas", status: "active", progress: 25, referenceDate: "2026-10-23", taskCount: 4, completedCount: 1 }] } as never);
  const headers = { Authorization: "Bearer nexo-chat-key-for-tests-0123456789", "Content-Type": "application/json" };
  const listed = await chatApi(request("/journeys?status=active", { headers }), "journeys", undefined, app);
  expect(await listed.json()).toMatchObject({ data: [{ id: "journey-1", employee: "Ana", progress: 25 }] });
  const payload = { requestId: "onnira-req-2026-001", type: "onboarding", templateId: "vendas", employeeId: "2", referenceDate: "2026-10-26", assignees: {} };
  const created = await chatApi(request("/journeys", { method: "POST", headers, body: JSON.stringify(payload) }), "journeys", undefined, app);
  expect(created.status).toBe(200);
  expect(app.journeys.create).toHaveBeenCalledWith(session, expect.objectContaining({ requestId: payload.requestId, templateId: "vendas" }));
});

it("retorna atividades liberadas vencidas e com prazo hoje no fuso configurado", async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-23T15:00:00.000Z"));
  const app = runtime();
  vi.mocked(workspace).mockResolvedValue({ settings: { timezone: "America/Sao_Paulo" }, lastSyncAt: "2026-10-23T14:00:00.000Z", journeys: [{ id: "journey-1", type: "onboarding", employee: { name: "Ana" }, status: "active", tasks: [
    { id: "late", title: "Criar acessos", releaseState: "released", status: "pending", dueAt: "2026-10-22T20:00:00.000Z", critical: true, bitrixUrl: "https://acme.bitrix24.com/tasks/1" },
    { id: "today", title: "Entrevista", releaseState: "released", status: "pending", dueAt: "2026-10-23T20:00:00.000Z", critical: false, bitrixUrl: null },
    { id: "waiting", title: "30 dias", releaseState: "waiting", status: "pending", dueAt: "2026-10-23T20:00:00.000Z", critical: false },
    { id: "done", title: "Acolhimento", releaseState: "released", status: "completed", dueAt: "2026-10-22T20:00:00.000Z", critical: false },
  ] }] } as never);
  try {
    const response = await chatApi(request("/workspace", { headers: { Authorization: "Bearer nexo-chat-key-for-tests-0123456789" } }), "workspace", undefined, app);
    const body = await response.json();
    expect(body.data.today.map((item: { taskId: string }) => item.taskId)).toEqual(["late", "today"]);
    expect(body.data.today[0]).toMatchObject({ overdue: true, reason: "Prazo ultrapassado", critical: true });
    expect(body.data.lastSyncAt).toBe("2026-10-23T14:00:00.000Z");
  } finally { vi.useRealTimers(); }
});

it("busca pessoas por nome, cargo ou área sem retornar dados de login", async () => {
  const app = runtime();
  vi.mocked(workspace).mockResolvedValue({ users: [
    { id: "2", name: "Maria Silva", position: "Analista", department: "Vendas", active: true },
    { id: "3", name: "Ana Souza", position: "Vendedora", department: "Comercial", active: true },
    { id: "4", name: "Maria Inativa", position: "Analista", department: "Vendas", active: false },
  ] } as never);
  const response = await chatApi(request("/users?query=maria", { headers: { Authorization: "Bearer nexo-chat-key-for-tests-0123456789" } }), "users", undefined, app);
  expect(await response.json()).toMatchObject({ data: [{ id: "2", name: "Maria Silva", position: "Analista", department: "Vendas" }] });
});

it("encaminha ações para o domínio e publica OpenAPI protegido por Bearer", async () => {
  const app = runtime(), headers = { Authorization: "Bearer nexo-chat-key-for-tests-0123456789", "Content-Type": "application/json" };
  const response = await chatApi(request("/task-1/action", { method: "POST", headers, body: JSON.stringify({ action: "complete" }) }), "task-action", "task-1", app);
  expect(response.status).toBe(200);
  expect(app.journeys.action).toHaveBeenCalledWith(session, "task-1", { action: "complete" });
  const spec = createOpenApiDocument("https://nexo.example.com");
  expect(spec.servers[0]?.url).toBe("https://nexo.example.com/api/chat/v1");
  expect(spec.components.securitySchemes.bearerAuth).toMatchObject({ type: "http", scheme: "bearer" });
  expect(spec.paths["/tasks/{id}/action"]).toBeDefined();
  const servedSpec = await openApiResponse("https://nexo.example.com").json();
  expect(servedSpec.openapi).toBe("3.1.0");
  expect(servedSpec.data).toBeUndefined();
});

it("valida filtros e impede payloads incompletos", async () => {
  const app = runtime(), headers = { Authorization: "Bearer nexo-chat-key-for-tests-0123456789", "Content-Type": "application/json" };
  const invalidFilter = await chatApi(request("/journeys?limit=1000", { headers }), "journeys", undefined, app);
  expect(invalidFilter.status).toBe(400);
  const invalidAction = await chatApi(request("/task-1/action", { method: "POST", headers, body: JSON.stringify({ action: "inventar" }) }), "task-action", "task-1", app);
  expect(invalidAction.status).toBe(400);
  expect(app.journeys.action).not.toHaveBeenCalled();
});
