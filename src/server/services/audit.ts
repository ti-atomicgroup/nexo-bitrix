import "server-only";
import { z } from "zod";
import type { AuditEntryDTO } from "@/shared/contracts";
import type { Actor } from "@/server/engine";
import { audit, listAudit, type AuditInput } from "../db/repos/audit";
import { blankAsUndefined } from "../http/input";

type AuditEntity = NonNullable<AuditInput["entity"]>;

/** Registra uma ação de quem a executou. `text` aparece no histórico; nunca inclua segredos. */
export function auditAs(actor: Actor, action: string, entity: AuditEntity, entityId: string | null, text?: string): void {
  audit({ actorType: actor.type, actorId: actor.id, actorName: actor.name, action, entity, entityId, detail: text ? { text } : {} });
}

export const auditQueryInput = z.object({
  limit: z.preprocess(blankAsUndefined, z.coerce.number().int().min(1).max(200).default(50)),
});

/** Registro de atividades (Ajustes): mais recentes primeiro. */
export function recentAudit(limit: number): AuditEntryDTO[] {
  return listAudit({ limit });
}
