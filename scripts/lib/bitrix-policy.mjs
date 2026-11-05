/**
 * Política de destino do Bitrix24: a mesma regra no worker (scripts/bitrix-worker.mjs) e no transporte direto do servidor
 * (next dev, npm run start:web, hospedagens que não sobem por npm start). Sem dependências: o worker roda com Node puro.
 *
 * 1. Host: portal na nuvem do Bitrix24 (`empresa.bitrix24.<zona oficial>`) ou domínio próprio listado em NEXO_BITRIX_ALLOWED_HOSTS.
 * 2. Endereço: https, sem usuário nem porta, só em /rest/.
 * 3. Rede: o DNS é conferido na hora de conectar, em cada conexão. Se qualquer endereço resolvido for privado ou reservado, a
 *    conexão não abre; e a conexão usa exatamente o endereço conferido, o que barra quem troca o DNS depois da validação (rebinding).
 */
import { lookup } from "node:dns";
import { request as httpsRequest } from "node:https";
import { BlockList, isIP } from "node:net";
import { Readable } from "node:stream";

const CLOUD_ZONES = "com|eu|de|es|fr|it|pl|uk|in|id|vn|jp|cn|tw|kz|by|ru|ua|mx|co|com\\.br|com\\.tr";
const CLOUD_PORTAL = new RegExp(`^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.bitrix24\\.(?:${CLOUD_ZONES})$`);
const HOST_NAME = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;
const INTERNAL_SUFFIXES = [".localhost", ".local", ".internal", ".lan", ".home", ".corp", ".intranet"];

/** Domínios próprios liberados por quem administra o servidor. Nunca pela interface: uma conta invadida não amplia o alcance do servidor. */
function listedHosts(env) {
  return String(env.NEXO_BITRIX_ALLOWED_HOSTS ?? "")
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter((host) => HOST_NAME.test(host) && !isIP(host) && !INTERNAL_SUFFIXES.some((suffix) => host.endsWith(suffix)));
}

export function isAllowedPortalHost(host, env = process.env) {
  const name = String(host ?? "").toLowerCase();
  if (!name || name.length > 200 || isIP(name)) return false;
  return CLOUD_PORTAL.test(name) || listedHosts(env).includes(name);
}

/** Endereço permitido: https, portal permitido, caminho /rest/, sem usuário/senha nem porta. */
export function allowedTarget(raw, env = process.env) {
  try {
    const url = new URL(raw);
    const ok = url.protocol === "https:" && isAllowedPortalHost(url.hostname, env) && url.pathname.startsWith("/rest/") && !url.username && !url.password && !url.port;
    return ok ? url : null;
  } catch {
    return null;
  }
}

const BLOCKED = new BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
]) {
  BLOCKED.addSubnet(network, prefix, "ipv4");
}
for (const [network, prefix] of [
  // ::/96 inclui :: e ::1 e o formato antigo com IPv4 embutido (::127.0.0.1).
  ["::", 96],
  ["64:ff9b::", 96],
  ["100::", 64],
  ["2001::", 32],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["fc00::", 7],
  ["fe80::", 10],
  ["fec0::", 10],
  ["ff00::", 8],
]) {
  BLOCKED.addSubnet(network, prefix, "ipv6");
}

/** Privado, reservado ou que nem é IP: não recebe conexão do servidor. Endereço IPv4 dentro de IPv6 segue a regra do IPv4. */
export function isBlockedAddress(address) {
  const family = isIP(address);
  if (!family) return true;
  return BLOCKED.check(address, family === 6 ? "ipv6" : "ipv4");
}

/** Assinatura de `lookup` do Node (socket): resolve, confere tudo e só então entrega. `resolver` existe para os testes. */
export function guardedLookup(hostname, options, callback, resolver = lookup) {
  resolver(hostname, { ...options, all: true }, (error, addresses) => {
    if (error) return callback(error);
    const list = Array.isArray(addresses) ? addresses : [];
    if (!list.length) return callback(Object.assign(new Error("Sem endereço para o portal."), { code: "ENOTFOUND" }));
    if (list.some((item) => isBlockedAddress(item.address))) {
      return callback(Object.assign(new Error("O portal resolveu para um endereço privado ou reservado."), { code: "NEXO_BLOCKED_ADDRESS" }));
    }
    if (options?.all) return callback(null, list);
    callback(null, list[0].address, list[0].family);
  });
}

/** Mesmo formato do erro de rede do fetch: o código técnico em `cause.code`, nunca o endereço (que contém o segredo). */
function networkError(code) {
  return Object.assign(new TypeError("fetch failed"), { cause: { code } });
}

const NO_BODY = new Set([101, 204, 205, 304]);

/**
 * `fetch` para o Bitrix24 com a política aplicada. Nunca segue redirecionamento: 3xx vira erro (ou volta como veio, com
 * `redirect: "manual"`). Só para portais; chamadas a 127.0.0.1 (o motor) usam o fetch comum.
 */
export function safeFetch(input, init = {}) {
  const target = allowedTarget(String(input));
  if (!target) return Promise.reject(networkError("NEXO_TARGET_BLOCKED"));
  return new Promise((resolve, reject) => {
    const body = init.body ?? null;
    const headers = Object.fromEntries(new Headers(init.headers ?? {}).entries());
    // O mesmo que o fetch do Node manda: o Bitrix24 sempre recebeu este, e firewall de aplicação costuma recusar pedido sem nenhum.
    headers["user-agent"] ??= "node";
    if (body !== null) headers["content-length"] = String(Buffer.byteLength(body));
    const request = httpsRequest(
      {
        hostname: target.hostname,
        servername: target.hostname,
        port: init.port ?? 443,
        path: `${target.pathname}${target.search}`,
        method: init.method ?? "GET",
        headers,
        signal: init.signal ?? undefined,
        lookup: (hostname, options, callback) => guardedLookup(hostname, options, callback, init.resolver),
      },
      (response) => {
        const status = response.statusCode ?? 0;
        if (status >= 300 && status < 400 && init.redirect !== "manual") {
          response.destroy();
          return reject(networkError("NEXO_REDIRECT_BLOCKED"));
        }
        const out = new Headers();
        for (let index = 0; index + 1 < response.rawHeaders.length; index += 2) out.append(response.rawHeaders[index], response.rawHeaders[index + 1]);
        if (NO_BODY.has(status)) {
          response.resume();
          return resolve(new Response(null, { status, headers: out }));
        }
        resolve(new Response(Readable.toWeb(response), { status, headers: out }));
      },
    );
    request.on("error", (error) => {
      if (error?.name === "AbortError" || error?.name === "TimeoutError") return reject(error);
      reject(networkError(typeof error?.code === "string" ? error.code : "NEXO_CONNECT_FAILED"));
    });
    request.end(body ?? undefined);
  });
}
