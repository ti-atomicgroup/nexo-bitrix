#!/usr/bin/env node
/**
 * Worker do Bitrix24: processo separado que sobe junto com o Nexo (scripts/start.mjs) e é o único que abre conexão
 * com o Bitrix24, como a Onnira pede. O servidor do Nexo não chama o Bitrix direto: manda cada chamada para cá, por
 * http://127.0.0.1 (sem passar pelo domínio público), e este processo faz o pedido e devolve a resposta como veio.
 *
 * - POST /bitrix   chamada REST: cabeçalho X-Nexo-Target com o endereço https://<portal>.bitrix24.<tld>/rest/...;
 *                  falha de rede volta como 502 com X-Nexo-Relay-Error (código técnico, ex.: UND_ERR_CONNECT_TIMEOUT).
 * - GET  /probe    teste de saída até o portal (?host=empresa.bitrix24.com.br), sem webhook.
 * - GET  /health   vivo?
 * A cada minuto chama POST http://127.0.0.1:${PORT}/api/jobs/tick para o motor rodar os trabalhos pendentes.
 * Só escuta em 127.0.0.1 e exige o token interno (NEXO_WORKER_TOKEN). Nunca registra o endereço (ele tem o segredo).
 */
import { timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { pathToFileURL } from "node:url";

/** Só domínios do Bitrix24 na nuvem e só a API REST: o worker nunca vira um proxy para qualquer endereço. */
const BITRIX_HOST = /^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.bitrix24\.[a-z]{2,6}(?:\.[a-z]{2})?$/i;
const MAX_BODY_BYTES = 25 * 1024 * 1024; // documento de até 10 MB em base64, com folga
const MAX_REQUEST_MS = 120_000;
const PROBE_TIMEOUT_MS = 10_000;
const TICK_MS = 60_000;
const FIRST_TICK_MS = 15_000;

function log(level, event, data = {}) {
  console.log(JSON.stringify({ at: new Date().toISOString(), level, event, source: "bitrix-worker", ...data }));
}

/** Código técnico do erro de rede (ex.: UND_ERR_CONNECT_TIMEOUT, ENOTFOUND) ou "TimeoutError". */
export function errorCode(error) {
  if (error && (error.name === "TimeoutError" || error.name === "AbortError")) return "TimeoutError";
  const code = error?.cause?.code ?? error?.code;
  return typeof code === "string" ? code.slice(0, 60) : String(error?.name ?? "Error").slice(0, 60);
}

/** Endereço permitido: https, domínio do Bitrix24 na nuvem, caminho /rest/, sem usuário/senha nem porta. */
export function allowedTarget(raw) {
  try {
    const url = new URL(raw);
    const ok = url.protocol === "https:" && BITRIX_HOST.test(url.hostname) && url.pathname.startsWith("/rest/") && !url.username && !url.password && !url.port;
    return ok ? url : null;
  } catch {
    return null;
  }
}

/** Nome do método para o log ("user.current"), nunca o endereço inteiro. */
const methodOf = (url) => url.pathname.split("/").pop()?.replace(/\.json$/, "").slice(0, 80) ?? "";

function send(res, status, body, headers = {}) {
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error("corpo grande demais"), { code: "BODY_TOO_LARGE" }));
        req.destroy();
      } else chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

/**
 * Servidor do worker. `fetchImpl` permite testar sem rede. Devolve o servidor (ainda sem escutar) e o disparo do ciclo.
 */
export function createWorker({ token, appPort, fetchImpl = fetch }) {
  if (!token) throw new Error("NEXO_WORKER_TOKEN ausente");
  const expected = Buffer.from(`Bearer ${token}`);
  const authorized = (req) => {
    const given = Buffer.from(String(req.headers.authorization ?? ""));
    return given.length === expected.length && timingSafeEqual(given, expected);
  };

  async function relay(req, res) {
    const target = allowedTarget(String(req.headers["x-nexo-target"] ?? ""));
    if (!target) return send(res, 400, { error: "target", message: "Endereço fora do Bitrix24." });
    let body;
    try {
      body = await readBody(req);
    } catch (error) {
      return send(res, 413, { error: errorCode(error) });
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new DOMException("Tempo esgotado", "TimeoutError")), MAX_REQUEST_MS);
    // O Nexo desistiu (tempo limite dele): cancela o pedido ao Bitrix também.
    res.on("close", () => {
      if (!res.writableFinished) controller.abort(new DOMException("Cancelado pelo Nexo", "AbortError"));
    });
    const started = Date.now();
    try {
      const upstream = await fetchImpl(target.href, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body,
        redirect: "error",
        signal: controller.signal,
      });
      const text = await upstream.text();
      const headers = { "Content-Type": upstream.headers.get("content-type") ?? "application/json", "Cache-Control": "no-store" };
      const retryAfter = upstream.headers.get("retry-after");
      if (retryAfter) headers["Retry-After"] = retryAfter;
      res.writeHead(upstream.status, headers);
      res.end(text);
    } catch (error) {
      const code = errorCode(error);
      log("warn", "bitrix_request_failed", { method: methodOf(target), code, ms: Date.now() - started });
      if (!res.headersSent) send(res, 502, { error: "relay", code }, { "X-Nexo-Relay-Error": code });
    } finally {
      clearTimeout(timer);
    }
  }

  async function probe(res, host) {
    if (!host || host.length > 200 || !BITRIX_HOST.test(host)) return send(res, 400, { error: "host" });
    const started = Date.now();
    try {
      const response = await fetchImpl(`https://${host}/rest/`, { method: "GET", redirect: "manual", signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
      await response.body?.cancel();
      send(res, 200, { ok: true, status: response.status, ms: Date.now() - started });
    } catch (error) {
      send(res, 200, { ok: false, error: errorCode(error), ms: Date.now() - started });
    }
  }

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (req.method === "GET" && url.pathname === "/health") return send(res, 200, { ok: true, pid: process.pid, uptimeSeconds: Math.round(process.uptime()) });
    if (!authorized(req)) return send(res, 401, { error: "unauthorized" });
    if (req.method === "POST" && url.pathname === "/bitrix") return void relay(req, res);
    if (req.method === "GET" && url.pathname === "/probe") return void probe(res, url.searchParams.get("host")?.trim().toLowerCase() ?? "");
    send(res, 404, { error: "not_found" });
  });

  let failures = 0;
  /** Acorda o motor do Nexo pela rota interna (127.0.0.1), sem passar pelo domínio público. */
  async function tick() {
    try {
      const response = await fetchImpl(`http://127.0.0.1:${appPort}/api/jobs/tick`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(10_000),
      });
      await response.body?.cancel();
      if (failures) log("info", "tick_recovered", { after: failures });
      failures = 0;
    } catch (error) {
      // O Nexo ainda está subindo ou reiniciando: avisa só de vez em quando.
      if (failures++ % 10 === 0) log("warn", "tick_failed", { code: errorCode(error) });
    }
  }

  return { server, tick };
}

async function main() {
  const token = process.env.NEXO_WORKER_TOKEN ?? "";
  const port = Number(process.env.NEXO_WORKER_PORT || 3901);
  const appPort = Number(process.env.PORT || 3000);
  if (!token) {
    log("error", "worker_misconfigured", { message: "Falta NEXO_WORKER_TOKEN. Suba o Nexo por `npm start`." });
    process.exit(1);
  }
  const { server, tick } = createWorker({ token, appPort });
  server.listen(port, "127.0.0.1", () => log("info", "worker_started", { port, appPort, pid: process.pid }));
  setTimeout(() => {
    void tick();
    setInterval(() => void tick(), TICK_MS).unref();
  }, FIRST_TICK_MS).unref();
  const stop = () => server.close(() => process.exit(0));
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) void main();
