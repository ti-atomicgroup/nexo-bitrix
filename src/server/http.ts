import { z } from "zod";
import type { PublicStatus } from "../shared/contracts";
import { AppError } from "./errors";
import { missingEnvironment, validateEnvironment } from "./security";
import { getRuntime } from "./runtime";
import { seedTemplates } from "./seeds";
import { workspace } from "./workspace";
const noStore = { "Cache-Control": "no-store, private", Pragma: "no-cache", "X-Content-Type-Options": "nosniff" };
export function json(data: unknown) { return Response.json({ data }, { headers: noStore }); }
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
function bearer(request: Request): string {
  const header = request.headers.get("Authorization");
  if (!header?.startsWith("Bearer ")) throw new AppError("SESSION_REQUIRED", "Abra o aplicativo dentro do Bitrix24.", 401);
  return header.slice(7);
}
function checkOrigin(request: Request, allowPortal = false) {
  const origin = request.headers.get("Origin"), env = getRuntime().env;
  if (origin && origin !== env.appUrl && !(allowPortal && origin === env.portalUrl)) throw new AppError("ORIGIN_INVALID", "Origem do pedido não autorizada.", 403);
}
export async function status() {
  const missing = missingEnvironment();
  const result: PublicStatus = { installed: false, configured: false, portalDomain: null, appUrl: "", missingEnvironment: missing, version: "1.0.0" };
  if (missing.length) return json(result);
  try { const env = validateEnvironment(); result.appUrl = env.appUrl; result.portalDomain = env.portalDomain; const runtime = getRuntime(); result.installed = Boolean(runtime.auth.installation()); result.configured = result.installed && runtime.auth.settings().setupComplete; return json(result); }
  catch (error) { if (error instanceof AppError) return json({ ...result, missingEnvironment: [error.code] }); return errorResponse(error); }
}
export async function launch(request: Request) {
  try {
    checkOrigin(request, true);
    const runtime = getRuntime(), input = z.record(z.string(), z.unknown()).parse(await body(request));
    const queryDomains = new URL(request.url).searchParams.getAll("DOMAIN");
    const postedDomain = z.string().optional().parse(input.DOMAIN);
    const domains = [...queryDomains, ...(postedDomain === undefined ? [] : [postedDomain])];
    if (new Set(domains.map(domain => domain.toLowerCase())).size > 1) throw new AppError("PORTAL_MISMATCH", "Domínio divergente entre URL e corpo da abertura.", 403);
    const context = await runtime.auth.launch({ ...input, DOMAIN: postedDomain ?? queryDomains[0] });
    return new Response(null, { status: 303, headers: { ...noStore, Location: `${runtime.env.appUrl}/#${context.kind}=${context.token}`, "Referrer-Policy": "no-referrer" } });
  }
  catch (error) { return errorResponse(error); }
}
export async function events(request: Request) {
  try { return json(getRuntime().events.receive(await body(request))); } catch (error) { return errorResponse(error); }
}
export async function api(request: Request, resource: string, id?: string) {
  try {
    const runtime = getRuntime();
    checkOrigin(request);
    if (resource === "setup" && request.method === "POST") {
      const input = z.record(z.string(), z.unknown()).parse(await body(request));
      const action = z.enum(["bootstrap", "discover", "provision", "configure", "finish"]).parse(input.action);
      if (action === "bootstrap") { const data = await runtime.auth.bootstrap(bearer(request), z.string().max(1000).parse(input.setupToken), z.string().min(1).max(200).parse(input.clientId), z.string().min(1).max(1000).parse(input.clientSecret)); seedTemplates(runtime.journeys, data.session); return json(data); }
      const session = runtime.auth.session(bearer(request));
      if (action === "discover") return json(await runtime.setup.discover(session));
      if (action === "provision") return json(await runtime.setup.provision(session));
      if (action === "configure") return json(await runtime.setup.configure(session, input.settings, input.rules, z.string().optional().parse(input.clientSecret)));
      return json(await runtime.setup.finish(session));
    }
    const session = runtime.auth.session(bearer(request));
    if (resource === "workspace" && request.method === "GET") return json(await workspace(runtime, session));
    if (resource === "templates" && (request.method === "POST" || request.method === "PUT")) return json(runtime.journeys.saveTemplate(session, await body(request), id));
    if (resource === "journeys" && request.method === "POST") return json(await runtime.journeys.create(session, await body(request)));
    if (resource === "complete" && request.method === "POST" && id) return json(await runtime.journeys.complete(session, id));
    if (resource === "task" && request.method === "POST" && id) return json(await runtime.journeys.action(session, id, await body(request)));
    if (resource === "sync" && request.method === "POST") { runtime.auth.requireManage(session); runtime.store.enqueue(`manual-sync:${Date.now()}:${session.user.id}`, "sync", {}); return json({ queued: true }); }
    if (resource === "discovery" && request.method === "GET") { const url = new URL(request.url), entity = url.searchParams.get("entityTypeId"), category = url.searchParams.get("categoryId"); return json(await runtime.setup.discovery(session, url.searchParams.get("kind") ?? "", entity === null ? undefined : z.coerce.number().int().positive().parse(entity), category === null ? undefined : z.coerce.number().int().nonnegative().parse(category))); }
    throw new AppError("NOT_FOUND", "Rota não encontrada.", 404);
  } catch (error) { return errorResponse(error); }
}
