import "server-only";
import type { ChecklistTemplateItem, LinkItem, TemplateActivityDTO, TemplateDTO, TemplateStageDTO, TemplateSummaryDTO } from "@/shared/contracts";
import type { ActivityKind, ActivityRole, JourneyKind, OffsetUnit, ReleaseMode, Visibility } from "@/shared/enums";
import type { TemplateInput } from "@/shared/schemas";
import { getDb } from "..";
import { newId, nowIso, parseJson, toBool } from "./util";

interface TemplateRow {
  id: string;
  kind: JourneyKind;
  name: string;
  profile: string;
  description: string;
  version: number;
  archived: boolean;
  updatedAt: string;
}

function mapTemplate(row: Record<string, unknown>): TemplateRow {
  return {
    id: String(row.id),
    kind: row.kind as JourneyKind,
    name: String(row.name),
    profile: String(row.profile ?? ""),
    description: String(row.description ?? ""),
    version: Number(row.version),
    archived: toBool(row.archived),
    updatedAt: String(row.updated_at),
  };
}

function mapActivity(row: Record<string, unknown>): TemplateActivityDTO {
  return {
    id: String(row.id),
    position: Number(row.position),
    title: String(row.title),
    instructions: String(row.instructions ?? ""),
    kind: row.kind as ActivityKind,
    role: row.role as ActivityRole,
    dueOffsetDays: Number(row.due_offset_days),
    dueOffsetUnit: row.due_offset_unit as OffsetUnit,
    dueTime: String(row.due_time),
    required: toBool(row.required),
    visibility: row.visibility as Visibility,
    requiresApproval: toBool(row.requires_approval),
    ledgerRole: row.ledger_role === "revoke_and_collect" ? "revoke_and_collect" : null,
    checklist: parseJson<ChecklistTemplateItem[]>(row.checklist, []),
    links: parseJson<LinkItem[]>(row.links, []),
  };
}

function loadStages(templateId: string): TemplateStageDTO[] {
  const db = getDb();
  const stages = db.prepare("SELECT * FROM template_stages WHERE template_id = ? ORDER BY position").all(templateId);
  return stages.map((stage) => ({
    id: String(stage.id),
    position: Number(stage.position),
    name: String(stage.name),
    description: String(stage.description ?? ""),
    releaseMode: stage.release_mode as ReleaseMode,
    releaseOffsetDays: Number(stage.release_offset_days),
    releaseOffsetUnit: stage.release_offset_unit as OffsetUnit,
    activities: db.prepare("SELECT * FROM template_activities WHERE stage_id = ? ORDER BY position").all(String(stage.id)).map(mapActivity),
  }));
}

function summarize(template: TemplateRow, stages: TemplateStageDTO[]): TemplateSummaryDTO {
  const offsets = stages.flatMap((stage) => stage.activities.map((activity) => activity.dueOffsetDays));
  return {
    id: template.id,
    kind: template.kind,
    name: template.name,
    profile: template.profile,
    description: template.description,
    version: template.version,
    archived: template.archived,
    stageCount: stages.length,
    activityCount: offsets.length,
    span: { fromDays: offsets.length ? Math.min(...offsets) : 0, toDays: offsets.length ? Math.max(...offsets) : 0 },
    updatedAt: template.updatedAt,
  };
}

function insertStages(templateId: string, stages: TemplateInput["stages"]): void {
  const db = getDb();
  const insertStage = db.prepare(
    "INSERT INTO template_stages (id, template_id, position, name, description, release_mode, release_offset_days, release_offset_unit) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  );
  const insertActivity = db.prepare(`
    INSERT INTO template_activities (id, stage_id, position, title, instructions, kind, role, due_offset_days, due_offset_unit, due_time,
      required, visibility, requires_approval, ledger_role, checklist, links)
    VALUES (@id, @stageId, @position, @title, @instructions, @kind, @role, @dueOffsetDays, @dueOffsetUnit, @dueTime,
      @required, @visibility, @requiresApproval, @ledgerRole, @checklist, @links)`);
  stages.forEach((stage, stageIndex) => {
    const stageId = newId();
    insertStage.run(stageId, templateId, stageIndex, stage.name, stage.description ?? "", stage.releaseMode, stage.releaseOffsetDays ?? 0, stage.releaseOffsetUnit ?? "calendar");
    stage.activities.forEach((activity, activityIndex) => {
      insertActivity.run({
        id: newId(),
        stageId,
        position: activityIndex,
        title: activity.title,
        instructions: activity.instructions ?? "",
        kind: activity.kind ?? "task",
        role: activity.role,
        dueOffsetDays: activity.dueOffsetDays,
        dueOffsetUnit: activity.dueOffsetUnit ?? "calendar",
        dueTime: activity.dueTime ?? "18:00",
        required: activity.required ?? true,
        visibility: activity.visibility ?? "team",
        requiresApproval: activity.requiresApproval ?? false,
        ledgerRole: activity.ledgerRole ?? null,
        checklist: JSON.stringify(activity.checklist ?? []),
        links: JSON.stringify(activity.links ?? []),
      });
    });
  });
}

export function listTemplates(options: { includeArchived?: boolean; kind?: JourneyKind } = {}): TemplateSummaryDTO[] {
  const filters: string[] = [];
  if (!options.includeArchived) filters.push("archived = 0");
  if (options.kind) filters.push("kind = @kind");
  const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  const rows = getDb()
    .prepare(`SELECT * FROM templates ${where} ORDER BY kind, name COLLATE NOCASE`)
    .all(...(options.kind ? [{ kind: options.kind }] : []));
  return rows.map(mapTemplate).map((template) => summarize(template, loadStages(template.id)));
}

export function getTemplate(id: string): TemplateDTO | null {
  const row = getDb().prepare("SELECT * FROM templates WHERE id = ?").get(id);
  if (!row) return null;
  const template = mapTemplate(row);
  const stages = loadStages(id);
  return { ...summarize(template, stages), stages };
}

export function createTemplate(input: TemplateInput): TemplateDTO {
  const db = getDb();
  const id = newId();
  db.tx(() => {
    const now = nowIso();
    db.prepare("INSERT INTO templates (id, kind, name, profile, description, version, archived, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, 0, ?, ?)").run(
      id,
      input.kind,
      input.name,
      input.profile ?? "",
      input.description ?? "",
      now,
      now,
    );
    insertStages(id, input.stages);
  });
  return getTemplate(id)!;
}

/** Substitui etapas e atividades e incrementa a versão. Jornadas em andamento mantêm o *snapshot* da versão antiga. */
export function updateTemplate(id: string, input: TemplateInput): TemplateDTO | null {
  const db = getDb();
  const exists = db.prepare("SELECT id FROM templates WHERE id = ?").get(id);
  if (!exists) return null;
  db.tx(() => {
    db.prepare("UPDATE templates SET kind = ?, name = ?, profile = ?, description = ?, version = version + 1, updated_at = ? WHERE id = ?").run(
      input.kind,
      input.name,
      input.profile ?? "",
      input.description ?? "",
      nowIso(),
      id,
    );
    db.prepare("DELETE FROM template_stages WHERE template_id = ?").run(id);
    insertStages(id, input.stages);
  });
  return getTemplate(id);
}

export function archiveTemplate(id: string): boolean {
  return getDb().prepare("UPDATE templates SET archived = 1, updated_at = ? WHERE id = ?").run(nowIso(), id).changes > 0;
}

export function countTemplates(): number {
  return Number(getDb().prepare("SELECT COUNT(*) AS total FROM templates").get<{ total: number }>()?.total ?? 0);
}
