import "server-only";
import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { guardedLookup, isAllowedPortalHost, safeFetch } from "../../../scripts/lib/bitrix-policy.mjs";

/** Só portais permitidos pela política: a sonda nunca vira um proxy para qualquer endereço. */
const TIMEOUT_MS = 10_000;

export const isBitrixHost = (host: string): boolean => isAllowedPortalHost(host);

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

async function attempt(run: () => Promise<Response>): Promise<Attempt> {
  const started = Date.now();
  try {
    const response = await run();
    await response.body?.cancel();
    return { ok: true, ms: Date.now() - started, status: response.status };
  } catch (error) {
    return { ok: false, ms: Date.now() - started, error: describe(error) };
  }
}

/** O mesmo pedido pelo módulo https, forçando IPv4: separa falha de IPv6 de bloqueio de rede. Com a mesma conferência de DNS. */
function viaHttpsIpv4(host: string): Promise<Attempt> {
  const started = Date.now();
  return new Promise((resolve) => {
    const req = request({ host, path: "/rest/", method: "GET", family: 4, timeout: TIMEOUT_MS, lookup: guardedLookup as never }, (response) => {
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

/** Testa a saída do servidor até o portal (sem webhook, sem segredo): DNS, https, https IPv4, um site neutro e o IP de saída. Só para a administração. */
export async function egressProbe(host: string) {
  let dns: { ok: boolean; addresses?: string[]; error?: string };
  try {
    const found = await lookup(host, { all: true });
    dns = { ok: true, addresses: found.map((item) => `${item.address} (IPv${item.family})`) };
  } catch (error) {
    dns = { ok: false, error: describe(error) };
  }
  const [bitrixFetch, bitrixIpv4, neutralFetch, outboundIp] = await Promise.all([
    attempt(() => safeFetch(`https://${host}/rest/`, { method: "GET", redirect: "manual", signal: AbortSignal.timeout(TIMEOUT_MS) })),
    viaHttpsIpv4(host),
    attempt(() => fetch("https://example.com/", { method: "GET", redirect: "manual", signal: AbortSignal.timeout(TIMEOUT_MS) })),
    publicIp(),
  ]);
  return { host, dns, bitrixFetch, bitrixIpv4, neutralFetch, outboundIp };
}
