import { beforeEach, describe, expect, it } from "vitest";
import { clearRateLimit, peekRateLimit, rateLimit, recordHit, resetRateLimitsForTests } from "@/server/security/rate-limit";

const rule = { limit: 3, windowMs: 1000 };

beforeEach(() => resetRateLimitsForTests());

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

  it("guarda o estado em globalThis para cópias do módulo dividirem a mesma contagem", () => {
    rateLimit("compartilhada", rule, 0);
    const store = (globalThis as Record<symbol, unknown>)[Symbol.for("nexo.ratelimit")] as { buckets: Map<string, unknown> };
    expect(store.buckets.has("compartilhada")).toBe(true);
  });
});
