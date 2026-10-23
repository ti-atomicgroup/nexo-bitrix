import { describe, expect, it } from "vitest";
import type { Journey, JourneyTask } from "../../src/shared/contracts";
import { priorityForRhItem, sortRhAgendaItems } from "../../src/lib/rh-priority";

function item(id: string, critical: boolean, overdue: boolean) {
  const task = {
    id,
    critical,
    dueAt: overdue ? "2026-10-22T12:00:00.000Z" : "2026-10-23T12:00:00.000Z",
  } as JourneyTask;
  return {
    journey: { id: `journey-${id}` } as Journey,
    task,
    overdue,
  };
}

describe("prioridade da fila diária de RH", () => {
  it("coloca atividades críticas vencidas primeiro e explica cada faixa", () => {
    const criticalOverdue = item("critical-overdue", true, true);
    const overdue = item("overdue", false, true);
    const criticalToday = item("critical-today", true, false);
    const today = item("today", false, false);

    expect(
      sortRhAgendaItems([today, criticalToday, overdue, criticalOverdue]).map(
        (entry) => entry.task.id,
      ),
    ).toEqual([
      "critical-overdue",
      "overdue",
      "critical-today",
      "today",
    ]);
    expect([
      criticalOverdue,
      overdue,
      criticalToday,
      today,
    ].map(priorityForRhItem)).toEqual([
      { rank: 0, reason: "Atividade crítica vencida" },
      { rank: 1, reason: "Prazo vencido" },
      { rank: 2, reason: "Atividade crítica prevista para hoje" },
      { rank: 3, reason: "Prazo de hoje" },
    ]);
  });
});
