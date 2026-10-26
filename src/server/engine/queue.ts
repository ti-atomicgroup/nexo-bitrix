import "server-only";
import { enqueueJob } from "../db/repos/jobs";

/**
 * Tipos de job. Toda escrita no Bitrix passa pela fila (o ciclo é o único escritor).
 * `activity.push` leva o estado local da atividade (situação e checklist) para a tarefa: cobre concluir, reabrir,
 * aprovar e marcar itens com uma única chave por atividade, então pedidos repetidos não se atropelam.
 */
export const JOB_KINDS = {
  taskCreate: "task.create",
  activityPush: "activity.push",
  taskComment: "task.comment",
  peopleRefresh: "people.refresh",
  notify: "notify",
  meetingCreate: "meeting.create",
  feedPost: "feed.post",
} as const;

/** Nomes do briefing que equivalem a `activity.push` (aceitos se alguém enfileirar por eles). */
export const PUSH_ALIASES = ["task.complete", "task.renew", "task.approve", "checklist.toggle"] as const;

/**
 * Enfileira um job de atividade (chave única por tipo e atividade). Se o job igual estiver rodando agora,
 * enfileira uma segunda passada: o handler lê o estado mais recente, então repetir é seguro.
 */
export function enqueueActivityJob(kind: string, activityId: string, options: { payload?: Record<string, unknown>; runAt?: string } = {}): void {
  const dedupeKey = `${kind}:${activityId}`;
  const payload = { activityId, ...options.payload };
  const job = enqueueJob({ kind, payload, dedupeKey, runAt: options.runAt });
  if (job.status === "running") enqueueJob({ kind, payload, dedupeKey: `${dedupeKey}:again`, runAt: options.runAt });
}
