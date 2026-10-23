import { z } from "zod";
import type { PublicStatus } from "../shared/contracts";
import { AppError } from "./errors";
import { missingEnvironment, validateEnvironment } from "./security";
import { getRuntime } from "./runtime";
import { seedTemplates } from "./seeds";
import { workspace } from "./workspace";
import { safeEqual } from "./security";
import { webhookConfigurationSchema, outgoingWebhookSchema, localUserSchema } from "./models";
const noStore = { "Cache-Control": "no-store, private", Pragma: "no-cache", "X-Content-Type-Options": "nosniff" };
export function json(data: unknown, headers: HeadersInit = {}) { return Response.json({ data }, { headers: { ...noStore, ...Object.fromEntries(new Headers(headers)) } }); }
export function errorResponse(error: unknown) {
  if (error instanceof z.ZodError) return Response.json({ error: { code: "VALIDATION", message: `Dados inválidos: ${error.issues.slice(0, 3).map(issue => `${issue.path.join(".")}: ${issue.message}`).join("; ")}` } }, { status: 400, headers: noStore });
  if (error instanceof AppError) return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status, headers: noStore });
  console.error(JSON.stringify({ event: "http.error", code: "INTERNAL" }));
  return Response.json({ error: { code: "INTERNAL", message: "Não foi possível concluir a operação. Consulte o suporte." } }, { status: 500, headers: noStore });
}
async function body(request: Request): Promise<unknown> {
  const maximum = 1024 * 1024;
  if (Number(request.headers.get("Content-Length")) > maximum) throw new AppError("BODY_TOO_LARGE", "Pedido excede o limite de 1 MB.", 413);
  const reader = request.body?.getReader();
  let bytes = 0, value = "";
  const decoder = new TextDecoder();
  if (reader) for (;;) { const chunk = await reader.read(); if (chunk.done) break; bytes += chunk.value.length; if (bytes > maximum) { await reader.cancel(); throw new AppError("BODY_TOO_LARGE", "Pedido excede o limite de 1 MB.", 413); } value += decoder.decode(chunk.value, { stream: true }); }
  value += decoder.decode();
  if (request.headers.get("Content-Type")?.includes("application/x-www-form-urlencoded")) return Object.fromEntries(new URLSearchParams(value));
  try { return value ? JSON.parse(value) : {}; } catch { throw new AppError("JSON_INVALID", "JSON inválido."); }
}
function sessionToken(request: Request): string {
  const cookie = request.headers.get("Cookie")?.split(/;\s*/).find(value => value.startsWith("nexo_session="));
  if (!cookie) throw new AppError("SESSION_REQUIRED", "Entre na sua conta Nexo para continuar.", 401);
  return decodeURIComponent(cookie.slice("nexo_session=".length));
}
function sessionCookie(token: string, maxAge = 1800): string {
  return `nexo_session=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}
function checkOrigin(request: Request, allowPortal = false) {
  const origin = request.headers.get("Origin"), env = getRuntime().env;
  if (origin && origin !== env.appUrl && !(allowPortal && origin === env.portalUrl)) throw new AppError("ORIGIN_INVALID", "Origem do pedido não autorizada.", 403);
}
export async function status() {
  const missing = missingEnvironment();
  const result: PublicStatus = { installed: false, configured: false, portalDomain: null, appUrl: "", missingEnvironment: missing, version: "1.0.0", webhookConnected: false, firstAdminCreated: false, outgoingWebhookConfigured: false, aiConfigured: false };
  if (missing.length) return json(result);
  try {
    const env = validateEnvironment(); result.appUrl = env.appUrl; result.portalDomain = env.portalDomain; result.aiConfigured = env.aiConfigured;
    const runtime = getRuntime(), incoming = runtime.store.get("webhook", "incoming", webhookConfigurationSchema), outgoing = runtime.store.get("webhook", "outgoing", outgoingWebhookSchema), users = runtime.store.list("localUser", localUserSchema);
    result.webhookConnected = Boolean(incoming);
    result.firstAdminCreated = users.some(user => user.role === "admin" && user.active);
    result.outgoingWebhookConfigured = Boolean(outgoing);
    result.installed = Boolean(incoming && users.length);
    result.configured = result.installed && Boolean(outgoing) && runtime.auth.settings().setupComplete;
    return json(result);
  }
  catch (error) { if (error instanceof AppError) return json({ ...result, missingEnvironment: [error.code] }); return errorResponse(error); }
}
export async function launch(request: Request) {
  void request;
  return Response.json({ error: { code: "LEGACY_ROUTE_DISABLED", message: "Esta instalação usa somente webhooks Bitrix24." } }, { status: 410, headers: noStore });
}
export async function events(request: Request) {
  try { return json(getRuntime().events.receive(await body(request))); } catch (error) { return errorResponse(error); }
}
export async function api(request: Request, resource: string, id?: string) {
  try {
    const runtime = getRuntime();
    checkOrigin(request);
    if (resource === "auth" && request.method === "POST") {
      const input = z.record(z.string(), z.unknown()).parse(await body(request)), action = z.enum(["login", "logout"]).parse(input.action);
      if (action === "login") {
        const result = await runtime.auth.loginLocal(z.string().max(254).parse(input.email), z.string().max(200).parse(input.password));
        return json({ session: result.session }, { "Set-Cookie": sessionCookie(result.token) });
      }
      const token = sessionToken(request);
      runtime.auth.logoutLocal(token);
      return json({ loggedOut: true }, { "Set-Cookie": sessionCookie("", 0) });
    }
    if (resource === "setup" && request.method === "POST") {
      const input = z.record(z.string(), z.unknown()).parse(await body(request));
      const action = z.enum(["connect-webhook", "bootstrap-admin", "set-outgoing-token", "discover", "provision", "configure", "finish"]).parse(input.action);
      if (action === "connect-webhook") {
        if (!safeEqual(z.string().parse(input.setupToken), runtime.env.setupToken)) throw new AppError("SETUP_TOKEN_INVALID", "Token de instalação inválido.", 403);
        const url = z.string().max(2000).parse(input.url), verified = await runtime.bitrix.testWebhook(url);
        const required = ["task", "crm", "userfieldconfig"], missingScopes = required.filter(scope => !verified.scopes.includes(scope)) .concat(!verified.scopes.includes("user_brief") && !verified.scopes.includes("user") ? ["user_brief"] : []);
        if (missingScopes.length) throw new AppError("SCOPES_MISSING", `Recrie o webhook com permissões: ${missingScopes.join(", ")}.`, 422);
        runtime.bitrix.configureWebhook(url, verified.userId);
        return json({ connected: true, serviceUserId: verified.userId, serviceUserName: verified.userName, scopes: verified.scopes });
      }
      if (action === "bootstrap-admin") {
        const result = await runtime.auth.bootstrapLocalAdmin(z.string().max(1000).parse(input.setupToken), z.string().max(254).parse(input.email), z.string().max(200).parse(input.password), z.string().max(30).parse(input.bitrixUserId));
        seedTemplates(runtime.journeys, result.session);
        return json({ session: result.session }, { "Set-Cookie": sessionCookie(result.token) });
      }
      const session = runtime.auth.session(sessionToken(request));
      if (action === "set-outgoing-token") {
        runtime.auth.requireManage(session);
        const token = z.string().max(2000).parse(input.token);
        runtime.events.configureOutgoingToken(token);
        return json({ configured: true, handlerUrl: `${runtime.env.appUrl}/api/bitrix/events` });
      }
      if (action === "discover") return json(await runtime.setup.discover(session));
      if (action === "provision") return json(await runtime.setup.provision(session));
      if (action === "configure") return json(await runtime.setup.configure(session, input.settings, input.rules));
      return json(await runtime.setup.finish(session));
    }
    const session = runtime.auth.session(sessionToken(request));
    if (resource === "ai-trail" && request.method === "POST") return json(await runtime.trails.suggest(session, await body(request)));
    if (resource === "users" && request.method === "GET") return json(runtime.auth.listLocalUsers(session));
    if (resource === "users" && request.method === "POST") return json(await runtime.auth.createLocalUser(session, await body(request)));
    if (resource === "users" && request.method === "DELETE" && id) { await runtime.auth.deactivateLocalUser(session, id); return json({ deactivated: true }); }
    if (resource === "workspace" && request.method === "GET") return json(await workspace(runtime, session));
    if (resource === "templates" && (request.method === "POST" || request.method === "PUT")) return json(runtime.journeys.saveTemplate(session, await body(request), id));
    if (resource === "journeys" && request.method === "POST") return json(await runtime.journeys.create(session, await body(request)));
    if (resource === "link-person" && request.method === "POST" && id) { const input = z.object({ bitrixUserId: z.string().regex(/^[1-9]\d{0,15}$/) }).parse(await body(request)); return json(await runtime.journeys.linkPerson(session, id, input.bitrixUserId)); }
    if (resource === "pause" && request.method === "POST" && id) { const input = z.object({ paused: z.boolean() }).parse(await body(request)); return json(await runtime.journeys.setPaused(session, id, input.paused)); }
    if (resource === "complete" && request.method === "POST" && id) return json(await runtime.journeys.complete(session, id));
    if (resource === "task" && request.method === "POST" && id) return json(await runtime.journeys.action(session, id, await body(request)));
    if (resource === "sync" && request.method === "POST") { runtime.auth.requireManage(session); runtime.store.enqueue(`manual-sync:${Date.now()}:${session.user.id}`, "sync", {}); return json({ queued: true }); }
    if (resource === "discovery" && request.method === "GET") { const url = new URL(request.url), kind = url.searchParams.get("kind") ?? "", entity = url.searchParams.get("entityTypeId"), category = url.searchParams.get("categoryId"); if (kind === "trigger-sources") return json(await runtime.setup.triggerSources(session)); return json(await runtime.setup.discovery(session, kind, entity === null ? undefined : z.coerce.number().int().positive().parse(entity), category === null ? undefined : z.coerce.number().int().nonnegative().parse(category))); }
    throw new AppError("NOT_FOUND", "Rota não encontrada.", 404);
  } catch (error) { return errorResponse(error); }
}
