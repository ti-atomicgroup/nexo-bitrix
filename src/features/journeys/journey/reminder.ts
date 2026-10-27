import type { JourneyDTO } from "@/shared/contracts";
import type { JourneyKind } from "@/shared/enums";

/**
 * O que falta do lado do colaborador: documentos obrigatórios que ainda não chegaram (ou que o RH pediu de novo)
 * e as atividades dele em aberto, visíveis no link.
 */
export function collaboratorPending(journey: JourneyDTO): string[] {
  const items: string[] = [];
  for (const stage of journey.stages) {
    for (const activity of stage.activities) {
      if (activity.role !== "colaborador" || activity.visibility !== "employee") continue;
      if (activity.status !== "open" && activity.status !== "in_progress") continue;
      const documents = activity.documents ?? [];
      if (!documents.length) {
        items.push(activity.title);
        continue;
      }
      for (const document of documents) {
        if (!document.required || document.files.some((file) => !file.rejectedAt)) continue;
        items.push(document.files.length ? `${document.name} (pedimos de novo)` : document.name);
      }
    }
  }
  return items;
}

/** Mensagem de lembrete pronta para WhatsApp ou e-mail. Com o link recém-criado, ele vai junto. */
export function reminderMessage(kind: JourneyKind, firstName: string, items: string[], link: string | null): string {
  const list = items.map((item) => `• ${item}`).join("\n");
  const where = link ? `É só abrir o seu link pessoal: ${link}` : "É só abrir o seu link pessoal do Nexo, o mesmo que enviamos antes.";
  return kind === "onboarding"
    ? `Oi, ${firstName}! Passando para lembrar o que falta para a sua chegada:\n${list}\n${where} Qualquer dúvida, fale com o RH.`
    : `Olá, ${firstName}. Para concluir a sua saída, ainda falta:\n${list}\n${where} Qualquer dúvida, fale com o RH.`;
}
