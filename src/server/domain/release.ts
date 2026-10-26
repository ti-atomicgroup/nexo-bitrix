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
  /** Previsão de liberação (etapas por data). Nulo quando já liberada ou quando depende da etapa anterior. */
  releasesAt: string | null;
}

/** Etapas por data liberam às 08:00 locais do dia calculado. */
export const STAGE_RELEASE_TIME = "08:00";

export function stageReleaseAt(stage: TemplateStageDTO, anchorDate: string, timezone: string): string | null {
  if (stage.releaseMode !== "offset") return null;
  return dueAt(anchorDate, stage.releaseOffsetDays, stage.releaseOffsetUnit, STAGE_RELEASE_TIME, timezone);
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
      const due =
        stage.releaseMode === "start"
          ? true
          : stage.releaseMode === "offset"
            ? Date.parse(stageReleaseAt(stage, journey.anchorDate, timezone) ?? "") <= now.getTime()
            : previousComplete;
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
