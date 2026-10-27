import type { ChipTone } from "@/components/ui/chip";
import { daysBetween, plural, relativeDays, relativeTo, wallClock } from "@/lib/format";
import type { ActivityDTO, JourneyRisk, TemplateSummaryDTO } from "@/shared/contracts";
import type { ActivityStatus, JourneyKind, JourneyStatus, LedgerStatus, SyncState } from "@/shared/enums";

export const RISK_CHIP: Record<JourneyRisk, { tone: ChipTone; label: string }> = {
  ok: { tone: "ok", label: "Em dia" },
  attention: { tone: "attention", label: "Atenção" },
  critical: { tone: "late", label: "Crítico" },
};

export const JOURNEY_STATUS_TONE: Record<JourneyStatus, ChipTone> = {
  active: "info",
  paused: "attention",
  completed: "ok",
  cancelled: "neutral",
};

export const ACTIVITY_STATUS_TONE: Record<ActivityStatus, ChipTone> = {
  locked: "neutral",
  open: "info",
  in_progress: "info",
  awaiting_approval: "attention",
  done: "ok",
  cancelled: "neutral",
};

export const LEDGER_STATUS_TONE: Record<LedgerStatus, ChipTone> = {
  planned: "neutral",
  active: "attention",
  return_requested: "attention",
  closed: "ok",
  waived: "neutral",
};

/** Estados de sincronização que merecem aviso ao lado da atividade. */
export const SYNC_NOTE: Partial<Record<SyncState, string>> = {
  local: "Ainda não enviada ao Bitrix24",
  queued: "Indo para o Bitrix24",
  error: "Falha ao enviar ao Bitrix24",
  uncertain: "Conferindo no Bitrix24",
};

/** Duração de uma trilha: "de 5 dias antes a 90 dias depois". */
export function spanText(span: TemplateSummaryDTO["span"]): string {
  const part = (days: number) => (days === 0 ? "o próprio dia" : days < 0 ? `${plural(-days, "dia", "dias")} antes` : `${plural(days, "dia", "dias")} depois`);
  return `de ${part(span.fromDays)} a ${part(span.toDays)}`;
}

export function kindTone(kind: JourneyKind): "arrival" | "departure" {
  return kind === "onboarding" ? "arrival" : "departure";
}

/** Prazo ou momento de uma atividade, em linguagem de gente: "Vence amanhã, 18:00", "Atrasada, venceu ontem". */
export function activityTiming(activity: ActivityDTO, today: string, timeZone?: string): string {
  if (activity.status === "done") return activity.doneAt ? `Feita ${relativeTo(activity.doneAt, today, timeZone)}` : "Feita";
  if (activity.status === "cancelled") return "Cancelada";
  if (activity.status === "locked") {
    if (!activity.releasesAt) return "Libera depois da etapa anterior";
    const when = relativeTo(activity.releasesAt, today, timeZone);
    return activity.releaseMode === "after_previous" ? `Libera depois da etapa anterior ou ${when}` : `Libera ${when}`;
  }
  const clock = wallClock(activity.dueAt, timeZone);
  if (!clock) return "";
  const diff = daysBetween(today, clock.date);
  const time = clock.time.replace(/^0(\d)/, "$1");
  if (activity.overdue || diff < 0) return diff >= 0 ? `Atrasada desde ${time}` : `Atrasada, venceu ${relativeDays(diff)}`;
  if (diff === 0) return `Vence hoje, ${time}`;
  if (diff === 1) return `Vence amanhã, ${time}`;
  return `Vence ${relativeDays(diff)}`;
}
