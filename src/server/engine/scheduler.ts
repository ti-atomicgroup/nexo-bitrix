import "server-only";
import { getSyncState, patchSyncState } from "../db/repos/settings";
import { log } from "../log";
import { runCycle } from "./cycle";
import type { SchedulerStatus } from "./types";

/**
 * Laço de sincronização dentro do próprio processo Next (sem worker separado).
 * - 1º ciclo ~5 s depois de iniciar; depois a cada 60 s; o próximo é agendado no `finally` (nunca morre por erro).
 * - `setTimeout(...).unref()`: o laço não segura o processo.
 * - Estado em globalThis: cópias do módulo (rotas, instrumentation) compartilham o mesmo laço.
 */
const SCHEDULER_KEY = Symbol.for("nexo.scheduler");
export const FIRST_CYCLE_DELAY_MS = 5_000;
export const CYCLE_INTERVAL_MS = 60_000;
export const KICK_DELAY_MS = 1_000;
/** Ciclo "rodando" há mais que isso: considerado travado pelo watchdog. */
const STUCK_CYCLE_MS = 10 * 60_000;

type CycleRunner = () => Promise<{ followUp?: boolean } | unknown>;

interface SchedulerState {
  started: boolean;
  timer: ReturnType<typeof setTimeout> | null;
  nextAt: number | null;
  inCycle: boolean;
  cycleStartedAt: number | null;
  /** Pedido de ciclo que chegou durante um ciclo: roda de novo logo em seguida. */
  kickPending: boolean;
  generation: number;
  runner: CycleRunner | null;
}

type SchedulerGlobal = typeof globalThis & { [SCHEDULER_KEY]?: SchedulerState };

function state(): SchedulerState {
  const global = globalThis as SchedulerGlobal;
  global[SCHEDULER_KEY] ??= { started: false, timer: null, nextAt: null, inCycle: false, cycleStartedAt: null, kickPending: false, generation: 0, runner: null };
  return global[SCHEDULER_KEY];
}

/** Desligado em `next dev` e nos testes, salvo NEXO_SCHEDULER=1; NEXO_SCHEDULER=0 desliga sempre. */
export function schedulerEnabled(): boolean {
  const flag = process.env.NEXO_SCHEDULER;
  if (flag === "0") return false;
  if (flag === "1") return true;
  return process.env.NODE_ENV !== "development" && process.env.NODE_ENV !== "test";
}

function schedule(delayMs: number): void {
  const current = state();
  if (current.timer) clearTimeout(current.timer);
  current.nextAt = Date.now() + delayMs;
  const timer = setTimeout(() => void tick(), delayMs);
  timer.unref?.();
  current.timer = timer;
}

async function tick(): Promise<void> {
  const current = state();
  current.timer = null;
  if (current.inCycle) {
    schedule(CYCLE_INTERVAL_MS);
    return;
  }
  const generation = ++current.generation;
  current.inCycle = true;
  current.cycleStartedAt = Date.now();
  current.kickPending = false;
  try {
    const report = await (current.runner ?? runCycle)();
    if (report && typeof report === "object" && "followUp" in report && report.followUp) current.kickPending = true;
  } catch (error) {
    log.error("cycle_failed", { error });
  } finally {
    // Um ciclo antigo que o watchdog já substituiu não reagenda nada.
    if (generation === current.generation) {
      current.inCycle = false;
      current.cycleStartedAt = null;
      if (current.started) {
        schedule(current.kickPending ? KICK_DELAY_MS : CYCLE_INTERVAL_MS);
        try {
          patchSyncState({ nextCycleAt: current.nextAt !== null ? new Date(current.nextAt).toISOString() : null });
        } catch {
          // só informativo (Diagnóstico)
        }
      }
    }
  }
}

export function startScheduler(): void {
  if (!schedulerEnabled()) return;
  const current = state();
  if (current.started) return;
  current.started = true;
  schedule(FIRST_CYCLE_DELAY_MS);
  log.info("scheduler_started", { firstCycleInMs: FIRST_CYCLE_DELAY_MS });
}

/** Pede um ciclo o quanto antes (debounce de ~1 s). Seguro de chamar em qualquer rota. */
export function kick(): void {
  try {
    const current = state();
    if (!current.started) return;
    if (current.inCycle) {
      current.kickPending = true;
      return;
    }
    if (current.nextAt !== null && current.timer && current.nextAt - Date.now() <= KICK_DELAY_MS) return;
    schedule(KICK_DELAY_MS);
  } catch {
    // pedir um ciclo nunca derruba a requisição
  }
}

/** Watchdog chamado pelas rotas: religa o laço se o timer sumiu ou se um ciclo travou. */
export function ensureScheduler(): void {
  try {
    if (!schedulerEnabled()) return;
    const current = state();
    if (!current.started) {
      startScheduler();
      return;
    }
    const now = Date.now();
    if (current.inCycle) {
      if (current.cycleStartedAt !== null && now - current.cycleStartedAt > STUCK_CYCLE_MS) {
        current.generation++;
        current.inCycle = false;
        current.cycleStartedAt = null;
        schedule(KICK_DELAY_MS);
        log.warn("scheduler_restarted", { reason: "ciclo travado" });
      }
      return;
    }
    if (!current.timer || current.nextAt === null || now - current.nextAt > 2 * CYCLE_INTERVAL_MS) {
      schedule(KICK_DELAY_MS);
      log.warn("scheduler_restarted", { reason: "timer parado" });
    }
  } catch {
    // o watchdog nunca derruba a requisição
  }
}

export function schedulerStatus(): SchedulerStatus {
  const current = state();
  let sync: ReturnType<typeof getSyncState> | null = null;
  try {
    sync = getSyncState();
  } catch {
    sync = null;
  }
  return {
    running: current.started && (current.timer !== null || current.inCycle),
    lastCycleAt: sync?.lastCycleAt ?? null,
    lastCycleMs: sync?.lastCycleMs ?? null,
    lastError: sync?.lastError ?? null,
    nextCycleAt: current.nextAt !== null ? new Date(current.nextAt).toISOString() : (sync?.nextCycleAt ?? null),
  };
}

/** Para testes: troca o que cada ciclo executa. */
export function setCycleRunnerForTests(runner: CycleRunner | null): void {
  state().runner = runner;
}

/** Para testes: para o laço e zera o estado. */
export function stopSchedulerForTests(): void {
  const current = state();
  if (current.timer) clearTimeout(current.timer);
  (globalThis as SchedulerGlobal)[SCHEDULER_KEY] = undefined;
}
