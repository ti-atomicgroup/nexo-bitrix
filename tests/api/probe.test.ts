import { readdirSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as healthRoute } from "@/app/api/health/route";
import { GET as probeFullRoute } from "@/app/api/probe/full/route";
import { GET as probeRoute } from "@/app/api/probe/route";
import { GET as statusRoute } from "@/app/api/status/route";
import { resetRateLimitsForTests } from "@/server/security/rate-limit";
import type { BasicProbeDTO, FullProbeDTO } from "@/shared/contracts";
import { useTestDb } from "../support/db";
import { call, seedUser, type ApiErrorBody } from "./support/seed";

vi.mock("@/server/engine", async () => (await import("./support/engine-mock")).engineMock());

const egressProbe = vi.hoisted(() => vi.fn());
vi.mock("@/server/runtime/egress", async (original) => ({ ...(await original<typeof import("@/server/runtime/egress")>()), egressProbe }));

const FORBIDDEN_WORDS = (dataDir: string) => [dataDir, process.cwd(), String(process.pid), "x-forwarded", "cookieNames", "userAgent", "proxyEnv", "HTTP_PROXY", "portEnv"];

let env: ReturnType<typeof useTestDb>;
beforeEach(() => {
  env = useTestDb();
  resetRateLimitsForTests();
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  egressProbe.mockReset();
});
afterEach(() => {
  env.cleanup();
  vi.restoreAllMocks();
});

describe("diagnóstico anônimo", () => {
  it("responde só o mínimo: nada de caminho, cabeçalho, IP de saída, pid ou proxy", async () => {
    const result = await call<BasicProbeDTO>(probeRoute, {
      path: "/api/probe?bitrix=empresa.bitrix24.com.br",
      headers: { "x-nexo-session": "sonda-sem-valor-0000000000", "x-forwarded-for": "200.195.165.43", referer: "https://app.onnira.com/x", "user-agent": "curl" },
    });
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ ok: true, database: true, sessionHeader: true, authorizationHeader: false });
    for (const word of [...FORBIDDEN_WORDS(env.dataDir), "app.onnira.com", "200.195.165.43", "curl"]) expect(result.text).not.toContain(word);
    expect(result.headers.get("cache-control")).toBe("no-store");
  });

  it("não dispara trabalho: nada de chamada externa nem gravação na pasta de dados", async () => {
    const before = readdirSync(env.dataDir).filter((name) => name.startsWith("probe-"));
    await call(probeRoute, { path: "/api/probe?bitrix=empresa.bitrix24.com.br" });
    expect(egressProbe).not.toHaveBeenCalled();
    expect(readdirSync(env.dataDir).filter((name) => name.startsWith("probe-"))).toEqual(before);
  });

  it("limita por origem, sem atrapalhar outra origem", async () => {
    const from = (ip: string) => call<ApiErrorBody>(probeRoute, { path: "/api/probe", headers: { "x-forwarded-for": ip } });
    let last = await from("6.6.6.6");
    for (let attempt = 0; attempt < 40 && last.status === 200; attempt++) last = await from("6.6.6.6");
    expect(last.status).toBe(429);
    expect(last.body.error.code).toBe("TOO_MANY_ATTEMPTS");
    expect((await from("7.7.7.7")).status).toBe(200);
  });

  it("/api/health e /health dizem só que estão vivos; /api/status só a etapa", async () => {
    const health = healthRoute();
    expect(health.status).toBe(200);
    expect(await health.json()).toEqual({ ok: true });
    expect((await call(statusRoute)).body).toEqual({ setup: "connect" });
  });
});

describe("diagnóstico completo", () => {
  it("exige sessão de administrador", async () => {
    expect((await call(probeFullRoute, { path: "/api/probe/full" })).status).toBe(401);
    const { token } = await seedUser({ role: "rh" });
    expect((await call(probeFullRoute, { path: "/api/probe/full", token })).status).toBe(403);
  });

  it("para a administração, traz o que resolve o problema e continua sem caminhos, pid ou cabeçalhos", async () => {
    const { token } = await seedUser({ role: "admin" });
    const result = await call<FullProbeDTO>(probeFullRoute, { path: "/api/probe/full", token, headers: { "user-agent": "curl", "x-forwarded-for": "200.195.165.43" } });
    expect(result.status).toBe(200);
    expect(result.body.runtime.node).toBe(process.version);
    expect(result.body.dataDir).toMatchObject({ writable: true });
    expect(typeof result.body.dataDir.persistent).toBe("boolean");
    expect(result.body.sqlite.some((item) => item.ok)).toBe(true);
    expect(result.body.egress).toBeNull();
    for (const word of [...FORBIDDEN_WORDS(env.dataDir), "200.195.165.43"]) expect(result.text).not.toContain(word);
    // O teste de SQLite não deixa arquivo para trás.
    expect(readdirSync(env.dataDir).filter((name) => name.startsWith("probe-"))).toEqual([]);
  });

  it("recusa testar a saída até o que não é portal Bitrix24, sem chamar nada", async () => {
    const { token } = await seedUser({ role: "admin" });
    const result = await call<FullProbeDTO>(probeFullRoute, { path: "/api/probe/full?bitrix=169.254.169.254", token });
    expect(result.body.egress?.error).toMatch(/portal/);
    expect(egressProbe).not.toHaveBeenCalled();
  });

  it("testa a saída para um portal permitido e limita as repetições", async () => {
    const { token } = await seedUser({ role: "admin" });
    egressProbe.mockImplementation(async (host: string) => ({ host, dns: { ok: true, addresses: [] } }));
    let last = await call<FullProbeDTO & ApiErrorBody>(probeFullRoute, { path: "/api/probe/full?bitrix=empresa.bitrix24.com.br", token });
    expect(last.body.egress).toMatchObject({ host: "empresa.bitrix24.com.br" });
    for (let attempt = 0; attempt < 15 && last.status === 200; attempt++) last = await call(probeFullRoute, { path: "/api/probe/full?bitrix=empresa.bitrix24.com.br", token });
    expect(last.status).toBe(429);
  });
});
