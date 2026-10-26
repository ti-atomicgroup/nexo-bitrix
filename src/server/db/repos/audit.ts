import "server-only";
import type { AuditEntryDTO } from "@/shared/contracts";
import { getDb } from "..";
import { nowIso, parseJson, toStringOrNull } from "./util";

export interface AuditInput {
  actorType: "user" | "system" | "link";
  actorId?: string | null;
  actorName?: string | null;
  /** Frase curta em pt-BR, pronta para o histórico (ex.: "Jornada iniciada"). */
  action: string;
  entity?: "journey" | "activity" | "template" | "settings" | "user" | "ledger" | "trigger" | null;
  entityId?: string | null;
  /** `text` aparece no histórico; o restante fica para diagnóstico. Nunca inclua segredos. */
  detail?: { text?: string } & Record<string, unknown>;
}

export function audit(input: AuditInput): void {
  getDb()
    .prepare("INSERT INTO audit_log (at, actor_type, actor_id, actor_name, action, entity, entity_id, detail) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .run(nowIso(), input.actorType, input.actorId ?? null, input.actorName ?? null, input.action, input.entity ?? null, input.entityId ?? null, JSON.stringify(input.detail ?? {}));
}

function actorLabel(type: string, name: string | null): string {
  if (name) return name;
  if (type === "system") return "Nexo";
  if (type === "link") return "Colaborador (link)";
  return "RH";
}

export function listAudit(filter: { entity?: string; entityId?: string; limit?: number } = {}): AuditEntryDTO[] {
  const where: string[] = [];
  const params: Record<string, string | number> = { limit: Math.min(filter.limit ?? 50, 500) };
  if (filter.entity) {
    where.push("entity = @entity");
    params.entity = filter.entity;
  }
  if (filter.entityId) {
    where.push("entity_id = @entityId");
    params.entityId = filter.entityId;
  }
  return getDb()
    .prepare(`SELECT * FROM audit_log ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY id DESC LIMIT @limit`)
    .all(params)
    .map((row) => ({
      at: String(row.at),
      actor: actorLabel(String(row.actor_type), toStringOrNull(row.actor_name)),
      action: String(row.action),
      detail: parseJson<{ text?: string }>(row.detail, {}).text ?? "",
    }));
}
