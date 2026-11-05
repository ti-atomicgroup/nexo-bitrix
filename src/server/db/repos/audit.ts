import "server-only";
import type { AuditEntryDTO } from "@/shared/contracts";
import { getDb } from "..";
import { openField, sealField } from "../../security/fields";
import { getWebhookRecord } from "./settings";
import { nowIso, parseJson, toStringOrNull } from "./util";

export interface AuditInput {
  actorType: "user" | "system" | "link";
  actorId?: string | null;
  actorName?: string | null;
  /** Frase curta em pt-BR, pronta para o histórico (ex.: "Jornada iniciada"). */
  action: string;
  entity?: "journey" | "activity" | "template" | "settings" | "user" | "ledger" | "trigger" | "privacy" | null;
  entityId?: string | null;
  /** `text` aparece no histórico; o restante fica para diagnóstico. Nunca inclua segredos. */
  detail?: { text?: string } & Record<string, unknown>;
}

/**
 * Cada linha registra o ator local, a conta dele no Bitrix24 e o principal: a conta dona do webhook, com que o Nexo age no
 * portal naquele momento. O texto fica cifrado no banco porque costuma citar motivo, e-mail e itens do inventário.
 */
export function audit(input: AuditInput): void {
  const db = getDb();
  const principal = getWebhookRecord()?.owner ?? null;
  const actorBitrixId =
    input.actorType === "user" && input.actorId
      ? toStringOrNull(db.prepare("SELECT bitrix_user_id FROM app_users WHERE id = ?").get<{ bitrix_user_id: unknown }>(input.actorId)?.bitrix_user_id)
      : null;
  const detail = JSON.stringify(input.detail ?? {});
  db.prepare(
    "INSERT INTO audit_log (at, actor_type, actor_id, actor_name, actor_bitrix_id, bitrix_principal_id, bitrix_principal_name, action, entity, entity_id, detail) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  ).run(
    nowIso(),
    input.actorType,
    input.actorId ?? null,
    input.actorName ?? null,
    actorBitrixId,
    principal?.bitrixUserId ?? null,
    principal?.name ?? null,
    input.action,
    input.entity ?? null,
    input.entityId ?? null,
    detail === "{}" ? detail : sealField(detail),
  );
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
    .map((row) => {
      const principalId = toStringOrNull(row.bitrix_principal_id);
      const principalName = toStringOrNull(row.bitrix_principal_name);
      return {
        at: String(row.at),
        actor: actorLabel(String(row.actor_type), toStringOrNull(row.actor_name)),
        action: String(row.action),
        detail: parseJson<{ text?: string }>(openField(row.detail), {}).text ?? "",
        via: principalId && principalName ? `${principalName} (Bitrix24 #${principalId})` : null,
        actorBitrixId: toStringOrNull(row.actor_bitrix_id),
      };
    });
}
