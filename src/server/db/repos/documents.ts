import "server-only";
import type { DocumentStatus } from "@/shared/enums";
import { getDb } from "..";
import { buildSet, newId, nowIso, toStringOrNull } from "./util";

/** Arquivo enviado pelo colaborador. `localFile` só existe enquanto o arquivo (cifrado) espera para ir ao Drive. */
export interface DocumentRow {
  id: string;
  journeyId: string;
  activityId: string;
  requestKey: string;
  fileName: string;
  mimeType: string;
  size: number;
  sha256: string;
  status: DocumentStatus;
  localFile: string | null;
  driveFileId: string | null;
  bitrixUrl: string | null;
  attachmentId: string | null;
  error: string | null;
  receivedAt: string;
  sentAt: string | null;
  /** O RH pediu de novo: o arquivo fica no Drive, mas não conta como recebido. */
  rejectedAt: string | null;
  rejectedReason: string | null;
}

const COLUMNS = {
  status: "status",
  localFile: "local_file",
  driveFileId: "drive_file_id",
  bitrixUrl: "bitrix_url",
  attachmentId: "attachment_id",
  error: "error",
  sentAt: "sent_at",
  rejectedAt: "rejected_at",
  rejectedReason: "rejected_reason",
};

export type DocumentPatch = Partial<
  Pick<DocumentRow, "status" | "localFile" | "driveFileId" | "bitrixUrl" | "attachmentId" | "error" | "sentAt" | "rejectedAt" | "rejectedReason">
>;

function map(row: Record<string, unknown>): DocumentRow {
  return {
    id: String(row.id),
    journeyId: String(row.journey_id),
    activityId: String(row.activity_id),
    requestKey: String(row.request_key),
    fileName: String(row.file_name),
    mimeType: String(row.mime_type),
    size: Number(row.size),
    sha256: String(row.sha256),
    status: row.status as DocumentStatus,
    localFile: toStringOrNull(row.local_file),
    driveFileId: toStringOrNull(row.drive_file_id),
    bitrixUrl: toStringOrNull(row.bitrix_url),
    attachmentId: toStringOrNull(row.attachment_id),
    error: toStringOrNull(row.error),
    receivedAt: String(row.received_at),
    sentAt: toStringOrNull(row.sent_at),
    rejectedAt: toStringOrNull(row.rejected_at),
    rejectedReason: toStringOrNull(row.rejected_reason),
  };
}

export function insertDocument(input: Pick<DocumentRow, "journeyId" | "activityId" | "requestKey" | "fileName" | "mimeType" | "size" | "sha256" | "localFile"> & { id?: string }): DocumentRow {
  const id = input.id ?? newId();
  getDb()
    .prepare(`
      INSERT INTO documents (id, journey_id, activity_id, request_key, file_name, mime_type, size, sha256, status, local_file, received_at)
      VALUES (@id, @journeyId, @activityId, @requestKey, @fileName, @mimeType, @size, @sha256, 'received', @localFile, @receivedAt)`)
    .run({ ...input, id, receivedAt: nowIso() });
  return getDocument(id)!;
}

export function getDocument(id: string): DocumentRow | null {
  const row = getDb().prepare("SELECT * FROM documents WHERE id = ?").get(id);
  return row ? map(row) : null;
}

export function listDocumentsByJourney(journeyId: string): DocumentRow[] {
  return getDb().prepare("SELECT * FROM documents WHERE journey_id = ? ORDER BY received_at").all(journeyId).map(map);
}

export function listDocumentsByActivity(activityId: string): DocumentRow[] {
  return getDb().prepare("SELECT * FROM documents WHERE activity_id = ? ORDER BY received_at").all(activityId).map(map);
}

export function listDocumentsByStatus(status: DocumentStatus): DocumentRow[] {
  return getDb().prepare("SELECT * FROM documents WHERE status = ? ORDER BY received_at").all(status).map(map);
}

export function updateDocument(id: string, patch: DocumentPatch): DocumentRow | null {
  const { sql, params } = buildSet(patch, COLUMNS);
  if (sql) getDb().prepare(`UPDATE documents SET ${sql} WHERE id = @id`).run({ ...params, id });
  return getDocument(id);
}
