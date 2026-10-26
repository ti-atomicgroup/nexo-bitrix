import "server-only";
import { lookup } from "node:dns/promises";
import { request } from "node:https";

/** Só domínios do Bitrix24 na nuvem: a sonda nunca vira um proxy para qualquer endereço. */
const BITRIX_HOST = /^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.bitrix24\.[a-z]{2,6}(?:\.[a-z]{2})?$/i;
const TIMEOUT_MS = 10_000;

export const isBitrixHost = (host: string): boolean => host.length <= 200 && BITRIX_HOST.test(host);

interface Attempt {
  ok: boolean;
  ms: number;
  status?: number;
  error?: string;
}

function describe(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const cause = error.cause as { code?: unknown; message?: unknown } | undefined;
  const code = (error as { code?: unknown }).code ?? cause?.code;
  const detail = typeof cause?.message === "string" ? cause.message : error.message;
  return [error.name, typeof code === "string" ? code : null, detail].filter(Boolean).join(" · ").slice(0, 300);
}

async function viaFetch(url: string): Promise<Attempt> {
  const started = Date.now();
  try {
    const response = await fetch(url, { method: "GET", redirect: "manual", signal: AbortSignal.timeout(TIMEOUT_MS) });
    await response.body?.cancel();
    return { ok: true, ms: Date.now() - started, status: response.status };
  } catch (error) {
    return { ok: false, ms: Date.now() - started, error: describe(error) };
  }
}

/** O mesmo pedido pelo módulo https, forçando IPv4: separa falha de IPv6 ou do fetch (undici) de bloqueio de rede. */
function viaHttpsIpv4(host: string): Promise<Attempt> {
  const started = Date.now();
  return new Promise((resolve) => {
    const req = request({ host, path: "/rest/", method: "GET", family: 4, timeout: TIMEOUT_MS }, (response) => {
      response.resume();
      resolve({ ok: true, ms: Date.now() - started, status: response.statusCode });
    });
    req.on("timeout", () => req.destroy(Object.assign(new Error("tempo esgotado"), { code: "ETIMEDOUT" })));
    req.on("error", (error) => resolve({ ok: false, ms: Date.now() - started, error: describe(error) }));
    req.end();
  });
}

/** IP público de saída do servidor (o que o Bitrix24 vê), para pedir liberação ao provedor ou ao Bitrix24. */
async function publicIp(): Promise<{ ok: boolean; ip?: string; error?: string }> {
  for (const url of ["https://api.ipify.org?format=json", "https://api64.ipify.org?format=json"]) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
      const ip = ((await response.json()) as { ip?: unknown })?.ip;
      if (typeof ip === "string" && ip.length <= 45) return { ok: true, ip };
    } catch (error) {
      if (url.includes("api64")) return { ok: false, error: describe(error) };
    }
  }
  return { ok: false, error: "Resposta inesperada do serviço de IP." };
}

/** Testa a saída do servidor até o portal (sem webhook, sem segredo): DNS, fetch, https IPv4, um site neutro e o IP de saída. */
export async function egressProbe(host: string) {
  let dns: { ok: boolean; addresses?: string[]; error?: string };
  try {
    const found = await lookup(host, { all: true });
    dns = { ok: true, addresses: found.map((item) => `${item.address} (IPv${item.family})`) };
  } catch (error) {
    dns = { ok: false, error: describe(error) };
  }
  const [bitrixFetch, bitrixIpv4, neutralFetch, outboundIp] = await Promise.all([
    viaFetch(`https://${host}/rest/`),
    viaHttpsIpv4(host),
    viaFetch("https://example.com/"),
    publicIp(),
  ]);
  return {
    host,
    dns,
    bitrixFetch,
    bitrixIpv4,
    neutralFetch,
    outboundIp,
    proxyEnv: ["HTTP_PROXY", "HTTPS_PROXY", "NO_PROXY", "http_proxy", "https_proxy", "no_proxy"].filter((name) => Boolean(process.env[name])),
  };
}
