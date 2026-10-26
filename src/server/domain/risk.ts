import "server-only";
import type { JourneyRisk } from "@/shared/contracts";
import type { ActivityRow } from "../db/repos/activities";
import type { JourneyRow } from "../db/repos/journeys";
import { isStageReleased, sortedStages, stageActivities, stageReleaseAt } from "./release";

const ATTENTION_WINDOW_MS = 48 * 3_600_000;
const OPEN_STATUSES = new Set(["open", "in_progress", "awaiting_approval"]);

export function isOverdue(activity: ActivityRow, now: Date = new Date()): boolean {
  if (activity.status === "done" || activity.status === "cancelled") return false;
  const due = Date.parse(activity.dueAt);
  return !Number.isNaN(due) && due < now.getTime();
}

export function journeyRisk(activities: ActivityRow[], now: Date = new Date()): JourneyRisk {
  let attention = false;
  for (const activity of activities) {
    if (activity.status === "cancelled") continue;
    if (activity.syncState === "error" || activity.syncState === "uncertain") attention = true;
    if (activity.status === "done") continue;
    if (isOverdue(activity, now)) {
      if (activity.required) return "critical";
      attention = true;
      continue;
    }
    if (activity.bitrixMissing) attention = true;
    if (Date.parse(activity.dueAt) - now.getTime() <= ATTENTION_WINDOW_MS) attention = true;
  }
  return attention ? "attention" : "ok";
}

const byDue = (a: ActivityRow, b: ActivityRow) => Date.parse(a.dueAt) - Date.parse(b.dueAt);

export function nextStop(journey: JourneyRow, activities: ActivityRow[], timezone: string, now: Date = new Date()): { label: string; at: string } | null {
  void now;
  if (journey.status === "completed" || journey.status === "cancelled") return null;
  const open = activities.filter((activity) => OPEN_STATUSES.has(activity.status)).sort(byDue)[0];
  if (open) return { label: open.title, at: open.dueAt };
  const stages = sortedStages(journey).filter((stage) => {
    const items = stageActivities(activities, stage.position);
    return items.length > 0 && !isStageReleased(items);
  });
  const dated = stages
    .map((stage) => ({ stage, at: stageReleaseAt(stage, journey.anchorDate, timezone) }))
    .filter((entry): entry is { stage: (typeof stages)[number]; at: string } => entry.at !== null)
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))[0];
  if (dated) return { label: dated.stage.name, at: dated.at };
  // Etapa que depende da anterior: usa o primeiro prazo dela como previsão.
  const waiting = stages[0];
  const first = waiting ? stageActivities(activities, waiting.position).sort(byDue)[0] : undefined;
  return waiting && first ? { label: waiting.name, at: first.dueAt } : null;
}
