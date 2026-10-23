import { z } from "zod";
import { workspace } from "./workspace";
import { AppError } from "./errors";
import { errorResponse, json } from "./http";
import { getRuntime } from "./runtime";
import { safeEqual } from "./security";
import { createJourneySchema, taskActionSchema } from "./validation";

const noCache = { "Cache-Control": "no-store, private", Pragma: "no-cache", "X-Content-Type-Options": "nosniff", "Vary": "Authorization" };
const openApi = {
  openapi: "3.1.0",
  info: { title: "Nexo RH API para Onnira", version: "1.0.0", description: "Consulte jornadas de RH e execute ações permitidas no Nexo e nas tarefas Bitrix." },
  servers: [{ url: "/api/chat/v1" }],
  components: {
    securitySchemes: { bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "NEXO_CHAT_API_KEY" } },
    schemas: {
      CreateJourney: { type: "object", required: ["requestId", "type", "templateId", "employeeId", "referenceDate", "assignees"], properties: { requestId: { type: "string", minLength: 8, maxLength: 120, description: "Identificador único para impedir duplicação em repetições." }, type: { type: "string", enum: ["onboarding", "offboarding"] }, templateId: { type: "string", description: "ID de um modelo configurado no Nexo." }, employeeId: { type: "string", description: "ID do usuário colaborador no Bitrix24." }, referenceDate: { type: "string", format: "date" }, assignees: { type: "object", additionalProperties: { type: "string" } } } },
      TaskAction: { type: "object", required: ["action"], properties: { action: { type: "string", enum: ["start", "complete", "reopen", "check", "uncheck"] }, checklistId: { type: "string", description: "Obrigatório para check e uncheck." } } },
      Error: { type: "object", properties: { error: { type: "object", properties: { code: { type: "string" }, message: { type: "string" } } } } },
    },
  },
  security: [{ bearerAuth: [] }],
  paths: {
    "/workspace": { get: { operationId: "getRhWorkToday", summary: "Consultar trabalho do RH para hoje e atrasados", responses: { "200": { description: "Atividades prioritárias, jornadas ativas e última sincronização." }, "401": { description: "Chave ausente ou inválida." } } } },
    "/journeys": { get: { operationId: "listJourneys", summary: "Listar jornadas de RH", parameters: [{ in: "query", name: "status", schema: { type: "string", enum: ["creating", "active", "paused", "completed", "cancelled"] } }, { in: "query", name: "type", schema: { type: "string", enum: ["onboarding", "offboarding"] } }, { in: "query", name: "limit", schema: { type: "integer", minimum: 1, maximum: 100, default: 50 } }], responses: { "200": { description: "Jornadas filtradas." } } }, post: { operationId: "startJourney", summary: "Iniciar jornada usando um modelo existente do Nexo", requestBody: { required: true, content: { "application/json": { schema: { "$ref": "#/components/schemas/CreateJourney" } } } }, responses: { "200": { description: "Jornada iniciada ou já criada para requestId." }, "409": { description: "Configuração ou idempotência impede iniciar." } } } },
    "/templates": { get: { operationId: "listJourneyTemplates", summary: "Listar modelos disponíveis para RH", responses: { "200": { description: "Modelos de onboarding e offboarding." } } } },
    "/users": { get: { operationId: "searchBitrixUsers", summary: "Buscar colaborador pelo nome, cargo ou área", parameters: [{ in: "query", name: "query", required: true, schema: { type: "string", minLength: 2, maxLength: 100 } }, { in: "query", name: "limit", schema: { type: "integer", minimum: 1, maximum: 50, default: 20 } }], responses: { "200": { description: "Colaboradores ativos correspondentes à busca." } } } },
    "/journeys/{id}": { get: { operationId: "getJourney", summary: "Consultar detalhes e atividades de uma jornada", parameters: [{ in: "path", name: "id", required: true, schema: { type: "string" } }], responses: { "200": { description: "Detalhes da jornada." }, "404": { description: "Jornada não encontrada." } } } },
    "/journeys/{id}/complete": { post: { operationId: "completeJourney", summary: "Concluir jornada se todas as regras forem atendidas", parameters: [{ in: "path", name: "id", required: true, schema: { type: "string" } }], responses: { "200": { description: "Jornada concluída." }, "409": { description: "Há tarefas, checklists ou aprovações pendentes." } } } },
    "/journeys/{id}/pause": { post: { operationId: "pauseJourney", summary: "Pausar ou retomar liberação de etapas", parameters: [{ in: "path", name: "id", required: true, schema: { type: "string" } }], requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["paused"], properties: { paused: { type: "boolean" } } } } } }, responses: { "200": { description: "Jornada atualizada." } } } },
    "/tasks/{id}/action": { post: { operationId: "actOnTask", summary: "Atualizar tarefa ou checklist no Bitrix24", parameters: [{ in: "path", name: "id", required: true, schema: { type: "string" } }], requestBody: { required: true, content: { "application/json": { schema: { "$ref": "#/components/schemas/TaskAction" } } } }, responses: { "200": { description: "Tarefa atualizada e sincronizada." }, "409": { description: "Checklist incompleto ou jornada ocupada." } } } },
  },
};

async function readBody(request: Request) {
  const length = Number(request.headers.get("Content-Length") ?? "0");
  if (length > 65536) throw new AppError("BODY_TOO_LARGE", "O corpo do pedido excede 64 KB.", 413);
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > 65536) throw new AppError("BODY_TOO_LARGE", "O corpo do pedido excede 64 KB.", 413);
  try { return text ? JSON.parse(text) : {}; } catch { throw new AppError("JSON_INVALID", "JSON inválido.", 400); }
}

function requireKey(request: Request, configured: string | null) {
  if (!configured) throw new AppError("CHAT_API_DISABLED", "Configure NEXO_CHAT_API_KEY no servidor para ativar o conector do chat.", 503);
  const authorization = request.headers.get("Authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(authorization);
  if (!match || !safeEqual(match[1]!, configured)) throw new AppError("CHAT_API_UNAUTHORIZED", "Chave de API ausente ou inválida.", 401);
}

function localDate(value: string, timezone: string) {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
}

export function createOpenApiDocument(baseUrl: string) { return { ...openApi, servers: [{ url: `${baseUrl.replace(/\/$/, "")}/api/chat/v1` }] }; }
export function openApiResponse(baseUrl: string) { return Response.json(createOpenApiDocument(baseUrl), { headers: noCache }); }
export function openApiDocument() { return openApiResponse(getRuntime().env.appUrl); }

export async function chatApi(request: Request, resource: string, id?: string, runtimeOverride?: ReturnType<typeof getRuntime>) {
  try {
    const runtime = runtimeOverride ?? getRuntime();
    requireKey(request, runtime.env.chatApiKey);
    const session = runtime.auth.chatSession();
    if (request.method === "GET" && resource === "workspace") {
      const data = await workspace(runtime, session), today = localDate(new Date().toISOString(), data.settings.timezone);
      const todayItems = data.journeys.filter(journey => journey.status === "active" || journey.status === "creating").flatMap(journey => journey.tasks.filter(task => task.releaseState !== "waiting" && !["completed", "deferred"].includes(task.status) && localDate(task.dueAt, data.settings.timezone) <= today).map(task => ({ journeyId: journey.id, taskId: task.id, title: task.title, employee: journey.employee.name, journeyType: journey.type, status: task.status, dueAt: task.dueAt, overdue: localDate(task.dueAt, data.settings.timezone) < today, critical: task.critical, reason: localDate(task.dueAt, data.settings.timezone) < today ? "Prazo ultrapassado" : "Prazo de hoje", bitrixUrl: task.bitrixUrl })));
      return json({ date: today, today: todayItems.sort((a, b) => Number(b.overdue) - Number(a.overdue) || Number(b.critical) - Number(a.critical) || a.dueAt.localeCompare(b.dueAt)).slice(0, 100), activeJourneys: data.journeys.filter(journey => ["active", "creating", "paused"].includes(journey.status)).map(journey => ({ id: journey.id, type: journey.type, employee: journey.employee.name, template: journey.templateName, status: journey.status, progress: journey.progress, referenceDate: journey.referenceDate })), lastSyncAt: data.lastSyncAt });
    }
    if (request.method === "GET" && resource === "journeys") {
      const url = new URL(request.url), status = url.searchParams.get("status"), type = url.searchParams.get("type"), limit = z.coerce.number().int().min(1).max(100).default(50).parse(url.searchParams.get("limit") ?? undefined);
      const statusValue = status === null ? undefined : z.enum(["creating", "active", "paused", "completed", "cancelled"]).parse(status);
      const typeValue = type === null ? undefined : z.enum(["onboarding", "offboarding"]).parse(type);
      const data = await workspace(runtime, session);
      return json(data.journeys.filter(journey => (!statusValue || journey.status === statusValue) && (!typeValue || journey.type === typeValue)).slice(0, limit).map(journey => ({ id: journey.id, type: journey.type, employee: journey.employee.name, template: journey.templateName, status: journey.status, progress: journey.progress, referenceDate: journey.referenceDate, taskCount: journey.taskCount, completedCount: journey.completedCount })));
    }
    if (request.method === "GET" && resource === "templates") {
      const data = await workspace(runtime, session);
      return json(data.templates.map(template => ({ id: template.id, name: template.name, type: template.type, profile: template.profile, version: template.version, stages: template.stages.map(stage => ({ id: stage.id, title: stage.title, activities: stage.activities.map(activity => ({ id: activity.id, title: activity.title, assigneeRole: activity.assigneeRole, offsetDays: activity.offsetDays, offsetUnit: activity.offsetUnit, required: activity.required })) })) })));
    }
    if (request.method === "GET" && resource === "users") {
      const url = new URL(request.url), query = z.string().trim().min(2).max(100).parse(url.searchParams.get("query") ?? "").toLocaleLowerCase("pt-BR"), limit = z.coerce.number().int().min(1).max(50).default(20).parse(url.searchParams.get("limit") ?? undefined);
      const data = await workspace(runtime, session);
      return json(data.users.filter(user => user.active && `${user.name} ${user.position} ${user.department}`.toLocaleLowerCase("pt-BR").includes(query)).slice(0, limit).map(user => ({ id: user.id, name: user.name, position: user.position, department: user.department })));
    }
    if (request.method === "POST" && resource === "journeys" && !id) return json(await runtime.journeys.create(session, createJourneySchema.parse(await readBody(request))));
    if (request.method === "GET" && resource === "journey" && id) {
      const visible = await runtime.journeys.visible(session, runtime.journeys.get(id));
      if (!visible) throw new AppError("JOURNEY_FORBIDDEN", "Esta jornada não está disponível para a conta RH do chat.", 403);
      return json(visible);
    }
    if (request.method === "POST" && resource === "journey-complete" && id) return json(await runtime.journeys.complete(session, id));
    if (request.method === "POST" && resource === "journey-pause" && id) { const input = z.object({ paused: z.boolean() }).parse(await readBody(request)); return json(await runtime.journeys.setPaused(session, id, input.paused)); }
    if (request.method === "POST" && resource === "task-action" && id) return json(await runtime.journeys.action(session, id, taskActionSchema.parse(await readBody(request))));
    throw new AppError("NOT_FOUND", "Operação da API de chat não encontrada.", 404);
  } catch (error) {
    const response = errorResponse(error);
    if (response.status === 401) response.headers.set("WWW-Authenticate", "Bearer realm=\"Nexo Chat API\"");
    response.headers.set("Vary", "Authorization");
    return response;
  }
}
