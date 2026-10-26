import "server-only";
import type { DetectionDTO } from "@/shared/contracts";
import type { Actor } from "@/server/engine";
import { getDetection, updateDetection, type DetectionRow } from "../../db/repos/detections";
import { getTrigger, type TriggerRow } from "../../db/repos/triggers";
import { AppError } from "../../errors";
import { auditAs } from "../audit";

const detectionNotFound = () => new AppError("NOT_FOUND", "Não encontramos esta detecção.", 404);

export function toDetectionDTO(row: DetectionRow, trigger: TriggerRow | null): DetectionDTO {
  return {
    id: row.id,
    triggerId: row.triggerId,
    triggerName: trigger?.name ?? "Gatilho removido",
    journeyKind: trigger?.journeyKind ?? "onboarding",
    templateId: trigger?.templateId ?? "",
    entityTypeId: row.entityTypeId,
    entityId: row.entityId,
    title: row.title,
    personName: row.personName,
    personEmail: row.personEmail,
    bitrixUserId: row.bitrixUserId,
    suggestedDate: row.suggestedDate,
    crmUrl: row.crmUrl,
    detectedAt: row.detectedAt,
    status: row.status,
  };
}

/** Detecção para pré-preencher o assistente de nova jornada. */
export function getDetectionDTO(id: string): DetectionDTO {
  const row = getDetection(id);
  if (!row) throw detectionNotFound();
  return toDetectionDTO(row, getTrigger(row.triggerId));
}

export function dismissDetection(id: string, actor: Actor): { ok: true } {
  const row = getDetection(id);
  if (!row) throw detectionNotFound();
  if (row.status === "started") throw new AppError("ALREADY_STARTED", "Esta detecção já virou jornada.", 409);
  if (row.status === "pending") {
    updateDetection(id, { status: "dismissed" });
    auditAs(actor, "Detecção dispensada", "trigger", row.triggerId, row.title);
  }
  return { ok: true };
}
