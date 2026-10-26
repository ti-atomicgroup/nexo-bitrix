import "server-only";
import { getDb } from "..";
import { newId, nowIso, parseJson, toStringOrNull } from "./util";

export type JobStatus = "queued" | "running" | "done" | "failed";

export interface JobRow {
  id: string;
  kind: string;
  dedupeKey: string | null;
  payload: Record<string, unknown>;
  runAt: string;
  attempts: number;
  lastError: string | null;
  status: JobStatus;
  createdAt: string;
  updatedAt: string;
}

function map(row: Record<string, unknown>): JobRow {
  return {
    id: String(row.id),
    kind: String(row.kind),
    dedupeKey: toStringOrNull(row.dedupe_key),
    payload: parseJson<Record<string, unknown>>(row.payload, {}),
    runAt: String(row.run_at),
    attempts: Number(row.attempts),
    lastError: toStringOrNull(row.last_error),
    status: row.status as JobStatus,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

/**
 * Enfileira um job. Com `dedupeKey`: se já existe concluído ou falho, volta para a fila;
 * se está na fila, antecipa o horário quando o novo for mais cedo; se está rodando, mantém.
 */
export function enqueueJob(input: { kind: string; payload?: Record<string, unknown>; dedupeKey?: string | null; runAt?: string }): JobRow {
  const db = getDb();
  const now = nowIso();
  const runAt = input.runAt ?? now;
  const payload = JSON.stringify(input.payload ?? {});
  return db.tx(() => {
    if (input.dedupeKey) {
      const existing = db.prepare("SELECT * FROM jobs WHERE dedupe_key = ?").get(input.dedupeKey);
      if (existing) {
        const job = map(existing);
        if (job.status === "done" || job.status === "failed") {
          db.prepare("UPDATE jobs SET status = 'queued', attempts = 0, last_error = NULL, run_at = ?, payload = ?, updated_at = ? WHERE id = ?").run(runAt, payload, now, job.id);
        } else if (job.status === "queued" && runAt < job.runAt) {
          db.prepare("UPDATE jobs SET run_at = ?, payload = ?, updated_at = ? WHERE id = ?").run(runAt, payload, now, job.id);
        }
        return map(db.prepare("SELECT * FROM jobs WHERE id = ?").get(job.id)!);
      }
    }
    const id = newId();
    db.prepare("INSERT INTO jobs (id, kind, dedupe_key, payload, run_at, attempts, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, 'queued', ?, ?)").run(
      id,
      input.kind,
      input.dedupeKey ?? null,
      payload,
      runAt,
      now,
      now,
    );
    return map(db.prepare("SELECT * FROM jobs WHERE id = ?").get(id)!);
  });
}

/** Pega os jobs vencidos (até `limit`) e os marca como em execução, numa transação. */
export function takeDueJobs(now = nowIso(), limit = 20): JobRow[] {
  const db = getDb();
  return db.tx(() => {
    const due = db.prepare("SELECT * FROM jobs WHERE status = 'queued' AND run_at <= ? ORDER BY run_at LIMIT ?").all(now, limit).map(map);
    const mark = db.prepare("UPDATE jobs SET status = 'running', updated_at = ? WHERE id = ?");
    for (const job of due) mark.run(now, job.id);
    return due.map((job) => ({ ...job, status: "running" as const }));
  });
}

export function completeJob(id: string): void {
  getDb().prepare("UPDATE jobs SET status = 'done', last_error = NULL, updated_at = ? WHERE id = ?").run(nowIso(), id);
}

/** Registra a falha; com `retryAt` volta para a fila, sem ele fica como falha definitiva. */
export function failJob(id: string, error: string, retryAt: string | null): void {
  getDb()
    .prepare("UPDATE jobs SET attempts = attempts + 1, last_error = ?, status = ?, run_at = COALESCE(?, run_at), updated_at = ? WHERE id = ?")
    .run(error.slice(0, 500), retryAt ? "queued" : "failed", retryAt, nowIso(), id);
}

/** Jobs presos em "running" por um processo que caiu voltam para a fila. */
export function requeueStuckJobs(olderThan: string): number {
  return getDb().prepare("UPDATE jobs SET status = 'queued', updated_at = ? WHERE status = 'running' AND updated_at < ?").run(nowIso(), olderThan).changes;
}

export function countJobs(status: JobStatus): number {
  return Number(getDb().prepare("SELECT COUNT(*) AS total FROM jobs WHERE status = ?").get<{ total: number }>(status)?.total ?? 0);
}

export function purgeDoneJobs(olderThan: string): number {
  return getDb().prepare("DELETE FROM jobs WHERE status = 'done' AND updated_at < ?").run(olderThan).changes;
}
