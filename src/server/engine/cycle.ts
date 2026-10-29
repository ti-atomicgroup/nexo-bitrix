import "server-only";
import { isBitrixError } from "../bitrix/errors";
import { rateLimitedUntil } from "../bitrix/limiter";
import { purgeDoneJobs, requeueStuckJobs } from "../db/repos/jobs";
import { acquireLease, releaseLease } from "../db/repos/leases";
import { getSetupStage, getWebhookRecord, patchSyncState } from "../db/repos/settings";
import { log } from "../log";
import { errorMessage } from "./job-errors";
import { inFlightJobIds, runDueJobs } from "./jobs";
import { refreshPeopleIfStale } from "./people";
import { pollChecklists, pollOpenTasks } from "./poll";
import { enqueuePushes, releaseDueStages } from "./release";
import { engineContext, processId, type EngineContext } from "./runtime";
import { runTriggers } from "./triggers";

/** O lease expira depois de 3 ciclos: se este processo morrer, outro assume. */
export const CYCLE_LEASE_MS = 180_000;
const STUCK_JOB_MS = 5 * 60_000;
const KEEP_DONE_JOBS_MS = 7 * 24 * 3_600_000;

export interface CycleReport {
  ran: boolean;
  skipped?: "not_ready" | "lease";
  errors: string[];
  /** Algo novo entrou na fila (ex.: etapa liberada depois de uma tarefa fechar): vale rodar de novo logo. */
  followUp: boolean;
  ms: number;
}

const STEP_LABEL: Record<string, string> = {
  context: "Conexão com o Bitrix24",
  requeue: "Fila de envios",
  release: "Liberação de etapas",
  push: "Fila de envios",
  jobs: "Envios ao Bitrix24",
  poll: "Consulta das tarefas",
  checklists: "Leitura dos checklists",
  release_after_poll: "Liberação de etapas",
  triggers: "Gatilhos do CRM",
  people: "Atualização de pessoas",
  housekeeping: "Limpeza da fila",
};

/**
 * Um ciclo de sincronização. Cada passo tem o próprio try/catch: um erro é registrado e o ciclo segue.
 * Quando o Bitrix limita a taxa, os passos que chamam o Bitrix ficam para o próximo ciclo.
 */
export async function runCycle(): Promise<CycleReport> {
  const started = Date.now();
  if (getSetupStage() !== "ready" || !getWebhookRecord()) return { ran: false, skipped: "not_ready", errors: [], followUp: false, ms: 0 };
  if (!acquireLease("cycle", processId(), CYCLE_LEASE_MS)) return { ran: false, skipped: "lease", errors: [], followUp: false, ms: 0 };
  const errors: string[] = [];
  let followUp = false;
  let ctx: EngineContext | null = null;

  const record = (name: string, error: unknown): void => {
    if (ctx && isBitrixError(error) && error.rateLimited) ctx.rateLimited = true;
    errors.push(`${STEP_LABEL[name] ?? name}: ${errorMessage(error)}`);
    log.error("cycle_step_failed", { step: name, error });
  };
  /** Passo só com o SQLite. */
  const local = async (name: string, run: () => unknown): Promise<void> => {
    try {
      await run();
    } catch (error) {
      record(name, error);
    }
  };
  /** Passo que chama o Bitrix: pulado sem conexão ou durante a pausa por limite. */
  const remote = async (name: string, run: (context: EngineContext) => unknown): Promise<void> => {
    if (!ctx || ctx.rateLimited) return;
    try {
      await run(ctx);
    } catch (error) {
      record(name, error);
    }
  };

  await local("context", () => {
    ctx = engineContext();
  });
  await local("requeue", () => requeueStuckJobs(new Date(Date.now() - STUCK_JOB_MS).toISOString(), inFlightJobIds()));
  await local("release", () => releaseDueStages());
  await local("push", () => enqueuePushes());
  await remote("jobs", (context) => runDueJobs(context));
  await remote("poll", (context) => pollOpenTasks(context));
  await remote("checklists", (context) => pollChecklists(context));
  await local("release_after_poll", () => {
    const released = releaseDueStages();
    const queued = enqueuePushes();
    if (released > 0 || queued > 0) followUp = true;
  });
  await remote("triggers", (context) => runTriggers(context));
  await remote("people", () => refreshPeopleIfStale());
  await local("housekeeping", () => purgeDoneJobs(new Date(Date.now() - KEEP_DONE_JOBS_MS).toISOString()));

  const ms = Date.now() - started;
  try {
    patchSyncState({ lastCycleAt: new Date(started).toISOString(), lastCycleMs: ms, lastError: errors[0] ?? null, rateLimitedUntil: rateLimitedUntil() });
  } catch (error) {
    log.error("cycle_state_failed", { error });
  }
  // Solta o lease ao terminar: um processo novo (republicação, reinício) não espera os 3 min do prazo para sincronizar.
  try {
    releaseLease("cycle", processId());
  } catch (error) {
    log.error("cycle_lease_release_failed", { error });
  }
  return { ran: true, errors, followUp, ms };
}
