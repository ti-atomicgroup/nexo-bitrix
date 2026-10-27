import "server-only";
import type { TaskStatusDTO } from "@/shared/contracts";
import { AppError } from "../errors";
import { newToken } from "../security/crypto";

/**
 * Trabalho demorado pedido pelo navegador (ex.: conferir o webhook no Bitrix24). Como a Onnira pede, a rota responde
 * 202 com o id na hora e a tela consulta GET /api/tasks/:taskId em chamadas curtas, sem segurar a requisição no gateway.
 * Fica na memória do processo: o id é aleatório (256 bits), vale 15 minutos e o resultado é entregue uma vez só.
 */
const TTL_MS = 15 * 60 * 1000;
const TASKS_KEY = Symbol.for("nexo.tasks");

interface Task {
  kind: string;
  startedAt: number;
  state: "running" | "done" | "failed";
  result?: unknown;
  error?: unknown;
}

type TasksGlobal = typeof globalThis & { [TASKS_KEY]?: Map<string, Task> };

function store(): Map<string, Task> {
  const global = globalThis as TasksGlobal;
  return (global[TASKS_KEY] ??= new Map());
}

function sweep(now: number): void {
  for (const [id, task] of store()) if (now - task.startedAt > TTL_MS) store().delete(id);
}

/** Começa o trabalho sem esperar por ele e devolve o id para a consulta. */
export function startTask(kind: string, work: () => Promise<unknown>): string {
  const now = Date.now();
  sweep(now);
  const id = newToken();
  const task: Task = { kind, startedAt: now, state: "running" };
  store().set(id, task);
  Promise.resolve()
    .then(work)
    .then(
      (result) => {
        task.state = "done";
        task.result = result;
      },
      (error: unknown) => {
        task.state = "failed";
        task.error = error;
      },
    );
  return id;
}

/** Id de um trabalho deste tipo ainda em andamento (ex.: dois cliques em "Preparar" acompanham o mesmo). */
export function runningTask(kind: string): string | null {
  sweep(Date.now());
  for (const [id, task] of store()) if (task.kind === kind && task.state === "running") return id;
  return null;
}

/** Resposta 202 com o id do trabalho. */
export function taskStarted(taskId: string): Response {
  return Response.json({ taskId }, { status: 202 });
}

/**
 * Situação do trabalho. Terminado, entrega o resultado e esquece o trabalho; com falha, lança o mesmo erro, que a rota
 * devolve com o status e a mensagem de sempre (ex.: 422 com as permissões que faltam no webhook).
 */
export function taskStatus(taskId: string): TaskStatusDTO {
  const task = store().get(taskId);
  if (!task || Date.now() - task.startedAt > TTL_MS) {
    throw new AppError("TASK_NOT_FOUND", "Esta etapa não está mais em andamento. Tente de novo.", 404);
  }
  if (task.state === "running") return { state: "running" };
  store().delete(taskId);
  if (task.state === "failed") throw task.error;
  return { state: "done", result: task.result };
}

export function resetTasksForTests(): void {
  store().clear();
}
