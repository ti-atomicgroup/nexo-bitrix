import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDb, setDbForTests } from "@/server/db";
import { openDb, type Db } from "@/server/db/driver";
import { clearRateLimit, peekRateLimit, rateLimit, recordHit, resetRateLimitsForTests } from "@/server/security/rate-limit";
import { useTestDb } from "../../support/db";

const rule = { limit: 3, windowMs: 1000 };

let env: ReturnType<typeof useTestDb>;
let others: Db[];
beforeEach(() => {
  env = useTestDb();
  others = [];
  resetRateLimitsForTests();
});
afterEach(() => {
  setDbForTests(env.db, env.dataDir);
  for (const db of others) db.close();
  env.cleanup();
  vi.restoreAllMocks();
});

/** Outra conexão ao mesmo arquivo: é o que outra instância do Nexo, ou o processo depois de reiniciar, enxerga. */
function otherInstance(): Db {
  const db = openDb(join(env.dataDir, "nexo.sqlite"));
  others.push(db);
  return db;
}

describe("limitador por janela deslizante", () => {
  it("libera até o limite e informa quando tentar de novo", () => {
    expect(rateLimit("k", rule, 0)).toEqual({ allowed: true, remaining: 2, retryAfterMs: 0 });
    expect(rateLimit("k", rule, 100).allowed).toBe(true);
    expect(rateLimit("k", rule, 200).allowed).toBe(true);
    expect(rateLimit("k", rule, 300)).toEqual({ allowed: false, remaining: 0, retryAfterMs: 700 });
    // Recusa não conta como tentativa.
    expect(peekRateLimit("k", rule, 999).allowed).toBe(false);
  });

  it("a janela desliza: a tentativa mais antiga sai e abre espaço", () => {
    for (const at of [0, 100, 200]) rateLimit("k", rule, at);
    expect(rateLimit("k", rule, 1000).allowed).toBe(true);
    expect(rateLimit("k", rule, 1001).allowed).toBe(false);
    expect(rateLimit("k", rule, 1101).allowed).toBe(true);
  });

  it("separa as chaves e limpa uma chave sob demanda", () => {
    for (const at of [0, 1, 2]) rateLimit("a", rule, at);
    expect(rateLimit("b", rule, 3).allowed).toBe(true);
    expect(rateLimit("a", rule, 3).allowed).toBe(false);
    clearRateLimit("a");
    expect(rateLimit("a", rule, 4).allowed).toBe(true);
  });

  it("recordHit registra mesmo além do limite e diz se cabe mais uma", () => {
    expect(recordHit("f", rule, 0).allowed).toBe(true);
    expect(recordHit("f", rule, 1).allowed).toBe(true);
    const third = recordHit("f", rule, 2);
    expect(third.allowed).toBe(false);
    expect(third.retryAfterMs).toBe(998);
  });
});

describe("limites persistentes", () => {
  it("continuam valendo depois de reiniciar o processo", () => {
    for (const at of [0, 1, 2]) rateLimit("login:rita", rule, at);
    // Reinício: o que estava na memória some; só o banco continua.
    resetRateLimitsForMemoryOnly();
    setDbForTests(otherInstance(), env.dataDir);
    expect(rateLimit("login:rita", rule, 3).allowed).toBe(false);
  });

  it("valem entre duas instâncias que dividem o banco", () => {
    const second = otherInstance();
    expect(rateLimit("setup:connect", rule, 0).allowed).toBe(true);
    setDbForTests(second, env.dataDir);
    expect(rateLimit("setup:connect", rule, 1).allowed).toBe(true);
    setDbForTests(env.db, env.dataDir);
    expect(rateLimit("setup:connect", rule, 2).allowed).toBe(true);
    setDbForTests(second, env.dataDir);
    expect(rateLimit("setup:connect", rule, 3).allowed).toBe(false);
  });

  it("não guarda e-mail nem IP em texto", () => {
    rateLimit("login:rita@empresa.com.br", rule, 0);
    rateLimit("login-origin:200.195.165.43", rule, 0);
    const keys = getDb().prepare("SELECT key_hash FROM rate_limit_hits").all<{ key_hash: string }>();
    expect(keys).toHaveLength(2);
    for (const { key_hash } of keys) expect(key_hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("apaga o que venceu e não acumula além do necessário", () => {
    for (let at = 0; at < 50; at++) recordHit("muitos", rule, at);
    expect(getDb().prepare("SELECT COUNT(*) AS total FROM rate_limit_hits").get<{ total: number }>()?.total).toBeLessThanOrEqual(rule.limit * 2);
    rateLimit("depois", rule, 1_000_000);
    const stale = getDb().prepare("SELECT COUNT(*) AS total FROM rate_limit_hits WHERE expires_ms <= 1000000").get<{ total: number }>()?.total;
    expect(stale).toBe(0);
  });

  it("com o banco fora do ar, cai para a memória: continua limitando, sem derrubar a rota", () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    setDbForTests(null);
    const broken = { prepare: () => { throw new Error("disco cheio"); }, tx: () => { throw new Error("disco cheio"); } } as unknown as Db;
    setBrokenDb(broken);
    for (const at of [0, 1, 2]) expect(rateLimit("x", rule, at).allowed).toBe(true);
    expect(rateLimit("x", rule, 3).allowed).toBe(false);
  });
});

function resetRateLimitsForMemoryOnly(): void {
  (globalThis as Record<symbol, unknown>)[Symbol.for("nexo.ratelimit.memory")] = undefined;
}

/** Conexão quebrada no lugar da global, sem passar pelas migrações. */
function setBrokenDb(db: Db): void {
  (globalThis as Record<symbol, unknown>)[Symbol.for("nexo.db")] = { db, dataDir: env.dataDir };
}
