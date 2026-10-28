import "server-only";
import type { TemplateDTO, UserRef } from "@/shared/contracts";
import type { JourneyKind, JourneyStatus, OffboardingReason, ParticipantRole } from "@/shared/enums";
import { getDb } from "..";
import { buildSet, nowIso, parseJson, toStringOrNull } from "./util";

export interface JourneyRow {
  id: string;
  kind: JourneyKind;
  personId: string;
  templateId: string;
  templateVersion: number;
  /** Cópia da trilha no momento do início: mudanças na trilha não afetam jornadas em andamento. */
  snapshot: TemplateDTO;
  anchorDate: string;
  status: JourneyStatus;
  offboardingReason: OffboardingReason | null;
  /** Cargo informado pelo RH ao criar a jornada (vale mais que o cargo do cadastro). */
  personPosition: string | null;
  participants: Partial<Record<ParticipantRole, UserRef>>;
  sourceType: "manual" | "trigger";
  sourceKey: string | null;
  sourceLabel: string | null;
  crmBinding: string | null;
  crmUrl: string | null;
  linkTokenHash: string | null;
  linkExpiresAt: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
}

export type NewJourney = Omit<
  JourneyRow,
  "createdAt" | "updatedAt" | "completedAt" | "cancelledAt" | "cancelReason" | "linkTokenHash" | "linkExpiresAt" | "personPosition"
> &
  Partial<Pick<JourneyRow, "linkTokenHash" | "linkExpiresAt" | "personPosition">>;

const COLUMNS = {
  status: "status",
  anchorDate: "anchor_date",
  personId: "person_id",
  offboardingReason: "offboarding_reason",
  participants: "participants",
  sourceLabel: "source_label",
  crmBinding: "crm_binding",
  crmUrl: "crm_url",
  linkTokenHash: "link_token_hash",
  linkExpiresAt: "link_expires_at",
  completedAt: "completed_at",
  cancelledAt: "cancelled_at",
  cancelReason: "cancel_reason",
};

function map(row: Record<string, unknown>): JourneyRow {
  return {
    id: String(row.id),
    kind: row.kind as JourneyKind,
    personId: String(row.person_id),
    templateId: String(row.template_id),
    templateVersion: Number(row.template_version),
    snapshot: parseJson<TemplateDTO>(row.template_snapshot, null as unknown as TemplateDTO),
    anchorDate: String(row.anchor_date),
    status: row.status as JourneyStatus,
    offboardingReason: (toStringOrNull(row.offboarding_reason) as OffboardingReason | null) ?? null,
    personPosition: toStringOrNull(row.person_position),
    participants: parseJson<Partial<Record<ParticipantRole, UserRef>>>(row.participants, {}),
    sourceType: row.source_type as JourneyRow["sourceType"],
    sourceKey: toStringOrNull(row.source_key),
    sourceLabel: toStringOrNull(row.source_label),
    crmBinding: toStringOrNull(row.crm_binding),
    crmUrl: toStringOrNull(row.crm_url),
    linkTokenHash: toStringOrNull(row.link_token_hash),
    linkExpiresAt: toStringOrNull(row.link_expires_at),
    createdBy: toStringOrNull(row.created_by),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    completedAt: toStringOrNull(row.completed_at),
    cancelledAt: toStringOrNull(row.cancelled_at),
    cancelReason: toStringOrNull(row.cancel_reason),
  };
}

export function insertJourney(journey: NewJourney): JourneyRow {
  const now = nowIso();
  getDb()
    .prepare(`
      INSERT INTO journeys (id, kind, person_id, template_id, template_version, template_snapshot, anchor_date, status, offboarding_reason, person_position,
        participants, source_type, source_key, source_label, crm_binding, crm_url, link_token_hash, link_expires_at, created_by, created_at, updated_at)
      VALUES (@id, @kind, @personId, @templateId, @templateVersion, @snapshot, @anchorDate, @status, @offboardingReason, @personPosition,
        @participants, @sourceType, @sourceKey, @sourceLabel, @crmBinding, @crmUrl, @linkTokenHash, @linkExpiresAt, @createdBy, @now, @now)`)
    .run({
      id: journey.id,
      kind: journey.kind,
      personId: journey.personId,
      templateId: journey.templateId,
      templateVersion: journey.templateVersion,
      snapshot: JSON.stringify(journey.snapshot),
      anchorDate: journey.anchorDate,
      status: journey.status,
      offboardingReason: journey.offboardingReason,
      personPosition: journey.personPosition?.trim() || null,
      participants: JSON.stringify(journey.participants),
      sourceType: journey.sourceType,
      sourceKey: journey.sourceKey,
      sourceLabel: journey.sourceLabel,
      crmBinding: journey.crmBinding,
      crmUrl: journey.crmUrl,
      linkTokenHash: journey.linkTokenHash ?? null,
      linkExpiresAt: journey.linkExpiresAt ?? null,
      createdBy: journey.createdBy,
      now,
    });
  return getJourney(journey.id)!;
}

export function getJourney(id: string): JourneyRow | null {
  const row = getDb().prepare("SELECT * FROM journeys WHERE id = ?").get(id);
  return row ? map(row) : null;
}

export function findJourneyBySourceKey(sourceKey: string): JourneyRow | null {
  const row = getDb().prepare("SELECT * FROM journeys WHERE source_key = ?").get(sourceKey);
  return row ? map(row) : null;
}

export function findJourneyByLinkHash(tokenHash: string): JourneyRow | null {
  const row = getDb().prepare("SELECT * FROM journeys WHERE link_token_hash = ?").get(tokenHash);
  return row ? map(row) : null;
}

export function listJourneys(filter: { status?: JourneyStatus[]; kind?: JourneyKind; personId?: string } = {}): JourneyRow[] {
  const where: string[] = [];
  const params: Record<string, string> = {};
  if (filter.status?.length) {
    where.push(`status IN (${filter.status.map((_, index) => `@status${index}`).join(", ")})`);
    filter.status.forEach((status, index) => (params[`status${index}`] = status));
  }
  if (filter.kind) {
    where.push("kind = @kind");
    params.kind = filter.kind;
  }
  if (filter.personId) {
    where.push("person_id = @personId");
    params.personId = filter.personId;
  }
  const sql = `SELECT * FROM journeys ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY anchor_date, created_at`;
  return getDb()
    .prepare(sql)
    .all(...(Object.keys(params).length ? [params] : []))
    .map(map);
}

export function updateJourney(id: string, patch: Partial<Pick<JourneyRow, keyof typeof COLUMNS>>): JourneyRow | null {
  const { sql, params } = buildSet(patch, COLUMNS);
  getDb()
    .prepare(`UPDATE journeys SET ${sql ? `${sql}, ` : ""}updated_at = @updatedAt WHERE id = @id`)
    .run({ ...params, updatedAt: nowIso(), id });
  return getJourney(id);
}
