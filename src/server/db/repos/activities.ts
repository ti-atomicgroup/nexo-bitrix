import "server-only";
import type { JourneyChecklistItem, LinkItem } from "@/shared/contracts";
import type { ActivityKind, ActivityRole, ActivityStatus, SyncState, Visibility } from "@/shared/enums";
import { getDb } from "..";
import { buildSet, parseJson, toBool, toNumberOrNull, toStringOrNull } from "./util";

export interface ActivityRow {
  id: string;
  journeyId: string;
  stagePosition: number;
  position: number;
  templateActivityId: string | null;
  title: string;
  instructions: string;
  kind: ActivityKind;
  role: ActivityRole;
  /** Responsável no Bitrix. Nulo quando o colaborador ainda não tem conta (a atividade fica só no Nexo e no link). */
  assigneeBitrixId: string | null;
  assigneeName: string | null;
  dueAt: string;
  required: boolean;
  visibility: Visibility;
  requiresApproval: boolean;
  ledgerRole: "revoke_and_collect" | null;
  status: ActivityStatus;
  checklist: JourneyChecklistItem[];
  links: LinkItem[];
  bitrixTaskId: string | null;
  bitrixStatus: number | null;
  /** A tarefa sumiu do Bitrix (apagada ou movida): sinalizar, nunca recriar sozinho. */
  bitrixMissing: boolean;
  checklistSyncedAt: string | null;
  syncState: SyncState;
  syncError: string | null;
  releasedAt: string | null;
  doneAt: string | null;
  doneSource: "bitrix" | "nexo" | "link" | null;
  calendarEventId: string | null;
  lastNudgedAt: string | null;
}

const COLUMNS = {
  title: "title",
  instructions: "instructions",
  assigneeBitrixId: "assignee_bitrix_id",
  assigneeName: "assignee_name",
  dueAt: "due_at",
  status: "status",
  checklist: "checklist",
  links: "links",
  bitrixTaskId: "bitrix_task_id",
  bitrixStatus: "bitrix_status",
  bitrixMissing: "bitrix_missing",
  checklistSyncedAt: "checklist_synced_at",
  syncState: "sync_state",
  syncError: "sync_error",
  releasedAt: "released_at",
  doneAt: "done_at",
  doneSource: "done_source",
  calendarEventId: "calendar_event_id",
  lastNudgedAt: "last_nudged_at",
};

function map(row: Record<string, unknown>): ActivityRow {
  return {
    id: String(row.id),
    journeyId: String(row.journey_id),
    stagePosition: Number(row.stage_position),
    position: Number(row.position),
    templateActivityId: toStringOrNull(row.template_activity_id),
    title: String(row.title),
    instructions: String(row.instructions ?? ""),
    kind: row.kind as ActivityKind,
    role: row.role as ActivityRole,
    assigneeBitrixId: toStringOrNull(row.assignee_bitrix_id),
    assigneeName: toStringOrNull(row.assignee_name),
    dueAt: String(row.due_at),
    required: toBool(row.required),
    visibility: row.visibility as Visibility,
    requiresApproval: toBool(row.requires_approval),
    ledgerRole: row.ledger_role === "revoke_and_collect" ? "revoke_and_collect" : null,
    status: row.status as ActivityStatus,
    checklist: parseJson<JourneyChecklistItem[]>(row.checklist, []),
    links: parseJson<LinkItem[]>(row.links, []),
    bitrixTaskId: toStringOrNull(row.bitrix_task_id),
    bitrixStatus: toNumberOrNull(row.bitrix_status),
    bitrixMissing: toBool(row.bitrix_missing),
    checklistSyncedAt: toStringOrNull(row.checklist_synced_at),
    syncState: row.sync_state as SyncState,
    syncError: toStringOrNull(row.sync_error),
    releasedAt: toStringOrNull(row.released_at),
    doneAt: toStringOrNull(row.done_at),
    doneSource: (toStringOrNull(row.done_source) as ActivityRow["doneSource"]) ?? null,
    calendarEventId: toStringOrNull(row.calendar_event_id),
    lastNudgedAt: toStringOrNull(row.last_nudged_at),
  };
}

export function insertActivities(rows: ActivityRow[]): void {
  const db = getDb();
  const statement = db.prepare(`
    INSERT INTO journey_activities (id, journey_id, stage_position, position, template_activity_id, title, instructions, kind, role,
      assignee_bitrix_id, assignee_name, due_at, required, visibility, requires_approval, ledger_role, status, checklist, links,
      bitrix_task_id, bitrix_status, bitrix_missing, checklist_synced_at, sync_state, sync_error, released_at, done_at, done_source,
      calendar_event_id, last_nudged_at)
    VALUES (@id, @journeyId, @stagePosition, @position, @templateActivityId, @title, @instructions, @kind, @role,
      @assigneeBitrixId, @assigneeName, @dueAt, @required, @visibility, @requiresApproval, @ledgerRole, @status, @checklist, @links,
      @bitrixTaskId, @bitrixStatus, @bitrixMissing, @checklistSyncedAt, @syncState, @syncError, @releasedAt, @doneAt, @doneSource,
      @calendarEventId, @lastNudgedAt)`);
  db.tx(() => {
    for (const row of rows) {
      statement.run({ ...row, checklist: JSON.stringify(row.checklist), links: JSON.stringify(row.links) });
    }
  });
}

export function listActivities(journeyId: string): ActivityRow[] {
  return getDb().prepare("SELECT * FROM journey_activities WHERE journey_id = ? ORDER BY stage_position, position").all(journeyId).map(map);
}

export function listActivitiesByJourneyIds(journeyIds: string[]): ActivityRow[] {
  if (!journeyIds.length) return [];
  const params = Object.fromEntries(journeyIds.map((id, index) => [`j${index}`, id]));
  return getDb()
    .prepare(`SELECT * FROM journey_activities WHERE journey_id IN (${journeyIds.map((_, index) => `@j${index}`).join(", ")}) ORDER BY journey_id, stage_position, position`)
    .all(params)
    .map(map);
}

export function getActivity(id: string): ActivityRow | null {
  const row = getDb().prepare("SELECT * FROM journey_activities WHERE id = ?").get(id);
  return row ? map(row) : null;
}

export function findActivityByTaskId(bitrixTaskId: string): ActivityRow | null {
  const row = getDb().prepare("SELECT * FROM journey_activities WHERE bitrix_task_id = ?").get(bitrixTaskId);
  return row ? map(row) : null;
}

export function updateActivity(id: string, patch: Partial<Pick<ActivityRow, keyof typeof COLUMNS>>): ActivityRow | null {
  const { sql, params } = buildSet(patch, COLUMNS);
  if (sql) getDb().prepare(`UPDATE journey_activities SET ${sql} WHERE id = @id`).run({ ...params, id });
  return getActivity(id);
}

/** Atividades abertas com tarefa no Bitrix, de jornadas ativas ou pausadas: alvo da consulta periódica por IDs. */
export function listOpenTaskActivities(): ActivityRow[] {
  return getDb()
    .prepare(`
      SELECT a.* FROM journey_activities a JOIN journeys j ON j.id = a.journey_id
      WHERE a.bitrix_task_id IS NOT NULL AND a.bitrix_missing = 0 AND a.status NOT IN ('done','cancelled')
        AND j.status IN ('active','paused')
      ORDER BY a.due_at`)
    .all()
    .map(map);
}

/** Atividades liberadas que ainda precisam virar tarefa no Bitrix (jornada ativa, responsável definido). */
export function listActivitiesToPush(): ActivityRow[] {
  return getDb()
    .prepare(`
      SELECT a.* FROM journey_activities a JOIN journeys j ON j.id = a.journey_id
      WHERE j.status = 'active' AND a.status NOT IN ('locked','cancelled','done') AND a.bitrix_task_id IS NULL
        AND a.assignee_bitrix_id IS NOT NULL AND a.sync_state IN ('local','queued','error','uncertain')
      ORDER BY a.due_at`)
    .all()
    .map(map);
}
