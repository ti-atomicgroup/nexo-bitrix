import "server-only";
import type { DetectionStatus } from "@/shared/enums";
import { getDb } from "..";
import { buildSet, newId, nowIso, toStringOrNull } from "./util";

export interface DetectionRow {
  id: string;
  triggerId: string;
  entityTypeId: number;
  entityId: number;
  title: string;
  personName: string | null;
  personEmail: string | null;
  bitrixUserId: string | null;
  suggestedDate: string | null;
  crmUrl: string | null;
  status: DetectionStatus;
  journeyId: string | null;
  detectedAt: string;
}

const COLUMNS = { status: "status", journeyId: "journey_id", personName: "person_name", personEmail: "person_email", suggestedDate: "suggested_date" };

function map(row: Record<string, unknown>): DetectionRow {
  return {
    id: String(row.id),
    triggerId: String(row.trigger_id),
    entityTypeId: Number(row.entity_type_id),
    entityId: Number(row.entity_id),
    title: String(row.title),
    personName: toStringOrNull(row.person_name),
    personEmail: toStringOrNull(row.person_email),
    bitrixUserId: toStringOrNull(row.bitrix_user_id),
    suggestedDate: toStringOrNull(row.suggested_date),
    crmUrl: toStringOrNull(row.crm_url),
    status: row.status as DetectionStatus,
    journeyId: toStringOrNull(row.journey_id),
    detectedAt: String(row.detected_at),
  };
}

/** Uma detecção por (gatilho, registro): reenvios e voltas de etapa não duplicam. Devolve a nova linha ou null se já existia. */
export function insertDetectionIfNew(input: Omit<DetectionRow, "id" | "status" | "journeyId" | "detectedAt">): DetectionRow | null {
  const id = newId();
  const result = getDb()
    .prepare(`
      INSERT INTO detections (id, trigger_id, entity_type_id, entity_id, title, person_name, person_email, bitrix_user_id, suggested_date, crm_url, status, detected_at)
      VALUES (@id, @triggerId, @entityTypeId, @entityId, @title, @personName, @personEmail, @bitrixUserId, @suggestedDate, @crmUrl, 'pending', @now)
      ON CONFLICT(trigger_id, entity_type_id, entity_id) DO NOTHING`)
    .run({ ...input, id, now: nowIso() });
  return result.changes > 0 ? getDetection(id) : null;
}

export function listDetections(filter: { status?: DetectionStatus } = {}): DetectionRow[] {
  return getDb()
    .prepare(`SELECT * FROM detections ${filter.status ? "WHERE status = ?" : ""} ORDER BY detected_at DESC`)
    .all(...(filter.status ? [filter.status] : []))
    .map(map);
}

export function getDetection(id: string): DetectionRow | null {
  const row = getDb().prepare("SELECT * FROM detections WHERE id = ?").get(id);
  return row ? map(row) : null;
}

export function updateDetection(id: string, patch: Partial<Pick<DetectionRow, keyof typeof COLUMNS>>): DetectionRow | null {
  const { sql, params } = buildSet(patch, COLUMNS);
  if (sql) getDb().prepare(`UPDATE detections SET ${sql} WHERE id = @id`).run({ ...params, id });
  return getDetection(id);
}
