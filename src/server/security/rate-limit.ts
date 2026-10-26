import "server-only";

/**
 * Limitador em memória por janela deslizante, por chave (ex.: `login:<e-mail>`, `link:<hash>`).
 * Fica em `globalThis` para que cópias do módulo (rotas, páginas, motor) dividam o mesmo estado.
 */
const STORE_KEY = Symbol.for("nexo.ratelimit");
const MAX_KEYS = 10_000;
const SWEEP_EVERY_MS = 60_000;

interface Bucket {
  windowMs: number;
  hits: number[];
}

interface Store {
  buckets: Map<string, Bucket>;
  sweptAt: number;
}

type StoreGlobal = typeof globalThis & { [STORE_KEY]?: Store };

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

function store(): Store {
  const global = globalThis as StoreGlobal;
  global[STORE_KEY] ??= { buckets: new Map(), sweptAt: 0 };
  return global[STORE_KEY];
}

function sweep(current: Store, now: number): void {
  if (now - current.sweptAt < SWEEP_EVERY_MS && current.buckets.size < MAX_KEYS) return;
  current.sweptAt = now;
  for (const [key, bucket] of current.buckets) {
    const newest = bucket.hits[bucket.hits.length - 1] ?? 0;
    if (newest <= now - bucket.windowMs) current.buckets.delete(key);
  }
  // Teto de memória: descarta as chaves mais antigas (o Map mantém a ordem de inserção) com folga de 10%.
  if (current.buckets.size < MAX_KEYS) return;
  for (const key of current.buckets.keys()) {
    if (current.buckets.size <= MAX_KEYS * 0.9) break;
    current.buckets.delete(key);
  }
}

function recent(key: string, rule: RateLimitRule, now: number): number[] {
  const bucket = store().buckets.get(key);
  return bucket ? bucket.hits.filter((at) => at > now - rule.windowMs) : [];
}

function result(hits: number[], rule: RateLimitRule, now: number): RateLimitResult {
  const allowed = hits.length < rule.limit;
  // Libera quando sai da janela a tentativa que deixa a contagem abaixo do limite.
  const releasing = hits[Math.max(0, hits.length - rule.limit)] ?? now;
  return { allowed, remaining: Math.max(0, rule.limit - hits.length), retryAfterMs: allowed ? 0 : Math.max(0, releasing + rule.windowMs - now) };
}

/** Consulta sem registrar tentativa. */
export function peekRateLimit(key: string, rule: RateLimitRule, now = Date.now()): RateLimitResult {
  return result(recent(key, rule, now), rule, now);
}

/** Registra uma tentativa (mesmo além do limite) e devolve o estado depois dela: `allowed` diz se cabe mais uma. */
export function recordHit(key: string, rule: RateLimitRule, now = Date.now()): RateLimitResult {
  const current = store();
  sweep(current, now);
  const hits = [...recent(key, rule, now), now].slice(-Math.max(rule.limit, 1) * 2);
  current.buckets.delete(key);
  current.buckets.set(key, { windowMs: rule.windowMs, hits });
  return result(hits, rule, now);
}

/** Consome uma tentativa se ainda houver espaço (`allowed` = esta tentativa passou); se não houver, nada é registrado. */
export function rateLimit(key: string, rule: RateLimitRule, now = Date.now()): RateLimitResult {
  const before = peekRateLimit(key, rule, now);
  if (!before.allowed) return before;
  const after = recordHit(key, rule, now);
  return { allowed: true, remaining: after.remaining, retryAfterMs: 0 };
}

export function clearRateLimit(key: string): void {
  store().buckets.delete(key);
}

export function resetRateLimitsForTests(): void {
  const current = store();
  current.buckets.clear();
  current.sweptAt = 0;
}
