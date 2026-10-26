import "server-only";
import { isBitrixError } from "../bitrix/errors";
import {
  addChecklistItems,
  addChecklistRoot,
  addTaskComment,
  changeTaskStatus,
  createTask,
  getChecklists,
  getTask,
  listTasksByIds,
  listTasksCreatedSince,
  setChecklistItemDone,
  type BitrixChecklistItem,
  type TaskAction,
} from "../bitrix/methods";
import { getActivity, updateActivity, type ActivityRow } from "../db/repos/activities";
import { audit } from "../db/repos/audit";
import { getJourney, type JourneyRow } from "../db/repos/journeys";
import { beginOperation, confirmOperation, getOperation, markOperationFailed, markOperationUncertain } from "../db/repos/operations";
import { findPerson } from "../db/repos/people";
import { AppError } from "../errors";
import type { ActivityStatus } from "@/shared/enums";
import { addCalendarDays, todayIn } from "../domain/dates";
import { REVOKE_ROOT_TITLE } from "../domain/ledger";
import { taskDescription, taskTitle } from "../domain/task-text";
import { RetryLater } from "./job-errors";
import { enqueueActivityJob, JOB_KINDS } from "./queue";
import type { EngineContext } from "./runtime";

export const CHECKLIST_ROOT_TITLE = "Checklist";
export const MISSING_TASK_MESSAGE = "A tarefa foi apagada ou movida no Bitrix.";
export const UNCERTAIN_TASK_MESSAGE =
  "Não deu para confirmar se a tarefa foi criada no Bitrix24. Confira o projeto do Nexo; o Nexo não vai reenviar sozinho para não duplicar.";
/** Depois de uma resposta incerta, espera ~2 min e confere pelo XML_ID antes de reenviar. */
export const RESEND_AFTER_MS = 2 * 60_000;
/** Envios de criação (o primeiro + reenvios) antes de deixar a atividade como incerta. */
export const MAX_CREATE_SENDS = 3;
const RECONCILE_LOOKBACK_MS = 5 * 60_000;
const PUSH_ROUNDS = 3;

const xmlIdFor = (activityId: string) => `nexo:${activityId}`;

/* ───────────── criação idempotente ───────────── */

/** Tarefa criada numa tentativa incerta: procura no projeto pelo XML_ID (ou pelo título, se o portal não devolver XML_ID). */
async function findCreatedTask(ctx: EngineContext, groupId: string, xmlId: string, title: string, startedAt: string): Promise<string | null> {
  const since = addCalendarDays(todayIn("UTC", new Date(Date.parse(startedAt) - RECONCILE_LOOKBACK_MS)), -1);
  const tasks = await listTasksCreatedSince(ctx.client, groupId, since);
  const byId = (a: { id: string }, b: { id: string }) => Number(a.id) - Number(b.id);
  const byXml = tasks.filter((task) => task.xmlId === xmlId).sort(byId);
  if (byXml[0]) return byXml[0].id;
  if (tasks.some((task) => task.xmlId !== null)) return null;
  return tasks.filter((task) => task.title === title).sort(byId)[0]?.id ?? null;
}

function auditorsFor(journey: JourneyRow, activity: ActivityRow): string[] {
  const ids = [journey.participants.rh?.bitrixUserId];
  // Visibilidade "hr": o gestor não acompanha.
  if (activity.visibility !== "hr") ids.push(journey.participants.gestor?.bitrixUserId);
  return [...new Set(ids.filter((id): id is string => Boolean(id) && id !== activity.assigneeBitrixId))];
}

async function ensureTaskCreated(activity: ActivityRow, journey: JourneyRow, ctx: EngineContext, force: boolean): Promise<string | null> {
  const project = ctx.project;
  if (!project) throw new AppError("PROJECT_MISSING", "Prepare o Nexo (projeto no Bitrix24) antes de criar tarefas.", 409);
  const key = `task:create:${activity.id}`;
  const person = findPerson(journey.personId);
  const title = taskTitle(person?.name ?? "Colaborador", journey.kind, activity.title);
  const previous = getOperation(key);
  if (previous?.status === "confirmed" && previous.resultId) return previous.resultId;
  if (previous && (previous.status === "uncertain" || previous.status === "sending")) {
    const found = await findCreatedTask(ctx, project.id, xmlIdFor(activity.id), title, previous.startedAt);
    if (found) {
      confirmOperation(key, found);
      return found;
    }
    const resendAt = Date.parse(previous.updatedAt) + RESEND_AFTER_MS;
    if (Date.now() < resendAt) throw new RetryLater(resendAt, "Aguardando o Bitrix24 confirmar a criação da tarefa.");
    if (previous.attempts >= MAX_CREATE_SENDS && !force) {
      markOperationUncertain(key);
      updateActivity(activity.id, { syncState: "uncertain", syncError: UNCERTAIN_TASK_MESSAGE });
      return null;
    }
  }
  const stage = journey.snapshot.stages.find((candidate) => candidate.position === activity.stagePosition);
  beginOperation(key);
  try {
    const id = await createTask(ctx.client, {
      title,
      description: taskDescription({
        personName: person?.name ?? "Colaborador",
        kind: journey.kind,
        anchorDate: journey.anchorDate,
        stageName: stage?.name ?? "",
        instructions: activity.instructions,
        links: activity.links,
      }),
      responsibleId: activity.assigneeBitrixId ?? "",
      auditors: auditorsFor(journey, activity),
      deadline: activity.dueAt,
      groupId: project.id,
      xmlId: xmlIdFor(activity.id),
      requiresApproval: activity.requiresApproval,
      crmBindings: journey.crmBinding ? [journey.crmBinding] : [],
    });
    confirmOperation(key, id);
    return id;
  } catch (error) {
    if (isBitrixError(error) && error.uncertain) {
      markOperationUncertain(key);
      updateActivity(activity.id, { syncState: "uncertain", syncError: null });
      throw new RetryLater(Date.now() + RESEND_AFTER_MS, "O Bitrix24 não confirmou a criação da tarefa; o Nexo vai conferir antes de reenviar.");
    }
    markOperationFailed(key);
    throw error;
  }
}

/* ───────────── checklist ───────────── */

function saveItemIds(activityId: string, ids: Record<string, string>): void {
  const fresh = getActivity(activityId);
  if (!fresh || !Object.keys(ids).length) return;
  updateActivity(activityId, {
    checklist: fresh.checklist.map((item) => (ids[item.key] && !item.bitrixItemId ? { ...item, bitrixItemId: ids[item.key] ?? null } : item)),
    checklistSyncedAt: new Date().toISOString(),
  });
}

/**
 * Garante o checklist da tarefa: raiz ("Checklist" ou "Revogar e recolher") + filhos sem ID.
 * Numa nova tentativa, lê o que já existe no Bitrix e só cria o que falta (sem duplicar).
 */
export async function ensureChecklist(activity: ActivityRow, ctx: EngineContext): Promise<void> {
  const taskId = activity.bitrixTaskId;
  const pending = activity.checklist.filter((item) => !item.bitrixItemId);
  if (!taskId || !pending.length) return;
  const rootTitle = activity.ledgerRole === "revoke_and_collect" ? REVOKE_ROOT_TITLE : CHECKLIST_ROOT_TITLE;
  const key = `checklist:add:${activity.id}`;
  let existing: BitrixChecklistItem[] = [];
  let rootId: string | null = null;
  if (getOperation(key)) {
    existing = (await getChecklists(ctx.client, [taskId]))[taskId] ?? [];
    rootId = existing.find((item) => item.parentId === "0" && item.title === rootTitle)?.id ?? null;
  }
  beginOperation(key);
  try {
    if (!rootId) rootId = await addChecklistRoot(ctx.client, taskId, rootTitle);
    const ids: Record<string, string> = {};
    const claimed = new Set<string>();
    for (const item of pending) {
      const match = existing.find((entry) => entry.parentId === rootId && entry.title === item.text && !claimed.has(entry.id));
      if (match) {
        ids[item.key] = match.id;
        claimed.add(match.id);
      }
    }
    const toAdd = pending.filter((item) => !ids[item.key]).map((item) => ({ key: item.key, text: item.text, done: item.done }));
    const { itemIds, errors } = await addChecklistItems(ctx.client, taskId, rootId, toAdd);
    saveItemIds(activity.id, { ...ids, ...itemIds });
    if (errors.length) throw errors.find((error) => error.rateLimited) ?? errors[0];
    confirmOperation(key, rootId);
  } catch (error) {
    markOperationUncertain(key);
    throw error;
  }
}

/* ───────────── handlers ───────────── */

/** task.create: cria a tarefa (idempotente por `task:create:<atividade>`) e o checklist. */
export async function handleTaskCreate(payload: Record<string, unknown>, ctx: EngineContext): Promise<void> {
  const activityId = String(payload.activityId ?? "");
  const activity = getActivity(activityId);
  if (!activity || activity.bitrixMissing || !activity.assigneeBitrixId) return;
  const journey = getJourney(activity.journeyId);
  if (!journey) return;
  if (journey.status !== "active") {
    // Pausada: a etapa de envio reenfileira quando a jornada voltar. Encerrada: não há mais o que criar.
    if (journey.status !== "paused" && !activity.bitrixTaskId && activity.syncState === "queued") updateActivity(activityId, { syncState: "local" });
    return;
  }
  if (!activity.bitrixTaskId && (activity.status === "locked" || activity.status === "cancelled" || activity.status === "done")) {
    if (activity.syncState === "queued") updateActivity(activityId, { syncState: "local" });
    return;
  }
  let current = activity;
  if (!current.bitrixTaskId) {
    const taskId = await ensureTaskCreated(current, journey, ctx, payload.force === true);
    if (!taskId) return;
    current = updateActivity(activityId, { bitrixTaskId: taskId, bitrixStatus: 2, syncError: null }) ?? current;
    audit({
      actorType: "system",
      action: "Tarefa criada no Bitrix24",
      entity: "journey",
      entityId: journey.id,
      detail: { text: `“${activity.title}” virou tarefa no Bitrix24.`, activityId, taskId },
    });
  }
  await ensureChecklist(current, ctx);
  const fresh = getActivity(activityId);
  if (!fresh) return;
  // Algo mudou no Nexo enquanto a tarefa nascia (concluída, item marcado): leva para o Bitrix.
  if (fresh.status === "done" || fresh.checklist.some((item) => item.done)) {
    updateActivity(activityId, { syncState: "queued", syncError: null });
    enqueueActivityJob(JOB_KINDS.activityPush, activityId);
  } else {
    updateActivity(activityId, { syncState: "synced", syncError: null });
  }
}

function decideAction(desired: ActivityStatus, remote: number): TaskAction | null {
  if (desired === "done") return remote === 5 ? null : remote === 4 ? "approve" : "complete";
  if (desired === "open" || desired === "in_progress") return remote === 5 ? "renew" : remote === 4 ? "disapprove" : null;
  return null;
}

const STATUS_AFTER: Record<TaskAction, number> = { complete: 5, approve: 5, renew: 2, disapprove: 2 };
const checklistSignature = (activity: ActivityRow) => `${activity.status}|${activity.checklist.map((item) => `${item.key}:${item.done ? 1 : 0}`).join(",")}`;

/** Confirma que a tarefa sumiu (um 2º método, para não confiar só no filtro por IDs). */
export async function confirmTaskMissing(ctx: EngineContext, taskId: string): Promise<boolean> {
  try {
    return (await getTask(ctx.client, taskId)) === null;
  } catch (error) {
    if (isBitrixError(error) && !error.retryable) return true;
    throw error;
  }
}

export function markTaskMissing(activity: ActivityRow): void {
  updateActivity(activity.id, { bitrixMissing: true, syncState: "error", syncError: MISSING_TASK_MESSAGE });
  audit({
    actorType: "system",
    action: "Tarefa sumiu do Bitrix24",
    entity: "journey",
    entityId: activity.journeyId,
    detail: { text: `A tarefa de “${activity.title}” foi apagada ou movida no Bitrix. O Nexo não vai recriá-la sozinho.`, activityId: activity.id },
  });
}

/**
 * activity.push: leva o estado local (situação e checklist) para a tarefa. Lê o estado atual do Bitrix antes de agir,
 * então repetir é seguro; se a atividade mudar durante o envio, faz mais uma passada.
 */
export async function handleActivityPush(payload: Record<string, unknown>, ctx: EngineContext): Promise<void> {
  const activityId = String(payload.activityId ?? "");
  for (let round = 0; round < PUSH_ROUNDS; round++) {
    const activity = getActivity(activityId);
    if (!activity?.bitrixTaskId || activity.bitrixMissing) return;
    const taskId = activity.bitrixTaskId;
    const signature = checklistSignature(activity);
    const [task] = await listTasksByIds(ctx.client, [taskId]);
    if (!task) {
      if (await confirmTaskMissing(ctx, taskId)) markTaskMissing(activity);
      return;
    }
    const remote = task.status ?? 0;
    const action = decideAction(activity.status, remote);
    if (action) await changeTaskStatus(ctx.client, taskId, action);
    await ensureChecklist(activity, ctx);
    const withIds = getActivity(activityId) ?? activity;
    if (withIds.checklist.some((item) => item.bitrixItemId)) {
      const remoteItems = new Map(((await getChecklists(ctx.client, [taskId]))[taskId] ?? []).map((item) => [item.id, item]));
      for (const item of withIds.checklist) {
        const current = item.bitrixItemId ? remoteItems.get(item.bitrixItemId) : undefined;
        if (current && current.done !== item.done) await setChecklistItemDone(ctx.client, taskId, current.id, item.done);
      }
    }
    const after = getActivity(activityId);
    if (!after || checklistSignature(after) === signature) {
      updateActivity(activityId, { syncState: "synced", syncError: null, bitrixStatus: action ? STATUS_AFTER[action] : remote, checklistSyncedAt: new Date().toISOString() });
      return;
    }
  }
}

/** task.comment: "Cobrar". Comentário não tem como ser reconciliado: em caso de dúvida, não repete. */
export async function handleTaskComment(payload: Record<string, unknown>, ctx: EngineContext): Promise<void> {
  const activity = getActivity(String(payload.activityId ?? ""));
  const message = String(payload.message ?? "");
  if (!activity?.bitrixTaskId || activity.bitrixMissing || !message) return;
  try {
    await addTaskComment(ctx.client, activity.bitrixTaskId, message);
  } catch (error) {
    if (isBitrixError(error) && error.uncertain) return;
    throw error;
  }
}
