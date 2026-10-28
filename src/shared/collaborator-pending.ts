import type { JourneyDTO } from "./contracts";

export interface PendingItem {
  label: string;
  /** Tarefa no Bitrix24 onde a pessoa resolve o item (null enquanto a tarefa não existe). */
  taskUrl: string | null;
}

/**
 * O que falta do lado do colaborador: documentos obrigatórios que ainda não chegaram (ou que o RH pediu de novo)
 * e as atividades dele em aberto, visíveis no link. Usado no lembrete da tela e no enviado pelo Bitrix24.
 */
export function collaboratorPendingItems(journey: JourneyDTO): PendingItem[] {
  const items: PendingItem[] = [];
  for (const stage of journey.stages) {
    for (const activity of stage.activities) {
      if (activity.role !== "colaborador" || activity.visibility !== "employee") continue;
      if (activity.status !== "open" && activity.status !== "in_progress") continue;
      const taskUrl = activity.bitrixUrl ?? null;
      const documents = activity.documents ?? [];
      if (!documents.length) {
        items.push({ label: activity.title, taskUrl });
        continue;
      }
      for (const document of documents) {
        if (!document.required || document.files.some((file) => !file.rejectedAt)) continue;
        items.push({ label: document.files.length ? `${document.name} (pedimos de novo)` : document.name, taskUrl });
      }
    }
  }
  return items;
}
