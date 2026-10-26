import "server-only";
import type { TriggerDTO, TriggerFieldMap } from "@/shared/contracts";
import type { JourneyKind } from "@/shared/enums";
import type { TriggerInput } from "@/shared/schemas";
import { getDb } from "..";
import { buildSet, newId, nowIso, parseJson, toBool, toNumberOrNull, toStringOrNull } from "./util";

export interface TriggerRow extends TriggerDTO {
  /** Último ID de crm.stagehistory já processado. Começa no maior ID existente para não reprocessar o passado. */
  cursor: number | null;
  createdAt: string;
  updatedAt: string;
}

const COLUMNS = {
  name: "name",
  journeyKind: "journey_kind",
  entityTypeId: "entity_type_id",
  categoryId: "category_id",
  stageId: "stage_id",
  stageName: "stage_name",
  sourceName: "source_name",
  templateId: "template_id",
  fieldMap: "field_map",
  enabled: "enabled",
  cursor: "cursor",
  lastRunAt: "last_run_at",
  lastError: "last_error",
};

function map(row: Record<string, unknown>): TriggerRow {
  return {
    id: String(row.id),
    name: String(row.name),
    journeyKind: row.journey_kind as JourneyKind,
    entityTypeId: Number(row.entity_type_id),
    categoryId: toNumberOrNull(row.category_id),
    stageId: String(row.stage_id),
    stageName: toStringOrNull(row.stage_name),
    sourceName: toStringOrNull(row.source_name),
    templateId: String(row.template_id),
    fieldMap: parseJson<TriggerFieldMap>(row.field_map, {}),
    enabled: toBool(row.enabled),
    cursor: toNumberOrNull(row.cursor),
    lastRunAt: toStringOrNull(row.last_run_at),
    lastError: toStringOrNull(row.last_error),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export function listTriggers(options: { enabledOnly?: boolean } = {}): TriggerRow[] {
  return getDb()
    .prepare(`SELECT * FROM triggers ${options.enabledOnly ? "WHERE enabled = 1" : ""} ORDER BY name COLLATE NOCASE`)
    .all()
    .map(map);
}

export function getTrigger(id: string): TriggerRow | null {
  const row = getDb().prepare("SELECT * FROM triggers WHERE id = ?").get(id);
  return row ? map(row) : null;
}

export function createTrigger(input: TriggerInput & { stageName?: string | null; sourceName?: string | null; cursor?: number | null }): TriggerRow {
  const id = newId();
  const now = nowIso();
  getDb()
    .prepare(`
      INSERT INTO triggers (id, name, journey_kind, entity_type_id, category_id, stage_id, stage_name, source_name, template_id, field_map, enabled, cursor, created_at, updated_at)
      VALUES (@id, @name, @journeyKind, @entityTypeId, @categoryId, @stageId, @stageName, @sourceName, @templateId, @fieldMap, @enabled, @cursor, @now, @now)`)
    .run({
      id,
      name: input.name,
      journeyKind: input.journeyKind,
      entityTypeId: input.entityTypeId,
      categoryId: input.categoryId,
      stageId: input.stageId,
      stageName: input.stageName ?? null,
      sourceName: input.sourceName ?? null,
      templateId: input.templateId,
      fieldMap: JSON.stringify(input.fieldMap ?? {}),
      enabled: input.enabled ?? true,
      cursor: input.cursor ?? null,
      now,
    });
  return getTrigger(id)!;
}

export function updateTrigger(id: string, patch: Partial<Pick<TriggerRow, keyof typeof COLUMNS>>): TriggerRow | null {
  const { sql, params } = buildSet(patch, COLUMNS);
  getDb()
    .prepare(`UPDATE triggers SET ${sql ? `${sql}, ` : ""}updated_at = @updatedAt WHERE id = @id`)
    .run({ ...params, updatedAt: nowIso(), id });
  return getTrigger(id);
}

export function deleteTrigger(id: string): boolean {
  return getDb().prepare("DELETE FROM triggers WHERE id = ?").run(id).changes > 0;
}

export function toTriggerDTO(row: TriggerRow): TriggerDTO {
  return {
    id: row.id,
    name: row.name,
    journeyKind: row.journeyKind,
    entityTypeId: row.entityTypeId,
    categoryId: row.categoryId,
    stageId: row.stageId,
    stageName: row.stageName,
    sourceName: row.sourceName,
    templateId: row.templateId,
    fieldMap: row.fieldMap,
    enabled: row.enabled,
    lastRunAt: row.lastRunAt,
    lastError: row.lastError,
  };
}
