import type { Journey, JourneyTask } from "@/shared/contracts";

export type RhAgendaItem = {
  journey: Journey;
  task: JourneyTask;
  overdue: boolean;
};

export function priorityForRhItem(item: RhAgendaItem) {
  if (item.overdue && item.task.critical) {
    return { rank: 0 as const, reason: "Atividade crítica vencida" };
  }
  if (item.overdue) return { rank: 1 as const, reason: "Prazo vencido" };
  if (item.task.critical) {
    return { rank: 2 as const, reason: "Atividade crítica prevista para hoje" };
  }
  return { rank: 3 as const, reason: "Prazo de hoje" };
}

export function sortRhAgendaItems<T extends RhAgendaItem>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const priority = priorityForRhItem(a).rank - priorityForRhItem(b).rank;
    return priority || Date.parse(a.task.dueAt) - Date.parse(b.task.dueAt);
  });
}
