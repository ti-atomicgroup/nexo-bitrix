import type { JourneyDTO } from "@/shared/contracts";
import { collaboratorPendingItems } from "@/shared/collaborator-pending";
import type { JourneyKind } from "@/shared/enums";

/** O que falta do lado do colaborador (só os nomes), para o lembrete por WhatsApp ou e-mail. */
export function collaboratorPending(journey: JourneyDTO): string[] {
  return collaboratorPendingItems(journey).map((item) => item.label);
}

/** Mensagem de lembrete pronta para WhatsApp ou e-mail. Com o link recém-criado, ele vai junto. */
export function reminderMessage(kind: JourneyKind, firstName: string, items: string[], link: string | null): string {
  const list = items.map((item) => `• ${item}`).join("\n");
  const where = link ? `É só abrir o seu link pessoal: ${link}` : "É só abrir o seu link pessoal do Nexo, o mesmo que enviamos antes.";
  return kind === "onboarding"
    ? `Oi, ${firstName}! Passando para lembrar o que falta para a sua chegada:\n${list}\n${where} Qualquer dúvida, fale com o RH.`
    : `Olá, ${firstName}. Para concluir a sua saída, ainda falta:\n${list}\n${where} Qualquer dúvida, fale com o RH.`;
}
