import "server-only";
import type { LedgerItemDTO } from "@/shared/contracts";
import type { LedgerKind, LedgerStatus } from "@/shared/enums";
import { getDb } from "..";
import { buildSet, newId, nowIso, toStringOrNull } from "./util";

export interface LedgerRow {
  id: string;
  personId: string;
  kind: LedgerKind;
  name: string;
  detail: string;
  status: LedgerStatus;
  source: "onboarding" | "manual";
  grantedJourneyId: string | null;
  grantedActivityId: string | null;
  grantedItemKey: string | null;
  closingJourneyId: string | null;
  closingActivityId: string | null;
  waivedReason: string | null;
  createdAt: string;
  updatedAt: string;
  grantedAt: string | null;
  closedAt: string | null;
}

const COLUMNS = {
  name: "name",
  detail: "detail",
  status: "status",
  closingJourneyId: "closing_journey_id",
  closingActivityId: "closing_activity_id",
  waivedReason: "waived_reason",
  grantedAt: "granted_at",
  closedAt: "closed_at",
};

function map(row: Record<string, unknown>): LedgerRow {
  return {
    id: String(row.id),
    personId: String(row.person_id),
    kind: row.kind as LedgerKind,
    name: String(row.name),
    detail: String(row.detail ?? ""),
    status: row.status as LedgerStatus,
    source: row.source as LedgerRow["source"],
    grantedJourneyId: toStringOrNull(row.granted_journey_id),
    grantedActivityId: toStringOrNull(row.granted_activity_id),
    grantedItemKey: toStringOrNull(row.granted_item_key),
    closingJourneyId: toStringOrNull(row.closing_journey_id),
    closingActivityId: toStringOrNull(row.closing_activity_id),
    waivedReason: toStringOrNull(row.waived_reason),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    grantedAt: toStringOrNull(row.granted_at),
    closedAt: toStringOrNull(row.closed_at),
  };
}

export function listLedger(personId: string): LedgerRow[] {
  return getDb().prepare("SELECT * FROM ledger_items WHERE person_id = ? ORDER BY kind, name COLLATE NOCASE").all(personId).map(map);
}

/** Itens com a pessoa ou com devolução pedida: entram na lista "Revogar e recolher" e bloqueiam a conclusão da saída. */
export function listActiveLedger(personId: string): LedgerRow[] {
  return getDb()
    .prepare("SELECT * FROM ledger_items WHERE person_id = ? AND status IN ('active','return_requested') ORDER BY kind, name COLLATE NOCASE")
    .all(personId)
    .map(map);
}

export function insertLedgerItem(input: {
  personId: string;
  kind: LedgerKind;
  name: string;
  detail?: string;
  status: LedgerStatus;
  source: "onboarding" | "manual";
  grantedJourneyId?: string | null;
  grantedActivityId?: string | null;
  grantedItemKey?: string | null;
  grantedAt?: string | null;
}): LedgerRow {
  const id = newId();
  const now = nowIso();
  getDb()
    .prepare(`
      INSERT INTO ledger_items (id, person_id, kind, name, detail, status, source, granted_journey_id, granted_activity_id, granted_item_key,
        created_at, updated_at, granted_at)
      VALUES (@id, @personId, @kind, @name, @detail, @status, @source, @grantedJourneyId, @grantedActivityId, @grantedItemKey, @now, @now, @grantedAt)`)
    .run({
      id,
      personId: input.personId,
      kind: input.kind,
      name: input.name,
      detail: input.detail ?? "",
      status: input.status,
      source: input.source,
      grantedJourneyId: input.grantedJourneyId ?? null,
      grantedActivityId: input.grantedActivityId ?? null,
      grantedItemKey: input.grantedItemKey ?? null,
      grantedAt: input.grantedAt ?? null,
      now,
    });
  return getLedgerItem(id)!;
}

export function getLedgerItem(id: string): LedgerRow | null {
  const row = getDb().prepare("SELECT * FROM ledger_items WHERE id = ?").get(id);
  return row ? map(row) : null;
}

/** Item gerado por um item de checklist do onboarding (idempotência: uma atividade + chave = um item). */
export function findLedgerByGrant(activityId: string, itemKey: string): LedgerRow | null {
  const row = getDb().prepare("SELECT * FROM ledger_items WHERE granted_activity_id = ? AND granted_item_key = ?").get(activityId, itemKey);
  return row ? map(row) : null;
}

export function updateLedgerItem(id: string, patch: Partial<Pick<LedgerRow, keyof typeof COLUMNS>>): LedgerRow | null {
  const { sql, params } = buildSet(patch, COLUMNS);
  getDb()
    .prepare(`UPDATE ledger_items SET ${sql ? `${sql}, ` : ""}updated_at = @updatedAt WHERE id = @id`)
    .run({ ...params, updatedAt: nowIso(), id });
  return getLedgerItem(id);
}

export function toLedgerItemDTO(row: LedgerRow): LedgerItemDTO {
  return {
    id: row.id,
    personId: row.personId,
    kind: row.kind,
    name: row.name,
    detail: row.detail,
    status: row.status,
    source: row.source,
    grantedAt: row.grantedAt,
    closedAt: row.closedAt,
    waivedReason: row.waivedReason,
  };
}
