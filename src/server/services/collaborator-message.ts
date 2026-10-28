import "server-only";
import { collaboratorPendingItems, type PendingItem } from "@/shared/collaborator-pending";
import type { JourneyKind } from "@/shared/enums";
import type { CollaboratorMessageInput } from "@/shared/schemas";
import { sendChatMessage, type Actor } from "@/server/engine";
import { isBitrixError } from "../bitrix/errors";
import { listAudit } from "../db/repos/audit";
import { getJourney } from "../db/repos/journeys";
import { findPerson } from "../db/repos/people";
import { getCompany, getWebhookRecord } from "../db/repos/settings";
import { AppError } from "../errors";
import { auditAs } from "./audit";
import { journeyForToken } from "./collaborator";
import { buildJourneyDTO, journeyNotFound } from "./read/journeys";
import { runningTask, startTask } from "./tasks";

/**
 * Mensagem no chat do Bitrix24 com a pessoa da jornada, pedida pelo RH na aba do link: o link recém-criado
 * (o Nexo só guarda o hash, então ele vem da tela e é conferido) ou o lembrete do que falta, com atalho para cada tarefa.
 * Confere tudo na hora e envia em segundo plano (202). Sem reenvio automático: resposta incerta pede conferência no chat.
 */
export const LINK_SENT_ACTION = "Link enviado pelo Bitrix24";
export const REMINDER_SENT_ACTION = "Lembrete enviado pelo Bitrix24";
const REMINDER_INTERVAL_MS = 60 * 60 * 1000;

const firstNameOf = (name: string) => name.trim().split(/\s+/)[0] ?? name;
/** Colchetes viram BBCode no chat do Bitrix24: fora dos textos que vêm da trilha. */
const plain = (value: string) => value.replace(/[[\]]/g, "");

export function linkChatMessage(kind: JourneyKind, firstName: string, company: string, url: string): string {
  return kind === "onboarding"
    ? `Olá, ${firstName}! Este é o seu link pessoal para acompanhar a sua chegada à ${company}:\n${url}\nNele você vê o que fazer, quem procurar e o que levar.`
    : `Olá, ${firstName}. Este é o seu link pessoal com as informações da sua saída da ${company}:\n${url}`;
}

export function reminderChatMessage(kind: JourneyKind, firstName: string, items: PendingItem[]): string {
  const list = items.map((item) => (item.taskUrl ? `• [URL=${item.taskUrl}]${plain(item.label)}[/URL]` : `• ${plain(item.label)}`)).join("\n");
  const hint = items.some((item) => item.taskUrl) ? "Clique no item para abrir a tarefa aqui no Bitrix24. " : "";
  return kind === "onboarding"
    ? `Oi, ${firstName}! Passando para lembrar o que falta para a sua chegada:\n${list}\n${hint}Qualquer dúvida, fale com o RH.`
    : `Olá, ${firstName}. Para concluir a sua saída, ainda falta:\n${list}\n${hint}Qualquer dúvida, fale com o RH.`;
}

function remindedRecently(journeyId: string, now: number): boolean {
  return listAudit({ entity: "journey", entityId: journeyId, limit: 100 }).some(
    (entry) => entry.action === REMINDER_SENT_ACTION && now - Date.parse(entry.at) < REMINDER_INTERVAL_MS,
  );
}

/** Confere e começa o envio; devolve o id do trabalho (dois cliques seguidos acompanham o mesmo envio). */
export function sendCollaboratorMessage(journeyId: string, input: CollaboratorMessageInput, actor: Actor): string {
  const journey = getJourney(journeyId);
  if (!journey) throw journeyNotFound();
  if (journey.status !== "active" && journey.status !== "paused") throw new AppError("JOURNEY_CLOSED", "Esta jornada já foi encerrada.", 409);
  const person = findPerson(journey.personId);
  const first = firstNameOf(person?.name ?? "A pessoa");
  const userId = person?.bitrixUserId;
  if (!userId) {
    throw new AppError("PERSON_WITHOUT_ACCOUNT", `${first} ainda não tem conta no Bitrix24. Vincule ou convide a conta na página da jornada.`, 409);
  }
  if (!(getWebhookRecord()?.scopes ?? []).includes("im")) {
    throw new AppError("CHAT_SCOPE", "Para enviar pelo Bitrix24, o webhook precisa da permissão Bate-papo e notificações (im).", 409);
  }

  const kindKey = `collaborator.message:${input.kind}:${journey.id}`;
  const running = runningTask(kindKey);
  if (running) return running;

  let message: string;
  if (input.kind === "link") {
    const token = new URL(input.url).pathname.match(/^\/j\/([^/]+)$/)?.[1] ?? "";
    if (journeyForToken(token, Date.now())?.id !== journey.id) {
      throw new AppError("LINK_INVALID", "Este não é o link ativo desta jornada. Gere um novo link e envie.", 422);
    }
    message = linkChatMessage(journey.kind, first, getCompany().name || "a empresa", input.url);
  } else {
    if (remindedRecently(journey.id, Date.now())) {
      throw new AppError("REMINDER_TOO_SOON", `${first} recebeu um lembrete pelo Bitrix24 há menos de 1 hora. Espere um pouco antes de lembrar de novo.`, 429);
    }
    const items = collaboratorPendingItems(buildJourneyDTO(journey.id));
    if (!items.length) throw new AppError("NOTHING_PENDING", `Não há nada pendente do lado de ${first}.`, 409);
    message = reminderChatMessage(journey.kind, first, items);
  }

  return startTask(kindKey, async () => {
    try {
      await sendChatMessage(userId, message);
    } catch (error) {
      if (isBitrixError(error) && error.uncertain) {
        throw new AppError("MESSAGE_UNCERTAIN", `O Bitrix24 não confirmou o envio. Confira o chat com ${first} antes de enviar de novo.`, 504);
      }
      throw error;
    }
    auditAs(
      actor,
      input.kind === "link" ? LINK_SENT_ACTION : REMINDER_SENT_ACTION,
      "journey",
      journey.id,
      input.kind === "link" ? `O link pessoal foi enviado no chat do Bitrix24 de ${first}.` : `${first} recebeu no chat do Bitrix24 o lembrete do que falta.`,
    );
    return { sent: true as const };
  });
}
