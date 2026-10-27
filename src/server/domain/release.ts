import "server-only";
import type { TemplateStageDTO } from "@/shared/contracts";
import type { ReleaseMode } from "@/shared/enums";
import type { ActivityRow } from "../db/repos/activities";
import type { JourneyRow } from "../db/repos/journeys";
import { dueAt } from "./dates";

export interface StageState {
  position: number;
  name: string;
  state: "done" | "current" | "upcoming";
  releaseMode: ReleaseMode;
  /** Previsão de liberação (etapas por data, ou a data-limite de "depois da anterior"). Nulo quando já liberada ou sem data. */
  releasesAt: string | null;
}

/** Etapas por data liberam às 08:00 locais do dia calculado. */
export const STAGE_RELEASE_TIME = "08:00";

/**
 * Data em que a etapa libera pelo calendário: a data da etapa "por data" ou a data-limite de "quando a anterior terminar"
 * (libera nessa data mesmo que a anterior não tenha terminado). Nulo para "start" e para "depois da anterior" sem limite.
 */
export function stageReleaseAt(stage: TemplateStageDTO, anchorDate: string, timezone: string): string | null {
  if (stage.releaseMode === "offset") return dueAt(anchorDate, stage.releaseOffsetDays, stage.releaseOffsetUnit, STAGE_RELEASE_TIME, timezone);
  if (stage.releaseMode === "after_previous" && typeof stage.releaseLatestOffsetDays === "number") {
    return dueAt(anchorDate, stage.releaseLatestOffsetDays, stage.releaseOffsetUnit, STAGE_RELEASE_TIME, timezone);
  }
  return null;
}

export function sortedStages(journey: JourneyRow): TemplateStageDTO[] {
  return [...(journey.snapshot?.stages ?? [])].sort((a, b) => a.position - b.position);
}

export const stageActivities = (activities: ActivityRow[], position: number): ActivityRow[] =>
  activities.filter((activity) => activity.stagePosition === position);

export const isStageReleased = (activities: ActivityRow[]): boolean => activities.some((activity) => activity.releasedAt !== null);

/** Etapa concluída = todas as atividades obrigatórias (não canceladas) feitas. Opcionais nunca seguram a linha. */
export const isStageComplete = (activities: ActivityRow[]): boolean =>
  activities.filter((activity) => activity.required && activity.status !== "cancelled").every((activity) => activity.status === "done");

/** Posições das etapas que devem ser liberadas agora (só jornadas ativas). */
export function stagesToRelease(journey: JourneyRow, activities: ActivityRow[], timezone: string, now: Date = new Date()): number[] {
  if (journey.status !== "active") return [];
  const result: number[] = [];
  let previousComplete = true;
  for (const stage of sortedStages(journey)) {
    const items = stageActivities(activities, stage.position);
    if (!items.length) continue;
    let released = isStageReleased(items);
    if (!released) {
      const byDate = Date.parse(stageReleaseAt(stage, journey.anchorDate, timezone) ?? "") <= now.getTime();
      const due = stage.releaseMode === "start" ? true : stage.releaseMode === "offset" ? byDate : previousComplete || byDate;
      if (due) {
        result.push(stage.position);
        released = true;
      }
    }
    previousComplete = released && isStageComplete(items);
  }
  return result;
}

/**
 * Estações da linha: "done" quando liberada e concluída; "current" para a primeira etapa não concluída
 * e para outras já liberadas e em andamento; "upcoming" para o resto.
 */
export function stagesState(journey: JourneyRow, activities: ActivityRow[], timezone: string): StageState[] {
  let currentAssigned = false;
  return sortedStages(journey).map((stage) => {
    const items = stageActivities(activities, stage.position);
    const released = isStageReleased(items);
    const complete = journey.status === "completed" || (released && isStageComplete(items));
    let state: StageState["state"] = "upcoming";
    if (complete) state = "done";
    else if (released || !currentAssigned) {
      state = "current";
      currentAssigned = true;
    }
    return {
      position: stage.position,
      name: stage.name,
      state,
      releaseMode: stage.releaseMode,
      releasesAt: released || complete ? null : stageReleaseAt(stage, journey.anchorDate, timezone),
    };
  });
}

/**
 * Etapas "quando a anterior terminar" ainda bloqueadas porque a anterior (já liberada) não terminou: para cada uma,
 * as atividades obrigatórias que faltam na anterior. Com isso o painel Hoje diz o que está travando a jornada.
 */
export function blockedStages(journey: JourneyRow, activities: ActivityRow[]): Array<{ stage: TemplateStageDTO; blockers: ActivityRow[] }> {
  if (journey.status !== "active") return [];
  const result: Array<{ stage: TemplateStageDTO; blockers: ActivityRow[] }> = [];
  let previous: ActivityRow[] | null = null;
  for (const stage of sortedStages(journey)) {
    const items = stageActivities(activities, stage.position);
    if (!items.length) continue;
    if (stage.releaseMode === "after_previous" && previous && !isStageReleased(items) && isStageReleased(previous) && !isStageComplete(previous)) {
      const blockers = previous.filter((activity) => activity.required && activity.status !== "cancelled" && activity.status !== "done");
      if (blockers.length) result.push({ stage, blockers });
    }
    previous = items;
  }
  return result;
}
