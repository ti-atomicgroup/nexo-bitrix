import "server-only";
import { getChecklists, listTasksByIds, type BitrixChecklistItem, type BitrixTaskInfo } from "../bitrix/methods";
import { getActivity, listOpenTaskActivities, updateActivity, type ActivityRow } from "../db/repos/activities";
import { audit } from "../db/repos/audit";
import { getJourney } from "../db/repos/journeys";
import { findPersonByBitrixId } from "../db/repos/people";
import { getSyncState, patchSyncState } from "../db/repos/settings";
import type { ActivityStatus } from "@/shared/enums";
import { formatInZone } from "../domain/dates";
import { applyLedgerEffects } from "./ledger-effects";
import type { EngineContext } from "./runtime";
import { confirmTaskMissing, markTaskMissing } from "./tasks";

/** Checklists das tarefas abertas são relidos a cada ~4 min (e sempre que uma tarefa fecha). */
export const CHECKLIST_POLL_MS = 4 * 60_000;
const CHECKLIST_BATCH = 50;

/** "Concluída" = status do Bitrix: 5 feita, 4 aguardando aprovação, 3 em andamento; 2/6/7 a fazer. */
export function mapBitrixStatus(status: number | null): ActivityStatus | null {
  if (status === null) return null;
  if (status === 5) return "done";
  if (status === 4) return "awaiting_approval";
  if (status === 3) return "in_progress";
  return "open";
}

function normalizeInstant(value: string | null, timezone: string): string | null {
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : formatInZone(time, timezone);
}

/** Aplica o que o Bitrix diz da tarefa. Devolve true quando a atividade acabou de ser concluída lá. */
function applyRemoteTask(activity: ActivityRow, task: BitrixTaskInfo, timezone: string): boolean {
  const patch: Parameters<typeof updateActivity>[1] = {};
  if (task.status !== null && task.status !== activity.bitrixStatus) patch.bitrixStatus = task.status;
  const mapped = mapBitrixStatus(task.status);
  let closed = false;
  if (mapped && mapped !== activity.status) {
    patch.status = mapped;
    if (mapped === "done") {
      patch.doneAt = normalizeInstant(task.closedDate, timezone) ?? new Date().toISOString();
      patch.doneSource = "bitrix";
      closed = true;
    }
  }
  const deadline = task.deadline ? Date.parse(task.deadline) : Number.NaN;
  if (!Number.isNaN(deadline) && deadline !== Date.parse(activity.dueAt)) patch.dueAt = formatInZone(deadline, timezone);
  if (task.responsibleId && task.responsibleId !== activity.assigneeBitrixId) {
    patch.assigneeBitrixId = task.responsibleId;
    patch.assigneeName = findPersonByBitrixId(task.responsibleId)?.name ?? `Usuário ${task.responsibleId}`;
  }
  if (Object.keys(patch).length) updateActivity(activity.id, patch);
  if (closed) {
    audit({
      actorType: "system",
      action: "Atividade concluída no Bitrix24",
      entity: "journey",
      entityId: activity.journeyId,
      detail: { text: `“${activity.title}” foi concluída no Bitrix24.`, activityId: activity.id },
    });
  }
  return closed;
}

/**
 * Consulta as tarefas abertas por lista de IDs (50 por chamada). Tarefa ausente é conferida uma segunda vez e então
 * sinalizada (nunca recriada). Atividades com envio pendente (`queued`) ficam de fora para o Nexo não desfazer a ação local.
 */
export async function pollOpenTasks(ctx: EngineContext): Promise<number> {
  const activities = listOpenTaskActivities().filter((activity) => activity.syncState !== "queued");
  if (!activities.length) return 0;
  const tasks = await listTasksByIds(
    ctx.client,
    activities.map((activity) => activity.bitrixTaskId ?? ""),
  );
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const closed: ActivityRow[] = [];
  const absent: ActivityRow[] = [];
  for (const listed of activities) {
    // Relê: uma ação do RH pode ter mudado a atividade durante a consulta.
    const activity = getActivity(listed.id);
    if (!activity?.bitrixTaskId || activity.syncState === "queued" || activity.bitrixMissing || activity.status === "done" || activity.status === "cancelled") continue;
    const task = byId.get(activity.bitrixTaskId);
    if (!task) absent.push(activity);
    else if (applyRemoteTask(activity, task, ctx.timezone)) closed.push(activity);
  }
  for (const activity of absent) {
    if (ctx.rateLimited) break;
    if (await confirmTaskMissing(ctx, activity.bitrixTaskId ?? "")) markTaskMissing(activity);
  }
  if (closed.length) await refreshChecklists(ctx, closed);
  return closed.length;
}

/** Copia as marcações do Bitrix para o checklist local e reflete no inventário. */
function applyRemoteChecklist(activity: ActivityRow, remote: BitrixChecklistItem[]): void {
  const byId = new Map(remote.map((item) => [item.id, item]));
  let changed = false;
  const checklist = activity.checklist.map((item) => {
    const current = item.bitrixItemId ? byId.get(item.bitrixItemId) : undefined;
    if (!current || current.done === item.done) return item;
    changed = true;
    return { ...item, done: current.done };
  });
  const updated = updateActivity(activity.id, changed ? { checklist, checklistSyncedAt: new Date().toISOString() } : { checklistSyncedAt: new Date().toISOString() });
  const journey = getJourney(activity.journeyId);
  // Ao fechar, aplica mesmo sem mudança: itens marcados antes da última leitura também contam.
  if (updated && journey && (changed || updated.status === "done")) applyLedgerEffects(journey, updated);
}

async function refreshChecklists(ctx: EngineContext, activities: ActivityRow[]): Promise<void> {
  const targets = activities.filter((activity) => activity.bitrixTaskId && activity.checklist.some((item) => item.bitrixItemId));
  for (let index = 0; index < targets.length; index += CHECKLIST_BATCH) {
    const chunk = targets.slice(index, index + CHECKLIST_BATCH);
    const checklists = await getChecklists(
      ctx.client,
      chunk.map((activity) => activity.bitrixTaskId ?? ""),
    );
    for (const listed of chunk) {
      const activity = getActivity(listed.id);
      const remote = activity?.bitrixTaskId ? checklists[activity.bitrixTaskId] : undefined;
      if (activity && remote && activity.syncState !== "queued") applyRemoteChecklist(activity, remote);
    }
  }
}

/** Relê os checklists das tarefas abertas a cada ~4 min (via batch). */
export async function pollChecklists(ctx: EngineContext, now: number = Date.now()): Promise<void> {
  const last = getSyncState().checklistsPolledAt;
  if (last && now - Date.parse(last) < CHECKLIST_POLL_MS) return;
  const activities = listOpenTaskActivities().filter((activity) => activity.syncState !== "queued");
  await refreshChecklists(ctx, activities);
  patchSyncState({ checklistsPolledAt: new Date(now).toISOString() });
}
