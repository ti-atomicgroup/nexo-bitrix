import "server-only";
import { bitrixActorFacts } from "@/server/engine";
import { operationRule, type Operation } from "@/shared/permissions";
import { isBitrixError } from "../bitrix/errors";
import { audit } from "../db/repos/audit";
import { findActivePeopleByEmail, findPersonByBitrixId } from "../db/repos/people";
import { getProject, getWebhookRecord } from "../db/repos/settings";
import { updateUser, type AppUserRow } from "../db/repos/users";
import { AppError, isAppError } from "../errors";
import { log } from "../log";

/**
 * Validação equivalente às permissões individuais do Bitrix24. O Nexo fala com o portal por um webhook só (a conta técnica),
 * então, antes de agir por alguém do RH, ele confere no servidor que essa pessoa poderia estar ali:
 * - a conta do Nexo está ligada a uma pessoa do portal;
 * - essa conta segue ativa no Bitrix24 (consulta ao portal, com poucos minutos de cache);
 * - para gravar, ela participa do projeto privado onde as tarefas moram.
 * A administração não passa por aqui: é ela quem conecta o webhook e responde pela conta técnica. Modelo em docs/permissoes.md.
 */
const EQUIPE_HINT = "Peça à administração para conferir em Ajustes, na seção Equipe.";

/** Conta ligada à pessoa; sem vínculo, liga sozinha quando exatamente uma pessoa ativa do portal tem o mesmo e-mail. */
function linkedBitrixId(user: AppUserRow): string | null {
  if (user.bitrixUserId) return findPersonByBitrixId(user.bitrixUserId) ? user.bitrixUserId : null;
  const matches = findActivePeopleByEmail(user.email);
  const only = matches.length === 1 ? matches[0]?.bitrixUserId : null;
  if (!only) return null;
  updateUser(user.id, { bitrixUserId: only });
  audit({
    actorType: "system",
    action: "Conta do Bitrix24 vinculada",
    entity: "user",
    entityId: user.id,
    detail: { text: `${user.name} foi ligado a ${matches[0]?.name} (Bitrix24 #${only}), pelo e-mail.` },
  });
  return only;
}

/** Recusa com a próxima providência. Devolve o usuário como ficou (a conta pode ter sido vinculada agora). */
export async function assertBitrixAccess(user: AppUserRow, operation: Operation): Promise<AppUserRow> {
  const { bitrix } = operationRule(operation);
  if (bitrix === "none" || user.role === "admin") return user;
  // Sem webhook nada chega ao Bitrix24: quem precisa dele dá o próprio erro adiante.
  if (!getWebhookRecord()) return user;

  const bitrixUserId = linkedBitrixId(user);
  if (!bitrixUserId) {
    throw new AppError("BITRIX_ACCOUNT_REQUIRED", `Seu acesso ao Nexo ainda não está ligado a uma pessoa do Bitrix24. ${EQUIPE_HINT}`, 403);
  }
  const project = bitrix === "write" ? getProject() : null;
  let facts: { active: boolean; member: boolean };
  try {
    facts = await bitrixActorFacts(bitrixUserId, { membership: Boolean(project) });
  } catch (error) {
    if (isAppError(error) && !isBitrixError(error)) throw error;
    log.warn("bitrix_access_unverified", { operation, error });
    throw new AppError("BITRIX_ACCESS_UNVERIFIED", "Não deu para conferir sua permissão no Bitrix24 agora. Tente de novo em instantes.", 503);
  }
  if (!facts.active) throw new AppError("BITRIX_ACCOUNT_INACTIVE", `Sua conta está desativada no Bitrix24. ${EQUIPE_HINT}`, 403);
  if (project && !facts.member) {
    throw new AppError("BITRIX_PROJECT_REQUIRED", `Você não participa do projeto “${project.name}” no Bitrix24, onde ficam as tarefas. ${EQUIPE_HINT}`, 403);
  }
  return user.bitrixUserId === bitrixUserId ? user : { ...user, bitrixUserId };
}
