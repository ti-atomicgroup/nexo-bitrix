import "server-only";
/**
 * Interface pública do domínio (funções puras). CONTRATO congelado pelo lead:
 * E1 implementa em módulos próprios (deadlines.ts, release.ts, completion.ts, risk.ts, …) e reexporta aqui
 * mantendo exatamente estas assinaturas. E3 (leitura/DTOs) importa só deste arquivo.
 */
import type { CompletionCheckDTO, JourneyRisk, TemplateStageDTO } from "@/shared/contracts";
import type { OffsetUnit, ReleaseMode } from "@/shared/enums";
import type { ActivityRow } from "../db/repos/activities";
import type { JourneyRow } from "../db/repos/journeys";
import type { LedgerRow } from "../db/repos/ledger";

export interface StageState {
  position: number;
  name: string;
  state: "done" | "current" | "upcoming";
  releaseMode: ReleaseMode;
  /** Previsão de liberação (etapas por data). Nulo quando já liberada ou quando depende da etapa anterior. */
  releasesAt: string | null;
}

const pending = (name: string): never => {
  throw new Error(`domain.${name} ainda não implementado (E1).`);
};

/** Data de hoje (AAAA-MM-DD) no fuso informado. */
export function todayIn(timezone: string, now: Date = new Date()): string {
  void timezone;
  void now;
  return pending("todayIn");
}

/** Dias de calendário entre hoje (no fuso) e a data; negativo se já passou. */
export function daysUntil(date: string, timezone: string, now: Date = new Date()): number {
  void date;
  void timezone;
  void now;
  return pending("daysUntil");
}

/** Prazo de uma atividade: data-âncora + deslocamento (dias corridos ou úteis) no horário local, ISO com fuso (ex.: 2026-10-27T18:00:00-03:00). */
export function dueAt(anchorDate: string, offsetDays: number, unit: OffsetUnit, time: string, timezone: string): string {
  void anchorDate;
  void offsetDays;
  void unit;
  void time;
  void timezone;
  return pending("dueAt");
}

/** Quando uma etapa por data é liberada (08:00 local do dia calculado). Nulo para "start" e "after_previous". */
export function stageReleaseAt(stage: TemplateStageDTO, anchorDate: string, timezone: string): string | null {
  void stage;
  void anchorDate;
  void timezone;
  return pending("stageReleaseAt");
}

/** Estado das estações da linha a partir do snapshot da trilha e das atividades da jornada. */
export function stagesState(journey: JourneyRow, activities: ActivityRow[], timezone: string): StageState[] {
  void journey;
  void activities;
  void timezone;
  return pending("stagesState");
}

export function journeyProgress(activities: ActivityRow[]): { done: number; total: number; percent: number } {
  void activities;
  return pending("journeyProgress");
}

/** Próxima parada da linha: a atividade aberta mais próxima ou a próxima etapa a liberar. */
export function nextStop(journey: JourneyRow, activities: ActivityRow[], timezone: string, now: Date = new Date()): { label: string; at: string } | null {
  void journey;
  void activities;
  void timezone;
  void now;
  return pending("nextStop");
}

export function isOverdue(activity: ActivityRow, now: Date = new Date()): boolean {
  void activity;
  void now;
  return pending("isOverdue");
}

/** critical: obrigatória atrasada; attention: vence em até 48 h ou erro de sincronização; ok no resto. */
export function journeyRisk(activities: ActivityRow[], now: Date = new Date()): JourneyRisk {
  void activities;
  void now;
  return pending("journeyRisk");
}

/** O que impede concluir a jornada: obrigatórias pendentes, aprovações e inventário ainda com a pessoa (saída). */
export function completionCheck(journey: JourneyRow, activities: ActivityRow[], activeLedger: LedgerRow[]): CompletionCheckDTO {
  void journey;
  void activities;
  void activeLedger;
  return pending("completionCheck");
}
