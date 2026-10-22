import type { Journey, JourneyTask, TaskStatus } from "../shared/contracts";
import { AppError } from "./errors";
export function realDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}
export function deadlineAt(date: string, offset: number, timezone: string, unit: "calendar_days" | "business_days" = "calendar_days"): string {
  if (!realDate(date)) throw new AppError("DATE_INVALID", "Data de referência inválida.");
  const calendar = new Date(`${date}T18:00:00Z`);
  if (unit === "business_days") {
    const direction = Math.sign(offset);
    let remaining = Math.abs(offset);
    while (remaining > 0) {
      calendar.setUTCDate(calendar.getUTCDate() + direction);
      if (calendar.getUTCDay() !== 0 && calendar.getUTCDay() !== 6) remaining--;
    }
  } else {
    calendar.setUTCDate(calendar.getUTCDate() + offset);
  }
  const target = calendar.getTime();
  let instant = target;
  const format = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
  for (let n = 0; n < 3; n++) {
    const parts = Object.fromEntries(format.formatToParts(new Date(instant)).map(p => [p.type, p.value]));
    const local = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
    const difference = target - local;
    instant += difference;
    if (difference === 0) break;
  }
  return new Date(instant).toISOString();
}
export function taskStatus(status: number | string): TaskStatus {
  switch (String(status)) { case "3": return "in_progress"; case "4": return "awaiting_review"; case "5": return "completed"; case "6": return "deferred"; default: return "pending"; }
}
export function taskDone(task: JourneyTask): boolean {
  return task.status === "completed" && task.syncState === "synced" && task.bitrixTaskId !== null && task.checklist.every(item => !item.required || item.completed);
}
export function canCompleteJourney(journey: Journey): boolean {
  return journey.tasks.length > 0 && journey.tasks.every(task => (!task.required && !task.critical && !task.checklist.some(item => item.required)) || taskDone(task));
}
export function summarizeJourney(journey: Journey, now = new Date()): Journey {
  const completedCount = journey.tasks.filter(taskDone).length;
  const uncertain = journey.tasks.some(task => task.syncState !== "synced");
  const overdue = journey.tasks.filter(task => !taskDone(task) && Date.parse(task.dueAt) < now.getTime());
  const radar = uncertain ? "unknown" : overdue.some(task => task.critical) ? "critical" : overdue.length ? "attention" : "ok";
  return { ...journey, completedCount, taskCount: journey.tasks.length, progress: journey.tasks.length ? Math.round(completedCount * 100 / journey.tasks.length) : 0, radar };
}
