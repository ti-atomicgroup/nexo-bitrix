import "server-only";
import { getDb } from "../db";
import { log } from "../log";
import { keyedHash } from "./crypto";

/**
 * Limitador por janela deslizante, por chave (ex.: `login:<e-mail>`, `link:<hash>`, `login-origin:<ip>`).
 * Fica no SQLite: continua valendo depois de reiniciar e entre processos que dividem o volume. A chave vai como HMAC, então
 * nem e-mail nem IP ficam em texto. Se o banco falhar, a contagem segue na memória: limita menos, mas não derruba a rota.
 */
const MEMORY_KEY = Symbol.for("nexo.ratelimit.memory");
const MAX_MEMORY_KEYS = 10_000;
const SWEEP_EVERY_MS = 60_000;

export interface RateLimitRule {
  limit: number;
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  /** Quanto falta para liberar uma nova tentativa (0 quando liberado). */
  retryAfterMs: number;
}

interface Memory {
  hits: Map<string, number[]>;
  sweptAt: number;
  warnedAt: number;
}

type MemoryGlobal = typeof globalThis & { [MEMORY_KEY]?: Memory };

function memory(): Memory {
  const global = globalThis as MemoryGlobal;
  global[MEMORY_KEY] ??= { hits: new Map(), sweptAt: 0, warnedAt: 0 };
  return global[MEMORY_KEY];
}

function result(hits: number[], rule: RateLimitRule, now: number): RateLimitResult {
  const allowed = hits.length < rule.limit;
  // Libera quando sai da janela a tentativa que deixa a contagem abaixo do limite.
  const releasing = hits[Math.max(0, hits.length - rule.limit)] ?? now;
  return { allowed, remaining: Math.max(0, rule.limit - hits.length), retryAfterMs: allowed ? 0 : Math.max(0, releasing + rule.windowMs - now) };
}

/* ───────────── no banco ───────────── */

function stored(hash: string, rule: RateLimitRule, now: number): number[] {
  return getDb()
    .prepare("SELECT at_ms FROM rate_limit_hits WHERE key_hash = ? AND at_ms > ? AND at_ms <= ? ORDER BY at_ms, rowid")
    .all<{ at_ms: number | bigint }>(hash, now - rule.windowMs, now)
    .map((row) => Number(row.at_ms));
}

function store(hash: string, rule: RateLimitRule, now: number): void {
  const db = getDb();
  db.prepare("INSERT INTO rate_limit_hits (key_hash, at_ms, expires_ms) VALUES (?, ?, ?)").run(hash, now, now + rule.windowMs);
  // Mais que o dobro do limite não muda a resposta: não acumula linhas de quem insiste.
  db.prepare("DELETE FROM rate_limit_hits WHERE rowid IN (SELECT rowid FROM rate_limit_hits WHERE key_hash = ? ORDER BY at_ms DESC, rowid DESC LIMIT -1 OFFSET ?)").run(hash, Math.max(rule.limit, 1) * 2);
  const current = memory();
  if (now - current.sweptAt >= SWEEP_EVERY_MS || now < current.sweptAt) {
    current.sweptAt = now;
    db.prepare("DELETE FROM rate_limit_hits WHERE expires_ms <= ?").run(now);
  }
}

/* ───────────── na memória, só se o banco falhar ───────────── */

function inMemory(key: string, rule: RateLimitRule, now: number): number[] {
  return (memory().hits.get(key) ?? []).filter((at) => at > now - rule.windowMs);
}

function keepInMemory(key: string, hits: number[], rule: RateLimitRule): void {
  const { hits: all } = memory();
  all.delete(key);
  all.set(key, hits.slice(-Math.max(rule.limit, 1) * 2));
  if (all.size <= MAX_MEMORY_KEYS) return;
  for (const oldest of all.keys()) {
    if (all.size <= MAX_MEMORY_KEYS * 0.9) break;
    all.delete(oldest);
  }
}

function warnFallback(error: unknown): void {
  const current = memory();
  const now = Date.now();
  if (now - current.warnedAt < 10 * 60_000) return;
  current.warnedAt = now;
  log.warn("rate_limit_fallback", { message: "Limites de tentativas na memória: o banco não respondeu.", error });
}

/** Tenta no banco, em transação (dois processos não passam juntos pela mesma vaga); se falhar, na memória. */
function run<T>(key: string, inDb: (hash: string) => T, inRam: () => T): T {
  try {
    return getDb().tx(() => inDb(keyedHash(key)));
  } catch (error) {
    warnFallback(error);
    return inRam();
  }
}

/* ───────────── interface ───────────── */

/** Consulta sem registrar tentativa. */
export function peekRateLimit(key: string, rule: RateLimitRule, now = Date.now()): RateLimitResult {
  return run(
    key,
    (hash) => result(stored(hash, rule, now), rule, now),
    () => result(inMemory(key, rule, now), rule, now),
  );
}

/** Registra uma tentativa (mesmo além do limite) e devolve o estado depois dela: `allowed` diz se cabe mais uma. */
export function recordHit(key: string, rule: RateLimitRule, now = Date.now()): RateLimitResult {
  return run(
    key,
    (hash) => {
      store(hash, rule, now);
      return result(stored(hash, rule, now), rule, now);
    },
    () => {
      const hits = [...inMemory(key, rule, now), now];
      keepInMemory(key, hits, rule);
      return result(hits, rule, now);
    },
  );
}

/** Consome uma tentativa se ainda houver espaço (`allowed` = esta tentativa passou); se não houver, nada é registrado. */
export function rateLimit(key: string, rule: RateLimitRule, now = Date.now()): RateLimitResult {
  const consume = (before: RateLimitResult, record: () => void): RateLimitResult => {
    if (!before.allowed) return before;
    record();
    return { allowed: true, remaining: before.remaining - 1, retryAfterMs: 0 };
  };
  return run(
    key,
    (hash) => consume(result(stored(hash, rule, now), rule, now), () => store(hash, rule, now)),
    () => {
      const hits = inMemory(key, rule, now);
      return consume(result(hits, rule, now), () => keepInMemory(key, [...hits, now], rule));
    },
  );
}

export function clearRateLimit(key: string): void {
  memory().hits.delete(key);
  try {
    getDb().prepare("DELETE FROM rate_limit_hits WHERE key_hash = ?").run(keyedHash(key));
  } catch (error) {
    warnFallback(error);
  }
}

export function resetRateLimitsForTests(): void {
  const current = memory();
  current.hits.clear();
  current.sweptAt = 0;
  current.warnedAt = 0;
  try {
    getDb().exec("DELETE FROM rate_limit_hits");
  } catch {
    // sem banco aberto no teste: só a memória conta
  }
}
