import "server-only";
import { isBitrixError } from "../bitrix/errors";
import { findUserByEmail, inviteUser, userDepartments } from "../bitrix/methods";
import { listActivities, updateActivity } from "../db/repos/activities";
import { audit } from "../db/repos/audit";
import { enqueueJob } from "../db/repos/jobs";
import { getJourney, listJourneys } from "../db/repos/journeys";
import { findPerson, linkPersonToBitrix, setPersonInvite, type PersonRow } from "../db/repos/people";
import { getWebhookRecord } from "../db/repos/settings";
import { getDb } from "../db";
import { AppError } from "../errors";
import { JOB_KINDS } from "./queue";
import { enqueuePushes } from "./release";
import type { EngineContext } from "./runtime";

/**
 * Conta do Bitrix24 da pessoa: vínculo com uma conta que já existe ou convite (`user.add`) para quem ainda não tem.
 * O convite precisa da permissão Usuários (user) no webhook e de um dono do webhook administrador do portal.
 */
export function invitesEnabled(scopes: string[] = getWebhookRecord()?.scopes ?? []): boolean {
  return scopes.includes("user");
}

export const INVITE_SCOPE_MESSAGE = "Para convidar pelo Nexo, o webhook precisa da permissão Usuários (user). Edite o webhook no Bitrix24 e conecte de novo em Ajustes.";
const INVITE_DENIED_MESSAGE = "O Bitrix24 negou o convite: a conta dona do webhook precisa ser administradora do portal. Convide a pessoa pelo Bitrix24 e vincule a conta aqui.";
const INVITE_INACTIVE_MESSAGE = "Já existe uma conta desativada com este e-mail no Bitrix24. Reative-a no Bitrix24 e vincule a conta aqui.";
const DENIED_CODES = new Set(["ACCESS_DENIED", "ERROR_ACCESS_DENIED", "insufficient_scope", "INSUFFICIENT_SCOPE", "user_access_error"]);

/** Liga a pessoa à conta do Bitrix24 e passa para ela as tarefas do colaborador ainda abertas, em todas as jornadas em andamento. */
export function attachBitrixAccount(personId: string, bitrixUserId: string): PersonRow {
  return getDb().tx(() => {
    const linked = linkPersonToBitrix(personId, bitrixUserId);
    setPersonInvite(linked.id, null);
    for (const journey of listJourneys({ personId: linked.id, status: ["active", "paused"] })) {
      for (const activity of listActivities(journey.id)) {
        if (activity.role === "colaborador" && !activity.assigneeBitrixId && activity.status !== "done" && activity.status !== "cancelled") {
          updateActivity(activity.id, { assigneeBitrixId: bitrixUserId, assigneeName: linked.name });
        }
      }
    }
    enqueuePushes();
    return linked;
  });
}

/** Põe o convite na fila (um por pessoa; pedir de novo depois de uma falha reenvia). */
export function requestInvite(personId: string, email: string, journeyId: string): void {
  setPersonInvite(personId, { status: "sending", email });
  enqueueJob({ kind: JOB_KINDS.personInvite, dedupeKey: `person.invite:${personId}`, payload: { personId, journeyId } });
}

export function markInviteFailed(personId: string, message: string): void {
  if (findPerson(personId)?.bitrixUserId) return;
  setPersonInvite(personId, { status: "failed", error: message });
}

/**
 * Procura a conta pelo e-mail antes de convidar: cobre a pessoa que já tinha conta e a resposta incerta
 * de uma tentativa anterior (o Bitrix24 criou a conta, mas a resposta não chegou), sem convite duplicado.
 */
export async function handlePersonInvite(payload: Record<string, unknown>, ctx: EngineContext): Promise<void> {
  const person = findPerson(String(payload.personId ?? ""));
  if (!person || person.bitrixUserId || person.inviteStatus !== "sending") return;
  if (!invitesEnabled(ctx.scopes)) throw new AppError("INVITE_SCOPE", INVITE_SCOPE_MESSAGE, 409);
  const email = person.email;
  if (!email) throw new AppError("INVITE_EMAIL", "Informe o e-mail da pessoa para enviar o convite.", 422);
  const journey = getJourney(String(payload.journeyId ?? ""));

  let accountId: string;
  let invited = false;
  const existing = await findUserByEmail(ctx.client, email);
  if (existing) {
    if (!existing.active) throw new AppError("INVITE_INACTIVE", INVITE_INACTIVE_MESSAGE, 409);
    accountId = existing.bitrixUserId;
  } else {
    const gestor = journey?.participants.gestor?.bitrixUserId;
    const departments = (gestor ? await userDepartments(ctx.client, gestor) : []).concat(await userDepartments(ctx.client, ctx.ownerId));
    const departmentId = departments[0];
    if (!departmentId) throw new AppError("INVITE_DEPARTMENT", "Não encontramos um departamento no Bitrix24 para a pessoa convidada. Convide-a pelo Bitrix24 e vincule a conta aqui.", 422);
    try {
      accountId = await inviteUser(ctx.client, { email, name: person.name, departmentId });
    } catch (error) {
      if (isBitrixError(error) && !error.retryable && DENIED_CODES.has(error.code)) throw new AppError("INVITE_DENIED", INVITE_DENIED_MESSAGE, 403);
      throw error;
    }
    invited = true;
  }

  const linked = attachBitrixAccount(person.id, accountId);
  if (journey) {
    audit({
      actorType: "system",
      action: invited ? "Convite enviado pelo Bitrix24" : "Conta do Bitrix24 vinculada",
      entity: "journey",
      entityId: journey.id,
      detail: {
        text: invited
          ? `O Bitrix24 convidou ${linked.name} pelo e-mail ${email}; as tarefas do colaborador já vão para a conta nova.`
          : `${linked.name} já tinha conta no Bitrix24 com o e-mail ${email}; a conta foi vinculada.`,
      },
    });
  }
}
