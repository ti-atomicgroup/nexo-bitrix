import "server-only";
/**
 * Interface pública do domínio (funções puras). CONTRATO congelado pelo lead:
 * E1 implementa em módulos próprios (dates.ts, release.ts, completion.ts, risk.ts, …) e reexporta aqui
 * mantendo exatamente estas assinaturas. E3 (leitura/DTOs) importa só deste arquivo.
 */
import type { CompletionCheckDTO, JourneyRisk, TemplateStageDTO } from "@/shared/contracts";
import type { OffsetUnit } from "@/shared/enums";
import type { ActivityRow } from "../db/repos/activities";
import type { JourneyRow } from "../db/repos/journeys";
import type { LedgerRow } from "../db/repos/ledger";
import * as completion from "./completion";
import * as dates from "./dates";
import * as release from "./release";
import * as risk from "./risk";

export type { StageState } from "./release";
import type { StageState } from "./release";

/** Data de hoje (AAAA-MM-DD) no fuso informado. */
export function todayIn(timezone: string, now: Date = new Date()): string {
  return dates.todayIn(timezone, now);
}

/** Dias de calendário entre hoje (no fuso) e a data; negativo se já passou. */
export function daysUntil(date: string, timezone: string, now: Date = new Date()): number {
  return dates.daysUntil(date, timezone, now);
}

/** Prazo de uma atividade: data-âncora + deslocamento (dias corridos ou úteis) no horário local, ISO com fuso (ex.: 2026-10-27T18:00:00-03:00). */
export function dueAt(anchorDate: string, offsetDays: number, unit: OffsetUnit, time: string, timezone: string): string {
  return dates.dueAt(anchorDate, offsetDays, unit, time, timezone);
}

/** Quando a etapa libera pelo calendário (08:00 local): etapa por data ou data-limite de "depois da anterior"; senão nulo. */
export function stageReleaseAt(stage: TemplateStageDTO, anchorDate: string, timezone: string): string | null {
  return release.stageReleaseAt(stage, anchorDate, timezone);
}

/** Etapas "depois da anterior" seguradas por obrigatórias que faltam na etapa anterior (para o painel Hoje). */
export function blockedStages(journey: JourneyRow, activities: ActivityRow[]): Array<{ stage: TemplateStageDTO; blockers: ActivityRow[] }> {
  return release.blockedStages(journey, activities);
}

/** Estado das estações da linha a partir do snapshot da trilha e das atividades da jornada. */
export function stagesState(journey: JourneyRow, activities: ActivityRow[], timezone: string): StageState[] {
  return release.stagesState(journey, activities, timezone);
}

export function journeyProgress(activities: ActivityRow[]): { done: number; total: number; percent: number } {
  return completion.journeyProgress(activities);
}

/** Próxima parada da linha: a atividade aberta mais próxima ou a próxima etapa a liberar. */
export function nextStop(journey: JourneyRow, activities: ActivityRow[], timezone: string, now: Date = new Date()): { label: string; at: string } | null {
  return risk.nextStop(journey, activities, timezone, now);
}

export function isOverdue(activity: ActivityRow, now: Date = new Date()): boolean {
  return risk.isOverdue(activity, now);
}

/** critical: obrigatória atrasada; attention: vence em até 48 h ou erro de sincronização; ok no resto. */
export function journeyRisk(activities: ActivityRow[], now: Date = new Date()): JourneyRisk {
  return risk.journeyRisk(activities, now);
}

/** Motivo do selo de risco em uma frase; nulo quando está em dia. */
export function journeyRiskReason(activities: ActivityRow[], now: Date = new Date()): string | null {
  return risk.journeyRiskDetail(activities, now).reason;
}

/** O que impede concluir a jornada: obrigatórias pendentes, aprovações e inventário ainda com a pessoa (saída). */
export function completionCheck(journey: JourneyRow, activities: ActivityRow[], activeLedger: LedgerRow[]): CompletionCheckDTO {
  return completion.completionCheck(journey, activities, activeLedger);
}
