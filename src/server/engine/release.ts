import "server-only";
import { getDb } from "../db";
import { listActivities, listActivitiesToPush, updateActivity } from "../db/repos/activities";
import { audit } from "../db/repos/audit";
import { enqueueJob } from "../db/repos/jobs";
import { listJourneys, type JourneyRow } from "../db/repos/journeys";
import { getCompany } from "../db/repos/settings";
import { stagesToRelease } from "../domain/release";
import { onStagesReleased } from "./extras";
import { enqueueActivityJob, JOB_KINDS } from "./queue";

/** Erro ou incerteza na criação: nova tentativa lenta (a cada ~30 min), sem martelar o Bitrix. */
export const SLOW_RETRY_MS = 30 * 60_000;

/**
 * Libera as etapas devidas de uma jornada ativa: atividades bloqueadas viram "a fazer".
 * `initial` = liberação no momento da criação (sem aviso ao colaborador).
 */
export function releaseJourney(journey: JourneyRow, options: { now?: Date; timezone?: string; initial?: boolean } = {}): number[] {
  const now = options.now ?? new Date();
  const timezone = options.timezone ?? getCompany().timezone;
  const activities = listActivities(journey.id);
  const positions = stagesToRelease(journey, activities, timezone, now);
  if (!positions.length) return [];
  const at = now.toISOString();
  getDb().tx(() => {
    for (const activity of activities) {
      if (positions.includes(activity.stagePosition) && activity.status === "locked") updateActivity(activity.id, { status: "open", releasedAt: at });
    }
    for (const position of positions) {
      const stage = journey.snapshot.stages.find((candidate) => candidate.position === position);
      audit({
        actorType: "system",
        action: "Etapa liberada",
        entity: "journey",
        entityId: journey.id,
        detail: { text: `Etapa “${stage?.name ?? position + 1}” liberada.`, stage: position },
      });
    }
    onStagesReleased(journey, positions, listActivities(journey.id), { initial: Boolean(options.initial) });
  });
  return positions;
}

/** Libera as etapas devidas de todas as jornadas ativas. Devolve quantas etapas foram liberadas. */
export function releaseDueStages(now: Date = new Date()): number {
  const timezone = getCompany().timezone;
  let released = 0;
  for (const journey of listJourneys({ status: ["active"] })) released += releaseJourney(journey, { now, timezone }).length;
  return released;
}

/**
 * Enfileira a criação das tarefas liberadas que ainda não existem no Bitrix (jornadas ativas, com responsável).
 * Devolve quantas atividades entraram na fila agora.
 */
export function enqueuePushes(now: Date = new Date()): number {
  let queued = 0;
  for (const activity of listActivitiesToPush()) {
    if (activity.syncState === "local" || activity.syncState === "queued") {
      enqueueActivityJob(JOB_KINDS.taskCreate, activity.id);
      if (activity.syncState === "local") {
        updateActivity(activity.id, { syncState: "queued" });
        queued++;
      }
    } else {
      // "error" e "uncertain": só reconcilia/tenta de novo devagar; um job já agendado mais cedo é mantido.
      enqueueJob({
        kind: JOB_KINDS.taskCreate,
        dedupeKey: `${JOB_KINDS.taskCreate}:${activity.id}`,
        payload: { activityId: activity.id },
        runAt: new Date(now.getTime() + SLOW_RETRY_MS).toISOString(),
      });
    }
  }
  return queued;
}
