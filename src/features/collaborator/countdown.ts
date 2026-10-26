import type { JourneyKind } from "@/shared/enums";

/** Texto grande do canhoto do cartão: "7 dias / para o seu primeiro dia", "Hoje / é o seu último dia". */
export function countdownFor(kind: JourneyKind, daysUntil: number): { value: string; caption: string } {
  if (kind === "onboarding") {
    if (daysUntil > 1) return { value: `${daysUntil} dias`, caption: "para o seu primeiro dia" };
    if (daysUntil === 1) return { value: "Amanhã", caption: "é o seu primeiro dia" };
    if (daysUntil === 0) return { value: "Hoje", caption: "é o seu primeiro dia" };
    return { value: `${1 - daysUntil}º dia`, caption: "da sua jornada" };
  }
  if (daysUntil > 1) return { value: `${daysUntil} dias`, caption: "até o seu último dia" };
  if (daysUntil === 1) return { value: "Amanhã", caption: "é o seu último dia" };
  if (daysUntil === 0) return { value: "Hoje", caption: "é o seu último dia" };
  return { value: "Obrigado", caption: "por fazer parte" };
}
