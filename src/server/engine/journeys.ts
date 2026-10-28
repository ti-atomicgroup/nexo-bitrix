import "server-only";
import { randomUUID } from "node:crypto";
import type { JourneyPreviewDTO, TemplateActivityDTO, TemplateDTO } from "@/shared/contracts";
import { JOURNEY_KIND_LABEL, PARTICIPANT_ROLES, type ActivityRole, type JourneyKind, type ParticipantRole } from "@/shared/enums";
import type { CreateJourneyInput, JourneyActionInput } from "@/shared/schemas";
import { getDb } from "../db";
import { insertActivities, listActivities, updateActivity, type ActivityRow } from "../db/repos/activities";
import { audit } from "../db/repos/audit";
import { getDetection, updateDetection } from "../db/repos/detections";
import { findJourneyBySourceKey, getJourney, insertJourney, updateJourney, type JourneyRow } from "../db/repos/journeys";
import { listActiveLedger, listLedger, updateLedgerItem, type LedgerRow } from "../db/repos/ledger";
import { createPerson, findPerson, findPersonByBitrixId, type PersonRow } from "../db/repos/people";
import { getCompany, getDefaults, getSetupStage } from "../db/repos/settings";
import { getTemplate } from "../db/repos/templates";
import { getTrigger } from "../db/repos/triggers";
import { computeActivities, missingAssigneeMessage, type Participants } from "../domain/activities";
import { completionCheck } from "../domain/completion";
import { daysBetween, localDateOf } from "../domain/dates";
import { revokeChecklist } from "../domain/ledger";
import { stagesToRelease } from "../domain/release";
import { AppError, notFound } from "../errors";
import { scheduleWelcomePost } from "./extras";
import { attachBitrixAccount, INVITE_SCOPE_MESSAGE, invitesEnabled, requestInvite } from "./invite";
import { enqueuePushes, releaseJourney } from "./release";
import { kick } from "./scheduler";
import { crmBinding } from "./triggers";
import type { Actor } from "./types";

/** O link do colaborador continua valendo 30 dias depois do fim da jornada. */
export const LINK_GRACE_MS = 30 * 24 * 3_600_000;
export const REVOKE_ACTIVITY_ID = "nexo-revogar-e-recolher";

const PARTICIPANT_LABEL: Record<ParticipantRole, string> = { rh: "a pessoa do RH", gestor: "o gestor", ti: "a pessoa de TI", buddy: "o buddy" };
const PARTICIPANT_ROLE_NAME: Record<ParticipantRole, string> = { rh: "RH", gestor: "gestor", ti: "TI", buddy: "buddy" };

interface JourneyPlan {
  journeyId: string;
  template: TemplateDTO;
  /** Cópia da trilha usada pela jornada (com a tarefa "Revogar e recolher" injetada na saída, se preciso). */
  snapshot: TemplateDTO;
  person: PersonRow | null;
  draftPerson: { name: string; email: string | null; invite: boolean } | null;
  participants: Participants;
  activities: ActivityRow[];
  missingRoles: ActivityRole[];
  /** Inventário com a pessoa que entra na lista "Revogar e recolher" (saída). */
  revokeLedger: LedgerRow[];
  timezone: string;
}

const closedJourney = () => new AppError("JOURNEY_CLOSED", "Esta jornada já foi encerrada.", 409);

function resolveParticipants(chosen: CreateJourneyInput["participants"], strict: boolean): Participants {
  const defaults = getDefaults();
  const result: Participants = {};
  for (const role of PARTICIPANT_ROLES) {
    const id = chosen[role];
    if (id) {
      const person = findPersonByBitrixId(id);
      if (person?.active) {
        result[role] = { bitrixUserId: id, name: person.name, position: person.position };
      } else if (strict) {
        throw new AppError(
          "PARTICIPANT_NOT_FOUND",
          person
            ? `A pessoa escolhida como ${PARTICIPANT_ROLE_NAME[role]} está inativa no Bitrix24. Escolha outra pessoa.`
            : `Não encontramos ${PARTICIPANT_LABEL[role]} na lista de pessoas. Atualize a lista de pessoas e tente de novo.`,
          422,
        );
      }
      continue;
    }
    const fallback = defaults[role];
    // Padrão desligado no Bitrix não serve: o papel aparece como faltando.
    if (fallback && findPersonByBitrixId(fallback.bitrixUserId)?.active !== false) result[role] = fallback;
  }
  return result;
}

/**
 * Saída sem atividade "Revogar e recolher" na trilha, mas com inventário: a tarefa de TI é acrescentada no dia da saída,
 * na última etapa liberada até esse dia (para não nascer atrasada).
 */
function withRevokeActivity(template: TemplateDTO, kind: JourneyKind, hasLedger: boolean): TemplateDTO {
  const snapshot = structuredClone(template);
  if (kind !== "offboarding" || !hasLedger) return snapshot;
  if (snapshot.stages.some((stage) => stage.activities.some((activity) => activity.ledgerRole === "revoke_and_collect"))) return snapshot;
  const stages = [...snapshot.stages].sort((a, b) => a.position - b.position);
  const beforeAnchor = stages.filter((stage) => stage.releaseMode === "start" || (stage.releaseMode === "offset" && stage.releaseOffsetDays <= 0));
  const target = beforeAnchor.at(-1) ?? stages.at(-1);
  if (!target) return snapshot;
  const activity: TemplateActivityDTO = {
    id: REVOKE_ACTIVITY_ID,
    position: Math.max(-1, ...target.activities.map((item) => item.position)) + 1,
    title: "Revogar acessos e recolher equipamentos",
    instructions: "No horário combinado com o RH, revogue cada acesso e recolha cada equipamento desta lista (ela vem do inventário da pessoa). Marque cada item ao concluir.",
    kind: "task",
    role: "ti",
    dueOffsetDays: 0,
    dueOffsetUnit: "calendar",
    dueTime: "18:00",
    required: true,
    visibility: "team",
    requiresApproval: false,
    ledgerRole: "revoke_and_collect",
    checklist: [],
    links: [],
  };
  target.activities.push(activity);
  snapshot.activityCount += 1;
  return snapshot;
}

function planJourney(input: CreateJourneyInput, strict: boolean): JourneyPlan {
  const template = getTemplate(input.templateId);
  if (!template) throw notFound("Trilha");
  if (template.archived) throw new AppError("TEMPLATE_ARCHIVED", "Esta trilha foi arquivada. Escolha outra.", 409);
  if (template.kind !== input.kind) {
    throw new AppError("TEMPLATE_KIND", input.kind === "onboarding" ? "Escolha uma trilha de entrada." : "Escolha uma trilha de saída.", 422);
  }
  const timezone = getCompany().timezone;
  let person: PersonRow | null = null;
  let draftPerson: JourneyPlan["draftPerson"] = null;
  let personBitrixId: string | null = null;
  if ("bitrixUserId" in input.person) {
    personBitrixId = input.person.bitrixUserId;
    person = findPersonByBitrixId(personBitrixId);
    if (!person && strict) {
      throw new AppError("PERSON_NOT_FOUND", "Não encontramos essa pessoa na lista do Bitrix24. Atualize a lista de pessoas e tente de novo.", 422);
    }
  } else {
    draftPerson = { name: input.person.name.trim(), email: input.person.email?.trim() || null, invite: Boolean(input.person.invite) };
  }
  const participants = resolveParticipants(input.participants, strict);
  const revokeLedger = input.kind === "offboarding" && person ? listActiveLedger(person.id) : [];
  const snapshot = withRevokeActivity(template, input.kind, revokeLedger.length > 0);
  const journeyId = randomUUID();
  const { activities, missingRoles } = computeActivities({
    journeyId,
    template: snapshot,
    anchorDate: input.anchorDate,
    timezone,
    participants,
    // Conta desativada no Bitrix não recebe tarefa: as atividades do colaborador ficam só no link.
    person: { bitrixUserId: person?.active === false ? null : personBitrixId, name: person?.name ?? draftPerson?.name ?? "Pessoa" },
  });
  const revoke = activities.find((activity) => activity.ledgerRole === "revoke_and_collect");
  if (revoke && revokeLedger.length) {
    const keys = new Set(revoke.checklist.map((item) => item.key));
    revoke.checklist = [...revoke.checklist, ...revokeChecklist(revokeLedger).filter((item) => !keys.has(item.key))];
  }
  return { journeyId, template, snapshot, person, draftPerson, participants, activities, missingRoles, revokeLedger: revoke ? revokeLedger : [], timezone };
}

/** Linha mínima para simular a liberação na prévia (nada é gravado). */
function previewRow(plan: JourneyPlan, input: CreateJourneyInput): JourneyRow {
  const now = new Date().toISOString();
  return {
    id: plan.journeyId,
    kind: input.kind,
    personId: plan.person?.id ?? "",
    templateId: plan.template.id,
    templateVersion: plan.template.version,
    snapshot: plan.snapshot,
    anchorDate: input.anchorDate,
    status: "active",
    offboardingReason: null,
    personPosition: input.position?.trim() || null,
    participants: plan.participants,
    sourceType: "manual",
    sourceKey: null,
    sourceLabel: null,
    crmBinding: null,
    crmUrl: null,
    linkTokenHash: null,
    linkExpiresAt: null,
    createdBy: null,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
    cancelledAt: null,
    cancelReason: null,
  };
}

export function previewJourney(input: CreateJourneyInput): JourneyPreviewDTO {
  const plan = planJourney(input, false);
  const rows = plan.activities;
  const released = new Set(stagesToRelease(previewRow(plan, input), rows, plan.timezone, new Date()));
  const dues = rows.map((row) => row.dueAt).sort((a, b) => Date.parse(a) - Date.parse(b));
  const first = dues[0] ?? null;
  const last = dues.at(-1) ?? null;
  const byRole: Partial<Record<ActivityRole, number>> = {};
  for (const row of rows) byRole[row.role] = (byRole[row.role] ?? 0) + 1;
  return {
    activityCount: rows.length,
    spanDays: first && last ? Math.max(1, daysBetween(localDateOf(first, plan.timezone), localDateOf(last, plan.timezone))) : 0,
    firstDueAt: first,
    lastDueAt: last,
    byRole,
    releasedNow: rows.filter((row) => released.has(row.stagePosition)).length,
    missingAssignees: plan.missingRoles,
  };
}

function ensurePerson(plan: JourneyPlan, source: "manual" | "crm"): PersonRow {
  if (plan.person) return plan.person;
  if (!plan.draftPerson) throw new AppError("PERSON_NOT_FOUND", "Escolha a pessoa da jornada.", 422);
  return createPerson({ name: plan.draftPerson.name, email: plan.draftPerson.email, source });
}

/** Cria a jornada (idempotente por `requestId` ou detecção), libera as etapas devidas, enfileira as tarefas e chama `kick()`. */
export function createJourney(input: CreateJourneyInput, actor: Actor): { id: string } {
  const detection = input.detectionId ? getDetection(input.detectionId) : null;
  if (input.detectionId && !detection) throw notFound("Detecção");
  const sourceKey = detection ? `crm:${detection.entityTypeId}:${detection.entityId}` : `manual:${input.requestId}`;
  const existing = findJourneyBySourceKey(sourceKey);
  if (existing) return { id: existing.id };
  if (getSetupStage() !== "ready") throw new AppError("SETUP_REQUIRED", "Conclua a preparação do Nexo antes de iniciar jornadas.", 409);
  const plan = planJourney(input, true);
  if (plan.draftPerson?.invite && !invitesEnabled()) throw new AppError("INVITE_SCOPE", INVITE_SCOPE_MESSAGE, 409);
  if (plan.missingRoles.length) throw new AppError("ASSIGNEE_REQUIRED", missingAssigneeMessage(plan.missingRoles), 422, { roles: plan.missingRoles });
  const trigger = detection ? getTrigger(detection.triggerId) : null;
  const id = getDb().tx(() => {
    const again = findJourneyBySourceKey(sourceKey);
    if (again) return again.id;
    const person = ensurePerson(plan, detection ? "crm" : "manual");
    const journey = insertJourney({
      id: plan.journeyId,
      kind: input.kind,
      personId: person.id,
      templateId: plan.template.id,
      templateVersion: plan.template.version,
      snapshot: plan.snapshot,
      anchorDate: input.anchorDate,
      status: "active",
      offboardingReason: input.kind === "offboarding" ? (input.offboardingReason ?? null) : null,
      personPosition: input.position?.trim() || null,
      participants: plan.participants,
      sourceType: detection ? "trigger" : "manual",
      sourceKey,
      sourceLabel: detection ? (trigger?.name ?? "Detectado no Bitrix24") : null,
      crmBinding: detection ? crmBinding(detection.entityTypeId, detection.entityId) : null,
      crmUrl: detection?.crmUrl ?? null,
      createdBy: actor.id,
    });
    insertActivities(plan.activities);
    const revoke = plan.activities.find((activity) => activity.ledgerRole === "revoke_and_collect");
    for (const item of plan.revokeLedger) {
      updateLedgerItem(item.id, { status: "return_requested", closingJourneyId: journey.id, closingActivityId: revoke?.id ?? null });
    }
    if (detection) updateDetection(detection.id, { status: "started", journeyId: journey.id });
    audit({
      actorType: actor.type,
      actorId: actor.id,
      actorName: actor.name,
      action: "Jornada iniciada",
      entity: "journey",
      entityId: journey.id,
      detail: { text: `${JOURNEY_KIND_LABEL[input.kind]} de ${person.name} com a trilha “${plan.template.name}” (${plan.activities.length} atividades).` },
    });
    releaseJourney(journey, { timezone: plan.timezone, initial: true });
    enqueuePushes();
    if (plan.draftPerson?.invite && plan.draftPerson.email) requestInvite(person.id, plan.draftPerson.email, journey.id);
    scheduleWelcomePost(journey, plan.timezone);
    return journey.id;
  });
  kick();
  return { id };
}

function auditJourney(journey: JourneyRow, actor: Actor, action: string, text: string): void {
  audit({ actorType: actor.type, actorId: actor.id, actorName: actor.name, action, entity: "journey", entityId: journey.id, detail: { text } });
}

/** pause | resume | cancel | complete (complete exige `completionCheck` ok). */
export function applyJourneyAction(journeyId: string, input: JourneyActionInput, actor: Actor): void {
  const journey = getJourney(journeyId);
  if (!journey) throw notFound("Jornada");
  const reason = input.reason?.trim() || null;
  const now = new Date();
  switch (input.action) {
    case "pause": {
      if (journey.status === "paused") return;
      if (journey.status !== "active") throw closedJourney();
      updateJourney(journey.id, { status: "paused" });
      auditJourney(journey, actor, "Jornada pausada", reason ? `Novas etapas pausadas. Motivo: ${reason}` : "Novas etapas pausadas; as tarefas já criadas continuam no Bitrix24.");
      return;
    }
    case "resume": {
      if (journey.status === "active") return;
      if (journey.status !== "paused") throw closedJourney();
      const resumed = updateJourney(journey.id, { status: "active" }) ?? journey;
      auditJourney(journey, actor, "Jornada retomada", "A jornada voltou a liberar etapas e criar tarefas.");
      releaseJourney(resumed);
      enqueuePushes();
      kick();
      return;
    }
    case "cancel": {
      if (journey.status === "cancelled") return;
      if (journey.status === "completed") throw closedJourney();
      getDb().tx(() => {
        updateJourney(journey.id, { status: "cancelled", cancelledAt: now.toISOString(), cancelReason: reason, linkExpiresAt: now.toISOString() });
        for (const activity of listActivities(journey.id)) {
          if (activity.status === "done" || activity.status === "cancelled") continue;
          updateActivity(activity.id, { status: "cancelled", ...(activity.bitrixTaskId ? {} : { syncState: "local" as const, syncError: null }) });
        }
        // Saída cancelada: o que estava com devolução pedida continua com a pessoa.
        if (journey.kind === "offboarding") {
          for (const item of listLedger(journey.personId)) {
            if (item.status === "return_requested" && item.closingJourneyId === journey.id) {
              updateLedgerItem(item.id, { status: "active", closingJourneyId: null, closingActivityId: null });
            }
          }
        }
        auditJourney(
          journey,
          actor,
          "Jornada cancelada",
          `${reason ? `Motivo: ${reason}. ` : ""}As tarefas já criadas continuam no Bitrix24; feche-as lá se não forem mais necessárias.`,
        );
      });
      return;
    }
    case "complete": {
      if (journey.status === "completed") return;
      if (journey.status === "cancelled") throw closedJourney();
      const activities = listActivities(journey.id);
      const check = completionCheck(journey, activities, listActiveLedger(journey.personId));
      if (!check.ok) throw new AppError("JOURNEY_INCOMPLETE", check.blockers.join(" "), 409, { blockers: check.blockers });
      getDb().tx(() => {
        updateJourney(journey.id, { status: "completed", completedAt: now.toISOString(), linkExpiresAt: new Date(now.getTime() + LINK_GRACE_MS).toISOString() });
        // Opcionais que nunca chegaram a ser liberadas saem da contagem.
        for (const activity of activities) if (activity.status === "locked") updateActivity(activity.id, { status: "cancelled" });
        auditJourney(journey, actor, "Jornada concluída", reason ? `Concluída. ${reason}` : "Todas as pendências obrigatórias foram resolvidas.");
      });
      return;
    }
  }
}

/** Liga a pessoa sem conta ao usuário Bitrix e envia as tarefas do colaborador que já estavam liberadas. */
export function linkJourneyPerson(journeyId: string, bitrixUserId: string, actor: Actor): void {
  const journey = getJourney(journeyId);
  if (!journey) throw notFound("Jornada");
  if (journey.status === "completed" || journey.status === "cancelled") throw closedJourney();
  const person = findPerson(journey.personId);
  if (!person) throw notFound("Pessoa");
  if (person.bitrixUserId === bitrixUserId) return;
  if (person.bitrixUserId) throw new AppError("PERSON_ALREADY_LINKED", "Esta pessoa já está ligada a outra conta do Bitrix24.", 409);
  const target = findPersonByBitrixId(bitrixUserId);
  if (!target) throw new AppError("PERSON_NOT_FOUND", "Não encontramos essa conta na lista de pessoas. Atualize a lista e tente de novo.", 422);
  getDb().tx(() => {
    const linked = attachBitrixAccount(person.id, bitrixUserId);
    auditJourney(journey, actor, "Conta do Bitrix24 vinculada", `${person.name} agora é ${linked.name} no Bitrix24; as tarefas do colaborador vão para lá.`);
  });
  kick();
}

/** Convida a pessoa sem conta para o Bitrix24 pelo e-mail (de novo, se o convite anterior falhou). */
export function inviteJourneyPerson(journeyId: string, email: string, actor: Actor): void {
  const journey = getJourney(journeyId);
  if (!journey) throw notFound("Jornada");
  if (journey.status === "completed" || journey.status === "cancelled") throw closedJourney();
  const person = findPerson(journey.personId);
  if (!person) throw notFound("Pessoa");
  if (person.bitrixUserId) throw new AppError("PERSON_ALREADY_LINKED", "Esta pessoa já tem conta no Bitrix24.", 409);
  if (!invitesEnabled()) throw new AppError("INVITE_SCOPE", INVITE_SCOPE_MESSAGE, 409);
  getDb().tx(() => {
    requestInvite(person.id, email, journey.id);
    auditJourney(journey, actor, "Convite para o Bitrix24 pedido", `O Nexo vai convidar ${person.name} pelo e-mail ${email.trim()}.`);
  });
  kick();
}
