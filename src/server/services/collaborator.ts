import "server-only";
import type { CollaboratorActivityDTO, CollaboratorLinkDTO, CollaboratorViewDTO } from "@/shared/contracts";
import { ROLE_LABEL, type ActivityStatus } from "@/shared/enums";
import { daysUntil, journeyProgress, stagesState } from "@/server/domain";
import { markDoneFromLink, type Actor } from "@/server/engine";
import { getActivity, listActivities, type ActivityRow } from "../db/repos/activities";
import { findJourneyByLinkHash, getJourney, updateJourney, type JourneyRow } from "../db/repos/journeys";
import { findPerson } from "../db/repos/people";
import { getCompany, getContent } from "../db/repos/settings";
import { AppError, isAppError } from "../errors";
import { log } from "../log";
import { hashToken, newToken } from "../security/crypto";
import { rateLimit } from "../security/rate-limit";
import { auditAs } from "./audit";
import { journeyNotFound } from "./read/journeys";

/**
 * Link pessoal do colaborador (`/j/<token>`): token de 256 bits, só o hash fica no banco.
 * A página mostra apenas atividades visíveis ao colaborador e nunca o motivo do desligamento,
 * responsáveis internos, ids do Bitrix ou checklists.
 */
const LINK_AFTER_END_MS = 30 * 24 * 60 * 60 * 1000;
const DONE_RULE = { limit: 30, windowMs: 10 * 60 * 1000 };
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{20,200}$/;
const PEOPLE_ROLES = ["gestor", "buddy", "rh"] as const;

export type LinkDoneOutcome = "done" | "error" | "not_found";

/** O link vale até 30 dias depois do fim da jornada. */
function endOfLink(journey: JourneyRow): number | null {
  if (journey.status !== "completed") return null;
  return Date.parse(journey.completedAt ?? journey.updatedAt) + LINK_AFTER_END_MS;
}

export function createCollaboratorLink(journeyId: string, actor: Actor): CollaboratorLinkDTO {
  const journey = getJourney(journeyId);
  if (!journey) throw journeyNotFound();
  if (journey.status === "cancelled") throw new AppError("JOURNEY_CANCELLED", "Esta jornada foi cancelada. Não há link para enviar.", 409);
  const end = endOfLink(journey);
  if (end !== null && !(end > Date.now())) throw new AppError("LINK_EXPIRED", "O link pessoal vale só até 30 dias depois do fim da jornada.", 409);
  const expiresAt = end === null ? null : new Date(end).toISOString();

  const token = newToken();
  updateJourney(journeyId, { linkTokenHash: hashToken(token), linkExpiresAt: expiresAt });
  auditAs(actor, "Link do colaborador criado", "journey", journeyId, journey.linkTokenHash ? "O link anterior deixou de funcionar." : undefined);
  // Endereço relativo: a interface completa com a origem pública. Depois desta resposta, só o hash existe.
  return { active: true, expiresAt, url: `/j/${token}` };
}

export function revokeCollaboratorLink(journeyId: string, actor: Actor): CollaboratorLinkDTO {
  const journey = getJourney(journeyId);
  if (!journey) throw journeyNotFound();
  if (journey.linkTokenHash) {
    updateJourney(journeyId, { linkTokenHash: null, linkExpiresAt: null });
    auditAs(actor, "Link do colaborador revogado", "journey", journeyId);
  }
  return { active: false, expiresAt: null };
}

/** Jornada do token, se o link ainda vale (não revogado, não expirado, jornada não cancelada). */
function journeyForToken(token: string, now: number): JourneyRow | null {
  if (!TOKEN_SHAPE.test(token)) return null;
  const journey = findJourneyByLinkHash(hashToken(token));
  if (!journey || journey.status === "cancelled") return null;
  if (journey.linkExpiresAt && !(Date.parse(journey.linkExpiresAt) > now)) return null;
  const end = endOfLink(journey);
  if (end !== null && !(end > now)) return null;
  return journey;
}

function collaboratorStatus(status: ActivityStatus): CollaboratorActivityDTO["status"] {
  if (status === "done" || status === "awaiting_approval") return "done";
  if (status === "locked") return "waiting";
  return "todo";
}

function toCollaboratorActivity(activity: ActivityRow): CollaboratorActivityDTO {
  return {
    id: activity.id,
    title: activity.title,
    instructions: activity.instructions,
    kind: activity.kind,
    dueAt: activity.dueAt,
    status: collaboratorStatus(activity.status),
    mine: activity.role === "colaborador",
    ownerLabel: ROLE_LABEL[activity.role],
    links: activity.links,
  };
}

const isVisible = (activity: ActivityRow) => activity.visibility === "employee" && activity.status !== "cancelled";

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

export function loadCollaboratorView(token: string, now = new Date()): CollaboratorViewDTO | null {
  const journey = journeyForToken(token, now.getTime());
  if (!journey) return null;
  const person = findPerson(journey.personId);
  if (!person) return null;

  const company = getCompany();
  const content = getContent();
  const activities = listActivities(journey.id);
  const visible = activities.filter(isVisible);
  // Estações sem nenhuma atividade visível ficam de fora: o nome da etapa pode ser interno.
  const stages = stagesState(journey, activities, company.timezone)
    .map((stage) => ({
      position: stage.position,
      name: stage.name,
      state: stage.state,
      activities: visible.filter((activity) => activity.stagePosition === stage.position).map(toCollaboratorActivity),
    }))
    .filter((stage) => stage.activities.length > 0);
  const onboarding = journey.kind === "onboarding";

  return {
    kind: journey.kind,
    company: company.name,
    person: { firstName: firstName(person.name), name: person.name },
    anchorDate: journey.anchorDate,
    daysUntilAnchor: daysUntil(journey.anchorDate, company.timezone, now),
    message: onboarding ? content.welcomeMessage : content.farewellMessage,
    progress: journeyProgress(visible),
    stages,
    people: PEOPLE_ROLES.flatMap((role) => {
      const participant = journey.participants[role];
      return participant ? [{ role, name: participant.name, position: participant.position }] : [];
    }),
    contacts: content.contacts,
    faq: onboarding ? content.faqOnboarding : content.faqOffboarding,
    completed: journey.status === "completed",
  };
}

/** "Marcar como feita" do formulário sem JavaScript. Limite de 30 envios a cada 10 min por link. */
export function markDoneFromLinkToken(token: string, activityId: string, now = Date.now()): LinkDoneOutcome {
  const journey = journeyForToken(token, now);
  if (!journey?.linkTokenHash) return "not_found";
  if (!rateLimit(`link:${journey.linkTokenHash}`, DONE_RULE, now).allowed) return "error";

  // Conferência local antes do motor: só atividade do próprio colaborador, visível e liberada.
  const activity = getActivity(activityId);
  const mine = activity?.journeyId === journey.id && activity.role === "colaborador" && activity.visibility === "employee";
  if (!activity || !mine) return "error";
  // Envio repetido (duplo clique, voltar do navegador) não vira erro.
  if (activity.status === "done" || activity.status === "awaiting_approval") return "done";
  if (activity.status !== "open" && activity.status !== "in_progress") return "error";

  try {
    return markDoneFromLink(journey.id, activityId).ok ? "done" : "error";
  } catch (error) {
    if (!isAppError(error)) {
      log.error("link_done_failed", { message: "Falha ao marcar a atividade como feita pelo link do colaborador.", journeyId: journey.id, activityId, error });
    }
    return "error";
  }
}
