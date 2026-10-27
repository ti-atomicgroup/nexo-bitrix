import "server-only";
import { z } from "zod";
import type { ActivityDocumentDTO, ActivityDTO, CollaboratorLinkDTO, JourneyDTO, JourneySummaryDTO, PersonDTO, UserRef } from "@/shared/contracts";
import { JOURNEY_KINDS, JOURNEY_STATUSES, type JourneyKind, type JourneyStatus } from "@/shared/enums";
import { completionCheck, isOverdue, journeyProgress, journeyRisk, journeyRiskReason, nextStop, stagesState, type StageState } from "@/server/domain";
import { getActivity, listActivities, listActivitiesByJourneyIds, type ActivityRow } from "../../db/repos/activities";
import { listAudit } from "../../db/repos/audit";
import { listDocumentsByActivity } from "../../db/repos/documents";
import { getJourney, listJourneys, type JourneyRow } from "../../db/repos/journeys";
import { listActiveLedger, listLedger, toLedgerItemDTO } from "../../db/repos/ledger";
import { findPerson, findPersonByBitrixId, toPersonDTO, type PersonRow } from "../../db/repos/people";
import { getCompany, getProject, getWebhookRecord } from "../../db/repos/settings";
import { AppError } from "../../errors";
import { blankAsUndefined } from "../../http/input";
import { redactText } from "../../log";
import { bitrixPortalUrl, bitrixTaskUrl } from "../bitrix-links";

/** Modelos de leitura das jornadas (só SQLite): resumo para listas, jornada completa e atividade. */

export const journeysQueryInput = z.object({
  status: z.preprocess(blankAsUndefined, z.enum(JOURNEY_STATUSES).optional()),
  kind: z.preprocess(blankAsUndefined, z.enum(JOURNEY_KINDS).optional()),
});

export const journeyNotFound = () => new AppError("NOT_FOUND", "Não encontramos esta jornada.", 404);
export const activityNotFound = () => new AppError("NOT_FOUND", "Não encontramos esta atividade.", 404);

interface ReadContext {
  timezone: string;
  now: Date;
  portal: string | null;
  projectId: string | null;
  people: Map<string, PersonRow | null>;
}

function readContext(now: Date): ReadContext {
  return { timezone: getCompany().timezone, now, portal: getWebhookRecord()?.portal ?? null, projectId: getProject()?.id ?? null, people: new Map() };
}

function personByBitrixId(ctx: ReadContext, bitrixUserId: string): PersonRow | null {
  if (!ctx.people.has(bitrixUserId)) ctx.people.set(bitrixUserId, findPersonByBitrixId(bitrixUserId));
  return ctx.people.get(bitrixUserId) ?? null;
}

function personDTO(journey: JourneyRow, person: PersonRow | null): PersonDTO {
  if (person) return toPersonDTO(person);
  return { id: journey.personId, bitrixUserId: null, name: "Pessoa removida", email: null, position: null, department: null, active: false, source: "manual" };
}

const isFinished = (journey: JourneyRow) => journey.status === "completed" || journey.status === "cancelled";

export function buildJourneySummary(
  journey: JourneyRow,
  activities: ActivityRow[],
  person: PersonRow | null,
  timezone: string,
  now = new Date(),
  stages: StageState[] = stagesState(journey, activities, timezone),
): JourneySummaryDTO {
  const finished = isFinished(journey);
  return {
    id: journey.id,
    kind: journey.kind,
    person: personDTO(journey, person),
    templateName: journey.snapshot?.name ?? "Trilha",
    profile: journey.snapshot?.profile ?? "",
    anchorDate: journey.anchorDate,
    status: journey.status,
    progress: journeyProgress(activities),
    line: stages.map(({ position, name, state }) => ({ position, name, state })),
    nextStop: finished ? null : nextStop(journey, activities, timezone, now),
    risk: finished ? "ok" : journeyRisk(activities, now),
    riskReason: finished ? null : journeyRiskReason(activities, now),
  };
}

/** Resumos de várias jornadas com uma consulta de atividades só. */
export function summarizeJourneys(journeys: JourneyRow[], now = new Date()): JourneySummaryDTO[] {
  const { timezone } = getCompany();
  const byJourney = new Map<string, ActivityRow[]>();
  for (const activity of listActivitiesByJourneyIds(journeys.map((journey) => journey.id))) {
    const list = byJourney.get(activity.journeyId) ?? [];
    list.push(activity);
    byJourney.set(activity.journeyId, list);
  }
  const people = new Map<string, PersonRow | null>();
  return journeys.map((journey) => {
    if (!people.has(journey.personId)) people.set(journey.personId, findPerson(journey.personId));
    return buildJourneySummary(journey, byJourney.get(journey.id) ?? [], people.get(journey.personId) ?? null, timezone, now);
  });
}

export function listJourneySummaries(filter: { status?: JourneyStatus; kind?: JourneyKind } = {}, now = new Date()): JourneySummaryDTO[] {
  return summarizeJourneys(listJourneys({ status: filter.status ? [filter.status] : undefined, kind: filter.kind }), now);
}

function assignee(activity: ActivityRow, ctx: ReadContext): UserRef | null {
  if (!activity.assigneeBitrixId) return null;
  const person = personByBitrixId(ctx, activity.assigneeBitrixId);
  return {
    bitrixUserId: activity.assigneeBitrixId,
    name: activity.assigneeName ?? person?.name ?? `Usuário ${activity.assigneeBitrixId}`,
    position: person?.position ?? null,
  };
}

/** Documentos pedidos e os arquivos recebidos (o RH abre cada um no Drive do projeto, depois do envio). */
function activityDocuments(activity: ActivityRow, ctx: ReadContext): ActivityDocumentDTO[] {
  const received = listDocumentsByActivity(activity.id);
  return activity.documents.map((request) => ({
    ...request,
    files: received
      .filter((document) => document.requestKey === request.key)
      .map((document) => ({
        id: document.id,
        fileName: document.fileName,
        size: document.size,
        receivedAt: document.receivedAt,
        status: document.status,
        bitrixUrl: bitrixPortalUrl(ctx.portal, document.bitrixUrl),
        error: document.error ? redactText(document.error) : null,
        rejectedAt: document.rejectedAt,
        rejectedReason: document.rejectedReason,
      })),
  }));
}

function buildActivityDTO(activity: ActivityRow, stage: StageState | undefined, ctx: ReadContext): ActivityDTO {
  return {
    id: activity.id,
    journeyId: activity.journeyId,
    stagePosition: activity.stagePosition,
    position: activity.position,
    title: activity.title,
    instructions: activity.instructions,
    kind: activity.kind,
    role: activity.role,
    assignee: assignee(activity, ctx),
    dueAt: activity.dueAt,
    required: activity.required,
    visibility: activity.visibility,
    requiresApproval: activity.requiresApproval,
    status: activity.status,
    overdue: isOverdue(activity, ctx.now),
    checklist: activity.checklist,
    links: activity.links,
    ...(activity.documents.length ? { documents: activityDocuments(activity, ctx) } : {}),
    bitrixTaskId: activity.bitrixTaskId,
    bitrixUrl: activity.bitrixMissing ? null : bitrixTaskUrl(ctx.portal, ctx.projectId, activity.bitrixTaskId),
    bitrixMissing: activity.bitrixMissing,
    syncState: activity.syncState,
    syncError: activity.syncError ? redactText(activity.syncError) : null,
    releasedAt: activity.releasedAt,
    releasesAt: activity.status === "locked" ? (stage?.releasesAt ?? null) : null,
    ...(stage ? { releaseMode: stage.releaseMode } : {}),
    doneAt: activity.doneAt,
    doneSource: activity.doneSource,
  };
}

/** Estado do link pessoal para o RH: nunca o endereço (só o hash fica guardado). */
export function linkState(journey: JourneyRow, now = new Date()): CollaboratorLinkDTO {
  const notExpired = !journey.linkExpiresAt || Date.parse(journey.linkExpiresAt) > now.getTime();
  return { active: Boolean(journey.linkTokenHash) && journey.status !== "cancelled" && notExpired, expiresAt: journey.linkExpiresAt };
}

export function buildJourneyDTO(id: string, now = new Date()): JourneyDTO {
  const journey = getJourney(id);
  if (!journey) throw journeyNotFound();
  const ctx = readContext(now);
  const activities = listActivities(journey.id);
  const stages = stagesState(journey, activities, ctx.timezone);
  return {
    summary: buildJourneySummary(journey, activities, findPerson(journey.personId), ctx.timezone, now, stages),
    participants: journey.participants,
    stages: stages.map((stage) => ({
      position: stage.position,
      name: stage.name,
      state: stage.state,
      releaseMode: stage.releaseMode,
      releasesAt: stage.releasesAt,
      activities: activities.filter((activity) => activity.stagePosition === stage.position).map((activity) => buildActivityDTO(activity, stage, ctx)),
    })),
    ledger: listLedger(journey.personId).map(toLedgerItemDTO),
    link: linkState(journey, now),
    source: { type: journey.sourceType, label: journey.sourceLabel, crmUrl: journey.crmUrl },
    offboardingReason: journey.offboardingReason,
    completion: completionCheck(journey, activities, listActiveLedger(journey.personId)),
    projectUrl: getProject()?.url ?? null,
    history: listAudit({ entity: "journey", entityId: journey.id, limit: 100 }),
  };
}

export function buildActivityDTOById(activityId: string, now = new Date()): ActivityDTO {
  const activity = getActivity(activityId);
  const journey = activity ? getJourney(activity.journeyId) : null;
  if (!activity || !journey) throw activityNotFound();
  const ctx = readContext(now);
  const stage = stagesState(journey, listActivities(journey.id), ctx.timezone).find((item) => item.position === activity.stagePosition);
  return buildActivityDTO(activity, stage, ctx);
}
