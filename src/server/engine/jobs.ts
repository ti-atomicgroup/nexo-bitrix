import "server-only";
import { isBitrixError } from "../bitrix/errors";
import { blockedUntil } from "../bitrix/limiter";
import { getActivity, updateActivity } from "../db/repos/activities";
import { completeJob, failJob, takeDueJobs, type JobRow } from "../db/repos/jobs";
import { log } from "../log";
import { handleDocumentSend, markDocumentFailed } from "./documents";
import { handleFeedPost, handleMeetingCreate, handleNotify } from "./extras";
import { handlePersonInvite, markInviteFailed } from "./invite";
import { errorMessage, RetryLater } from "./job-errors";
import { refreshPeople } from "./people";
import { JOB_KINDS, PUSH_ALIASES } from "./queue";
import type { EngineContext } from "./runtime";
import { handleActivityPush, handleTaskComment, handleTaskCreate } from "./tasks";

export const MAX_JOB_ATTEMPTS = 8;
const BASE_RETRY_MS = 30_000;
const MAX_RETRY_MS = 30 * 60_000;

type JobHandler = (payload: Record<string, unknown>, ctx: EngineContext) => Promise<void>;

const HANDLERS: Record<string, JobHandler> = {
  [JOB_KINDS.taskCreate]: handleTaskCreate,
  [JOB_KINDS.activityPush]: handleActivityPush,
  [JOB_KINDS.taskComment]: handleTaskComment,
  [JOB_KINDS.peopleRefresh]: async () => {
    await refreshPeople();
  },
  [JOB_KINDS.notify]: handleNotify,
  [JOB_KINDS.meetingCreate]: handleMeetingCreate,
  [JOB_KINDS.feedPost]: handleFeedPost,
  [JOB_KINDS.documentSend]: handleDocumentSend,
  [JOB_KINDS.personInvite]: handlePersonInvite,
  ...Object.fromEntries(PUSH_ALIASES.map((alias) => [alias, handleActivityPush])),
};

/** Jobs cuja falha definitiva deixa a atividade com erro de sincronização visível no Hoje. */
const ACTIVITY_SYNC_KINDS = new Set<string>([JOB_KINDS.taskCreate, JOB_KINDS.activityPush, ...PUSH_ALIASES]);

/** Espera de 30 s · 2^n (máx. 30 min), nunca antes do fim da pausa por limite do Bitrix. */
export function retryDelay(attempts: number): number {
  return Math.min(MAX_RETRY_MS, BASE_RETRY_MS * 2 ** Math.max(0, attempts - 1));
}

function finalFailure(job: JobRow, message: string): void {
  if (job.kind === JOB_KINDS.documentSend && typeof job.payload.documentId === "string") markDocumentFailed(job.payload.documentId, message);
  if (job.kind === JOB_KINDS.personInvite && typeof job.payload.personId === "string") markInviteFailed(job.payload.personId, message);
  const activityId = typeof job.payload.activityId === "string" ? job.payload.activityId : null;
  if (activityId && ACTIVITY_SYNC_KINDS.has(job.kind) && getActivity(activityId)) {
    updateActivity(activityId, { syncState: "error", syncError: message });
  }
}

export async function runJob(job: JobRow, ctx: EngineContext): Promise<void> {
  const handler = HANDLERS[job.kind];
  if (!handler) {
    failJob(job.id, `Tipo de envio desconhecido (${job.kind}).`, null);
    return;
  }
  try {
    await handler(job.payload, ctx);
    completeJob(job.id);
  } catch (error) {
    const message = errorMessage(error);
    const attempts = job.attempts + 1;
    if (isBitrixError(error) && error.rateLimited) ctx.rateLimited = true;
    if (error instanceof RetryLater && attempts < MAX_JOB_ATTEMPTS) {
      failJob(job.id, message, new Date(Math.max(error.at, Date.now() + 1_000)).toISOString());
      return;
    }
    if (isBitrixError(error) && error.retryable && attempts < MAX_JOB_ATTEMPTS) {
      failJob(job.id, message, new Date(Math.max(Date.now() + retryDelay(attempts), blockedUntil())).toISOString());
      return;
    }
    failJob(job.id, message, null);
    finalFailure(job, message);
    log.warn("job_failed", { kind: job.kind, jobId: job.id, attempts, error });
  }
}

/** Processa os jobs vencidos, um por vez, dentro de um orçamento por ciclo. Para quando o Bitrix limita a taxa. */
export async function runDueJobs(ctx: EngineContext, budget: { maxJobs?: number; maxMs?: number } = {}): Promise<number> {
  const maxJobs = budget.maxJobs ?? 30;
  const maxMs = budget.maxMs ?? 40_000;
  const started = Date.now();
  let processed = 0;
  while (processed < maxJobs && !ctx.rateLimited && Date.now() - started < maxMs) {
    const [job] = takeDueJobs(new Date().toISOString(), 1);
    if (!job) break;
    processed++;
    await runJob(job, ctx);
  }
  return processed;
}
