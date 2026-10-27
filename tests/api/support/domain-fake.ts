import type * as Domain from "@/server/domain";
import type { ActivityRow } from "@/server/db/repos/activities";

/**
 * Versão simples e previsível do contrato do domínio (`@/server/domain`) para testar os modelos de leitura
 * sem depender da implementação do E1. Uso:
 * `vi.mock("@/server/domain", async () => (await import("../../api/support/domain-fake")).domainFake());`
 */
function localDate(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function dayDiff(from: string, to: string): number {
  const utc = (value: string) => {
    const [year = 0, month = 1, day = 1] = value.split("-").map(Number);
    return Date.UTC(year, month - 1, day);
  };
  return Math.round((utc(to) - utc(from)) / 86_400_000);
}

const finished = (activity: ActivityRow) => activity.status === "done" || activity.status === "cancelled";

export const FAKE_RELEASES_AT = "2026-11-02T08:00:00-03:00";

export function domainFake(): typeof Domain {
  const todayIn: typeof Domain.todayIn = (timezone, now = new Date()) => localDate(now, timezone);
  const isOverdue: typeof Domain.isOverdue = (activity, now = new Date()) => !finished(activity) && Date.parse(activity.dueAt) < now.getTime();
  return {
    todayIn,
    daysUntil: (date, timezone, now = new Date()) => dayDiff(todayIn(timezone, now), date),
    dueAt: (anchorDate, _offset, _unit, time) => `${anchorDate}T${time}:00-03:00`,
    stageReleaseAt: () => null,
    blockedStages: () => [],
    stagesState: (journey, activities) =>
      journey.snapshot.stages.map((stage) => {
        const items = activities.filter((activity) => activity.stagePosition === stage.position);
        const released = items.some((activity) => activity.status !== "locked");
        const done = items.length > 0 && items.every(finished);
        return {
          position: stage.position,
          name: stage.name,
          state: done ? "done" : released ? "current" : "upcoming",
          releaseMode: stage.releaseMode,
          releasesAt: released ? null : FAKE_RELEASES_AT,
        };
      }),
    journeyProgress: (activities) => {
      const counted = activities.filter((activity) => activity.status !== "cancelled");
      const done = counted.filter((activity) => activity.status === "done").length;
      return { done, total: counted.length, percent: counted.length ? Math.round((done / counted.length) * 100) : 0 };
    },
    nextStop: () => null,
    isOverdue,
    journeyRisk: (activities, now = new Date()) => (activities.some((activity) => activity.required && isOverdue(activity, now)) ? "critical" : "ok"),
    completionCheck: (_journey, activities, ledger) => {
      const blockers = [
        ...activities.filter((activity) => activity.required && !finished(activity)).map((activity) => `Concluir "${activity.title}"`),
        ...ledger.map((item) => `Recolher "${item.name}"`),
      ];
      return { ok: blockers.length === 0, blockers };
    },
  };
}
