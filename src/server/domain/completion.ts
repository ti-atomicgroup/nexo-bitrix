import "server-only";
import type { CompletionCheckDTO } from "@/shared/contracts";
import type { ActivityRow } from "../db/repos/activities";
import type { JourneyRow } from "../db/repos/journeys";
import type { LedgerRow } from "../db/repos/ledger";

export function journeyProgress(activities: ActivityRow[]): { done: number; total: number; percent: number } {
  const counted = activities.filter((activity) => activity.status !== "cancelled");
  const done = counted.filter((activity) => activity.status === "done").length;
  return { done, total: counted.length, percent: counted.length ? Math.round((done * 100) / counted.length) : 0 };
}

/** "A", "A e B", "A, B e C", "A, B, C e mais 2". */
export function listTitles(titles: string[], max = 3): string {
  if (titles.length <= max) return titles.length > 1 ? `${titles.slice(0, -1).join(", ")} e ${titles.at(-1)}` : (titles[0] ?? "");
  return `${titles.slice(0, max).join(", ")} e mais ${titles.length - max}`;
}

const pendingLedger = (ledger: LedgerRow[]) => ledger.filter((item) => item.status === "active" || item.status === "return_requested");

/** Só obrigatórias, aprovações de obrigatórias e (na saída) o inventário com a pessoa impedem a conclusão; o checklist não. */
export function completionCheck(journey: JourneyRow, activities: ActivityRow[], activeLedger: LedgerRow[]): CompletionCheckDTO {
  if (journey.status === "completed") return { ok: false, blockers: ["A jornada já está concluída."] };
  if (journey.status === "cancelled") return { ok: false, blockers: ["A jornada foi cancelada."] };
  const blockers: string[] = [];
  const required = activities.filter((activity) => activity.required && activity.status !== "cancelled" && activity.status !== "done");
  const pending = required.filter((activity) => activity.status !== "awaiting_approval");
  const awaiting = required.filter((activity) => activity.status === "awaiting_approval");
  if (pending.length) blockers.push(`Conclua as atividades obrigatórias: ${listTitles(pending.map((activity) => activity.title))}.`);
  if (awaiting.length === 1) blockers.push(`Aprove “${awaiting[0]?.title}”, que aguarda aprovação no Bitrix24.`);
  if (awaiting.length > 1) blockers.push(`Aprove as atividades que aguardam aprovação no Bitrix24: ${listTitles(awaiting.map((activity) => activity.title))}.`);
  if (journey.kind === "offboarding") {
    const count = pendingLedger(activeLedger).length;
    if (count === 1) blockers.push("1 item do inventário ainda com a pessoa.");
    if (count > 1) blockers.push(`${count} itens do inventário ainda com a pessoa.`);
  }
  return { ok: blockers.length === 0, blockers };
}
