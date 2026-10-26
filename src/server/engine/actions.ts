import "server-only";
import type { ActivityActionInput, LedgerItemInput } from "@/shared/schemas";
import { getDb } from "../db";
import { getActivity, listActivities, updateActivity, type ActivityRow } from "../db/repos/activities";
import { audit } from "../db/repos/audit";
import { enqueueJob } from "../db/repos/jobs";
import { getJourney, listJourneys, type JourneyRow } from "../db/repos/journeys";
import { getLedgerItem, insertLedgerItem, updateLedgerItem, type LedgerRow } from "../db/repos/ledger";
import { findPerson } from "../db/repos/people";
import { getCompany } from "../db/repos/settings";
import { formatDateTimeBr } from "../domain/dates";
import { revokeChecklist } from "../domain/ledger";
import { AppError, notFound } from "../errors";
import { applyLedgerEffects } from "./ledger-effects";
import { enqueueActivityJob, JOB_KINDS } from "./queue";
import { enqueuePushes, releaseJourney } from "./release";
import { kick } from "./scheduler";
import type { Actor } from "./types";

/** "Cobrar" no máximo uma vez por hora por atividade. */
export const NUDGE_INTERVAL_MS = 3_600_000;

const closedJourney = () => new AppError("JOURNEY_CLOSED", "Esta jornada já foi encerrada.", 409);
const lockedActivity = () => new AppError("ACTIVITY_LOCKED", "Esta atividade ainda não foi liberada.", 409);
const cancelledActivity = () => new AppError("ACTIVITY_CANCELLED", "Esta atividade foi cancelada.", 409);

/** A tarefa existe no Bitrix e pode receber o estado local. */
const hasLiveTask = (activity: ActivityRow) => Boolean(activity.bitrixTaskId) && !activity.bitrixMissing;

function auditActivity(journey: JourneyRow, actor: Actor, action: string, text: string, activityId: string): void {
  audit({ actorType: actor.type, actorId: actor.id, actorName: actor.name, action, entity: "journey", entityId: journey.id, detail: { text, activityId } });
}

/** Marca como feita no Nexo (RH ou link). Sem tarefa no Bitrix, a atividade só fica local. */
function completeActivity(journey: JourneyRow, activity: ActivityRow, source: "nexo" | "link", actor: Actor): void {
  if (activity.status === "done") return;
  if (activity.status === "locked") throw lockedActivity();
  if (activity.status === "cancelled") throw cancelledActivity();
  getDb().tx(() => {
    const live = hasLiveTask(activity);
    const updated = updateActivity(activity.id, {
      status: "done",
      doneAt: new Date().toISOString(),
      doneSource: source,
      syncState: live ? "queued" : activity.bitrixTaskId ? activity.syncState : "local",
    });
    if (live) enqueueActivityJob(JOB_KINDS.activityPush, activity.id);
    if (updated) applyLedgerEffects(journey, updated);
    auditActivity(
      journey,
      actor,
      source === "link" ? "Colaborador marcou como feita" : "Atividade concluída no Nexo",
      `“${activity.title}” marcada como feita${source === "link" ? " pelo link pessoal" : ""}.`,
      activity.id,
    );
    releaseJourney(journey);
    enqueuePushes();
  });
  kick();
}

function reopenActivity(journey: JourneyRow, activity: ActivityRow, actor: Actor): void {
  if (activity.status !== "done" && activity.status !== "awaiting_approval") return;
  getDb().tx(() => {
    const live = hasLiveTask(activity);
    updateActivity(activity.id, { status: "open", doneAt: null, doneSource: null, ...(live ? { syncState: "queued" as const } : {}) });
    if (live) enqueueActivityJob(JOB_KINDS.activityPush, activity.id);
    auditActivity(journey, actor, "Atividade reaberta", `“${activity.title}” voltou para a fazer.`, activity.id);
    enqueuePushes();
  });
  kick();
}

function nudgeMessage(activity: ActivityRow, journey: JourneyRow, custom: string | undefined): string {
  const mention = activity.assigneeBitrixId ? `[USER=${activity.assigneeBitrixId}]${activity.assigneeName ?? "Responsável"}[/USER]` : (activity.assigneeName ?? "Olá");
  if (custom?.trim()) return `${mention}, ${custom.trim()}`;
  const person = findPerson(journey.personId)?.name ?? "a pessoa";
  const due = formatDateTimeBr(activity.dueAt, getCompany().timezone);
  const overdue = Date.parse(activity.dueAt) < Date.now();
  return `${mention}, pode dar uma olhada nesta tarefa da jornada de ${person}? ${overdue ? `O prazo era ${due}.` : `O prazo é ${due}.`} Se precisar de algo, responda aqui. Obrigado!`;
}

function nudgeActivity(journey: JourneyRow, activity: ActivityRow, message: string | undefined, actor: Actor): void {
  if (!hasLiveTask(activity) || !activity.bitrixTaskId) throw new AppError("NO_TASK", "Esta atividade ainda não tem tarefa no Bitrix24 para cobrar.", 409);
  if (activity.status === "done" || activity.status === "cancelled" || activity.status === "locked") {
    throw new AppError("NOTHING_TO_NUDGE", "Só dá para cobrar atividades liberadas e ainda não concluídas.", 409);
  }
  const last = activity.lastNudgedAt ? Date.parse(activity.lastNudgedAt) : Number.NaN;
  if (!Number.isNaN(last) && Date.now() - last < NUDGE_INTERVAL_MS) {
    throw new AppError("NUDGE_TOO_SOON", "Esta atividade já foi cobrada há menos de 1 hora. Tente de novo mais tarde.", 429);
  }
  getDb().tx(() => {
    updateActivity(activity.id, { lastNudgedAt: new Date().toISOString() });
    enqueueJob({ kind: JOB_KINDS.taskComment, payload: { activityId: activity.id, message: nudgeMessage(activity, journey, message) } });
    auditActivity(journey, actor, "Responsável cobrado", `Comentário de cobrança em “${activity.title}” para ${activity.assigneeName ?? "o responsável"}.`, activity.id);
  });
  kick();
}

function toggleItem(journey: JourneyRow, activity: ActivityRow, itemKey: string, done: boolean, actor: Actor): void {
  const item = activity.checklist.find((entry) => entry.key === itemKey);
  if (!item) throw notFound("Item do checklist");
  if (activity.status === "locked") throw lockedActivity();
  if (activity.status === "cancelled") throw cancelledActivity();
  if (item.done === done) return;
  getDb().tx(() => {
    const live = hasLiveTask(activity);
    const updated = updateActivity(activity.id, {
      checklist: activity.checklist.map((entry) => (entry.key === itemKey ? { ...entry, done } : entry)),
      ...(live ? { syncState: "queued" as const } : {}),
    });
    if (live) enqueueActivityJob(JOB_KINDS.activityPush, activity.id);
    if (updated) applyLedgerEffects(journey, updated);
    auditActivity(journey, actor, done ? "Item do checklist marcado" : "Item do checklist desmarcado", `“${item.text}” em “${activity.title}”.`, activity.id);
  });
  kick();
}

/** complete | reopen | approve | nudge | toggle_item. Atualiza localmente e enfileira a escrita no Bitrix. */
export function applyActivityAction(activityId: string, input: ActivityActionInput, actor: Actor): void {
  const activity = getActivity(activityId);
  if (!activity) throw notFound("Atividade");
  const journey = getJourney(activity.journeyId);
  if (!journey) throw notFound("Jornada");
  if (journey.status === "completed" || journey.status === "cancelled") throw closedJourney();
  switch (input.action) {
    case "complete":
      return completeActivity(journey, activity, "nexo", actor);
    case "approve":
      if (activity.status !== "awaiting_approval") throw new AppError("NOT_AWAITING_APPROVAL", "Esta atividade não está aguardando aprovação.", 409);
      return completeActivity(journey, activity, "nexo", actor);
    case "reopen":
      return reopenActivity(journey, activity, actor);
    case "nudge":
      return nudgeActivity(journey, activity, input.message, actor);
    case "toggle_item":
      return toggleItem(journey, activity, input.itemKey, input.done, actor);
  }
}

/** "Marcar como feita" vindo do link do colaborador. Só aceita atividades do próprio colaborador, visíveis e liberadas. */
export function markDoneFromLink(journeyId: string, activityId: string): { ok: boolean; message: string } {
  const journey = getJourney(journeyId);
  if (!journey) return { ok: false, message: "Não encontramos esta jornada." };
  if (journey.status !== "active" && journey.status !== "paused") return { ok: false, message: "Esta jornada já foi encerrada." };
  const activity = getActivity(activityId);
  if (!activity || activity.journeyId !== journey.id || activity.role !== "colaborador" || activity.visibility !== "employee") {
    return { ok: false, message: "Esta atividade não pode ser marcada por aqui." };
  }
  if (activity.status === "done") return { ok: true, message: "Esta atividade já estava marcada como feita." };
  if (activity.status !== "open" && activity.status !== "in_progress") return { ok: false, message: "Esta atividade ainda não foi liberada." };
  completeActivity(journey, activity, "link", { type: "link", id: null, name: null });
  return { ok: true, message: "Pronto! Marcamos como feita." };
}

/** Entrada manual no inventário (ex.: quem entrou antes do Nexo). Numa saída em andamento, entra também na lista "Revogar e recolher". */
export function addManualLedgerItem(personId: string, input: LedgerItemInput, actor: Actor): LedgerRow {
  const person = findPerson(personId);
  if (!person) throw notFound("Pessoa");
  const name = input.name.trim();
  const detail = (input.detail ?? "").trim();
  let pushed = false;
  const item = getDb().tx(() => {
    const created = insertLedgerItem({ personId, kind: input.kind, name, detail, status: "active", source: "manual", grantedAt: new Date().toISOString() });
    const offboarding = listJourneys({ personId, kind: "offboarding", status: ["active", "paused"] })[0];
    const revoke = offboarding
      ? listActivities(offboarding.id).find((activity) => activity.ledgerRole === "revoke_and_collect" && activity.status !== "done" && activity.status !== "cancelled")
      : undefined;
    if (offboarding && revoke) {
      const live = hasLiveTask(revoke);
      updateActivity(revoke.id, { checklist: [...revoke.checklist, ...revokeChecklist([created])], ...(live ? { syncState: "queued" as const } : {}) });
      updateLedgerItem(created.id, { status: "return_requested", closingJourneyId: offboarding.id, closingActivityId: revoke.id });
      if (live) {
        enqueueActivityJob(JOB_KINDS.activityPush, revoke.id);
        pushed = true;
      }
    }
    audit({
      actorType: actor.type,
      actorId: actor.id,
      actorName: actor.name,
      action: "Item adicionado ao inventário",
      entity: offboarding ? "journey" : "ledger",
      entityId: offboarding?.id ?? created.id,
      detail: { text: `${input.kind === "access" ? "Acesso" : "Equipamento"} “${detail ? `${name} · ${detail}` : name}” registrado para ${person.name}.`, ledgerItemId: created.id },
    });
    return getLedgerItem(created.id) ?? created;
  });
  if (pushed) kick();
  return item;
}

/** Dispensa exige motivo; o item deixa de bloquear a conclusão da saída. */
export function waiveLedgerItem(itemId: string, reason: string, actor: Actor): LedgerRow {
  const text = reason.trim();
  if (!text) throw new AppError("REASON_REQUIRED", "Informe o motivo da dispensa.", 422);
  const item = getLedgerItem(itemId);
  if (!item) throw notFound("Item do inventário");
  if (item.status === "waived") return item;
  if (item.status === "closed") throw new AppError("LEDGER_CLOSED", "Este item já foi encerrado.", 409);
  const updated = updateLedgerItem(itemId, { status: "waived", waivedReason: text, closedAt: new Date().toISOString() }) ?? item;
  audit({
    actorType: actor.type,
    actorId: actor.id,
    actorName: actor.name,
    action: "Item do inventário dispensado",
    entity: item.closingJourneyId ? "journey" : "ledger",
    entityId: item.closingJourneyId ?? item.id,
    detail: { text: `“${item.name}” dispensado. Motivo: ${text}`, ledgerItemId: item.id },
  });
  return updated;
}

/**
 * Tenta de novo a sincronização de uma atividade com erro ou incerta (ação manual do RH).
 * Uma criação incerta ganha um reenvio extra; tarefa apagada no Bitrix nunca é recriada por aqui.
 */
export function retryActivitySync(activityId: string, actor: Actor): void {
  const activity = getActivity(activityId);
  if (!activity) throw notFound("Atividade");
  if (activity.bitrixMissing) throw new AppError("TASK_MISSING", "A tarefa foi apagada ou movida no Bitrix. O Nexo não a recria sozinho.", 409);
  const journey = getJourney(activity.journeyId);
  if (!journey || journey.status === "completed" || journey.status === "cancelled") throw closedJourney();
  getDb().tx(() => {
    updateActivity(activity.id, { syncState: "queued", syncError: null });
    if (activity.bitrixTaskId) enqueueActivityJob(JOB_KINDS.activityPush, activity.id);
    else enqueueActivityJob(JOB_KINDS.taskCreate, activity.id, { payload: { force: true } });
    auditActivity(journey, actor, "Sincronização refeita", `Nova tentativa de enviar “${activity.title}” ao Bitrix24.`, activity.id);
  });
  kick();
}
