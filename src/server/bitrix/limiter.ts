import "server-only";

/**
 * Limitador único do processo (~2 req/s, balde de 2) e pausa compartilhada após limite do Bitrix.
 * Fica em globalThis para que cópias do módulo (rotas, instrumentation, motor) dividam a mesma taxa.
 */
const LIMITER_KEY = Symbol.for("nexo.bitrix.limiter");

export const RATE_PER_SECOND = 2;
export const BUCKET_CAPACITY = 2;
export const MAX_BACKOFF_MS = 15 * 60_000;
const SHORT_BACKOFF_BASE_MS = 2_000;
/** OPERATION_TIME_LIMIT bloqueia o método por minutos no Bitrix: começa mais alto. */
const LONG_BACKOFF_BASE_MS = 60_000;

export interface LimiterState {
  tokens: number;
  refilledAt: number;
  blockedUntil: number;
  strikes: number;
}

type LimiterGlobal = typeof globalThis & { [LIMITER_KEY]?: LimiterState };

export function limiterState(): LimiterState {
  const global = globalThis as LimiterGlobal;
  global[LIMITER_KEY] ??= { tokens: BUCKET_CAPACITY, refilledAt: 0, blockedUntil: 0, strikes: 0 };
  return global[LIMITER_KEY];
}

export function resetLimiterForTests(): void {
  delete (globalThis as LimiterGlobal)[LIMITER_KEY];
}

/** Reserva uma vaga no balde; espera quando ele está vazio (reservas negativas enfileiram chamadas simultâneas). */
export async function takeToken(now: () => number, sleep: (ms: number) => Promise<void>): Promise<void> {
  const state = limiterState();
  const current = now();
  if (state.refilledAt === 0) state.refilledAt = current;
  const elapsed = Math.max(0, current - state.refilledAt);
  state.tokens = Math.min(BUCKET_CAPACITY, state.tokens + (elapsed / 1000) * RATE_PER_SECOND);
  state.refilledAt = current;
  state.tokens -= 1;
  if (state.tokens < 0) await sleep(Math.ceil((-state.tokens / RATE_PER_SECOND) * 1000));
}

/** Registra um limite do Bitrix: pausa exponencial (respeita Retry-After), no máximo 15 min. Devolve até quando. */
export function noteRateLimit(now: number, retryAfterMs: number | null, code: string): number {
  const state = limiterState();
  state.strikes += 1;
  const base = code === "OPERATION_TIME_LIMIT" ? LONG_BACKOFF_BASE_MS : SHORT_BACKOFF_BASE_MS;
  const backoff = Math.min(MAX_BACKOFF_MS, base * 2 ** Math.min(state.strikes - 1, 12));
  const delay = Math.min(MAX_BACKOFF_MS, Math.max(backoff, retryAfterMs ?? 0));
  state.blockedUntil = Math.max(state.blockedUntil, now + delay);
  state.tokens = Math.min(state.tokens, 0);
  return state.blockedUntil;
}

export function noteSuccess(): void {
  limiterState().strikes = 0;
}

export function blockedUntil(): number {
  return limiterState().blockedUntil;
}

/** ISO até quando o Bitrix está limitando a taxa (ou null). */
export function rateLimitedUntil(now: number = Date.now()): string | null {
  const until = limiterState().blockedUntil;
  return until > now ? new Date(until).toISOString() : null;
}

/** Retry-After em segundos ou data HTTP. */
export function parseRetryAfter(value: string | null, now: number = Date.now()): number | null {
  if (!value) return null;
  if (/^\d+$/.test(value.trim())) return Number(value.trim()) * 1000;
  const date = Date.parse(value);
  return Number.isNaN(date) ? null : Math.max(0, date - now);
}
