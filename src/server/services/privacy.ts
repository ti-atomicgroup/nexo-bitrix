import "server-only";
import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import type { ErasureReceiptDTO, PersonExportDTO, PrivacyPersonDTO } from "@/shared/contracts";
import type { Actor } from "@/server/engine";
import { getDb } from "../db";
import { listActivities } from "../db/repos/activities";
import { audit, listAudit } from "../db/repos/audit";
import { listDocumentsByJourney } from "../db/repos/documents";
import { flushDeleted } from "../db/driver";
import { listDetections, getDetection } from "../db/repos/detections";
import { anonymizeDetection, detectionsOf, eraseAccessRow, eraseFromDefaults, eraseJourneys, eraseLedger, erasePersonRow } from "../db/repos/erasure";
import { listJourneys } from "../db/repos/journeys";
import { listLedger, toLedgerItemDTO } from "../db/repos/ledger";
import { findPerson, listSubjects } from "../db/repos/people";
import { listUsers } from "../db/repos/users";
import { normalizeSearch } from "../db/repos/util";
import { AppError } from "../errors";
import { BACKUP_KEEP_DAYS, createBackup } from "../runtime/backup";
import { rateLimit } from "../security/rate-limit";
import { removeDocumentFile } from "../security/document-vault";

/**
 * Direitos do titular (LGPD): achar a pessoa, entregar tudo o que o Nexo guarda sobre ela e excluir. Só a administração.
 * O histórico registra que aconteceu, sem o nome de quem pediu ou de quem saiu: registrar o nome desfaria a exclusão.
 */
const SEARCH_LIMIT = 20;
const BACKUP_RULE = { limit: 5, windowMs: 10 * 60_000 };
/** Candidato que só existe numa detecção do CRM: não tem linha em `people`, mas tem nome e e-mail. */
const DETECTION_PREFIX = "detection:";

const notFound = () => new AppError("NOT_FOUND", "Não encontramos esta pessoa.", 404);

function journeyCounts(personId: string): { journeys: number; openJourneys: number } {
  const journeys = listJourneys({ personId });
  return { journeys: journeys.length, openJourneys: journeys.filter((journey) => journey.status === "active" || journey.status === "paused").length };
}

function detectionSubject(personId: string) {
  const row = personId.startsWith(DETECTION_PREFIX) ? getDetection(personId.slice(DETECTION_PREFIX.length)) : null;
  return row && !row.journeyId && (row.personName || row.personEmail) ? row : null;
}

export function searchSubjects(query: string): PrivacyPersonDTO[] {
  const needle = normalizeSearch(query);
  const matches = (name: string, email: string | null) => !needle || normalizeSearch(`${name} ${email ?? ""}`).includes(needle);
  const people: PrivacyPersonDTO[] = listSubjects()
    .filter((person) => matches(person.name, person.email))
    .map((person) => ({ id: person.id, name: person.name, email: person.email, source: person.source, active: person.active, bitrixUserId: person.bitrixUserId, ...journeyCounts(person.id) }));
  const known = new Set(people.map((person) => person.email?.toLowerCase()).filter(Boolean));
  const candidates: PrivacyPersonDTO[] = listDetections()
    .filter((row) => !row.journeyId && (row.personName || row.personEmail) && !known.has(row.personEmail?.toLowerCase()) && matches(row.personName ?? row.title, row.personEmail))
    .map((row) => ({ id: `${DETECTION_PREFIX}${row.id}`, name: row.personName ?? row.title, email: row.personEmail, source: "crm", active: false, bitrixUserId: row.bitrixUserId, journeys: 0, openJourneys: 0 }));
  return [...people, ...candidates].slice(0, SEARCH_LIMIT);
}

export function exportSubject(personId: string, actor: Actor): PersonExportDTO {
  const candidate = detectionSubject(personId);
  if (candidate) {
    audit({ actorType: actor.type, actorId: actor.id, actorName: actor.name, action: "Dados pessoais exportados", entity: "privacy", detail: { text: "Candidato detectado no CRM, sem jornada." } });
    return {
      exportedAt: new Date().toISOString(),
      person: { id: personId, name: candidate.personName ?? candidate.title, email: candidate.personEmail, position: null, department: null, source: "crm", bitrixUserId: candidate.bitrixUserId },
      journeys: [],
      ledger: [],
    };
  }
  const person = findPerson(personId);
  if (!person || !listSubjects().some((subject) => subject.id === personId)) throw notFound();
  const result: PersonExportDTO = {
    exportedAt: new Date().toISOString(),
    person: { id: person.id, name: person.name, email: person.email, position: person.position, department: person.department, source: person.source, bitrixUserId: person.bitrixUserId },
    journeys: listJourneys({ personId }).map((journey) => ({
      id: journey.id,
      kind: journey.kind,
      status: journey.status,
      anchorDate: journey.anchorDate,
      position: journey.personPosition,
      offboardingReason: journey.offboardingReason,
      cancelReason: journey.cancelReason,
      createdAt: journey.createdAt,
      completedAt: journey.completedAt,
      cancelledAt: journey.cancelledAt,
      activities: listActivities(journey.id).map((activity) => ({ title: activity.title, status: activity.status, dueAt: activity.dueAt, doneAt: activity.doneAt, bitrixTaskId: activity.bitrixTaskId })),
      documents: listDocumentsByJourney(journey.id).map((document) => ({
        fileName: document.fileName,
        size: document.size,
        status: document.status,
        receivedAt: document.receivedAt,
        rejectedReason: document.rejectedReason,
        bitrixUrl: document.bitrixUrl,
      })),
      history: listAudit({ entity: "journey", entityId: journey.id, limit: 500 }),
    })),
    ledger: listLedger(personId).map(toLedgerItemDTO),
  };
  audit({ actorType: actor.type, actorId: actor.id, actorName: actor.name, action: "Dados pessoais exportados", entity: "privacy", detail: { text: `${result.journeys.length} jornada(s) e ${result.ledger.length} item(ns) de inventário.` } });
  return result;
}

function eraseCandidate(detection: NonNullable<ReturnType<typeof detectionSubject>>, confirmName: string, actor: Actor): ErasureReceiptDTO {
  if (normalizeSearch(confirmName) !== normalizeSearch(detection.personName ?? detection.title)) {
    throw new AppError("CONFIRM_NAME", "O nome digitado não confere. Nada foi excluído.", 422, { field: "confirmName" });
  }
  const receipt = getDb().tx((): ErasureReceiptDTO => {
    const ids = new Set([detection.id, ...detectionsOf(detection.personEmail, detection.bitrixUserId)]);
    for (const id of ids) anonymizeDetection(id);
    audit({ actorType: actor.type, actorId: actor.id, actorName: actor.name, action: "Dados pessoais excluídos", entity: "privacy", detail: { text: `${ids.size} detecção(ões) do CRM. O registro continua no CRM do Bitrix24.` } });
    return { journeys: 0, activities: 0, documents: 0, ledgerItems: 0, auditEntries: 0, bitrix: { taskIds: [], fileUrls: [] }, backupDays: BACKUP_KEEP_DAYS };
  });
  flushDeleted(getDb());
  return receipt;
}

export function eraseSubject(personId: string, confirmName: string, actor: Actor): ErasureReceiptDTO {
  const candidate = detectionSubject(personId);
  if (candidate) return eraseCandidate(candidate, confirmName, actor);
  const person = findPerson(personId);
  if (!person || !listSubjects().some((subject) => subject.id === personId)) throw notFound();
  if (normalizeSearch(confirmName) !== normalizeSearch(person.name)) {
    throw new AppError("CONFIRM_NAME", "O nome digitado não confere. Nada foi excluído.", 422, { field: "confirmName" });
  }
  if (journeyCounts(personId).openJourneys > 0) {
    throw new AppError("JOURNEY_OPEN", "Esta pessoa tem jornada em andamento. Cancele ou conclua antes de excluir os dados.", 409);
  }
  const access = listUsers().find((user) => (person.bitrixUserId && user.bitrixUserId === person.bitrixUserId) || (person.email && user.email.toLowerCase() === person.email.trim().toLowerCase()));
  if (access?.active) {
    throw new AppError("ACCESS_ACTIVE", "Esta pessoa tem um acesso ativo ao Nexo. Desative o acesso em Ajustes, na seção Equipe, antes de excluir os dados.", 409);
  }
  const localFiles: string[] = [];
  const receipt = getDb().tx((): ErasureReceiptDTO => {
    const detections = detectionsOf(person.email, person.bitrixUserId);
    const erased = eraseJourneys(listJourneys({ personId }).map((journey) => journey.id), personId, person.bitrixUserId);
    localFiles.push(...erased.localFiles);
    const ledger = eraseLedger(personId);
    for (const id of detections) anonymizeDetection(id);
    if (access) eraseAccessRow(access.id);
    if (person.bitrixUserId) eraseFromDefaults(person.bitrixUserId);
    erasePersonRow(personId, new Date().toISOString());
    const done: ErasureReceiptDTO = {
      journeys: erased.journeys,
      activities: erased.activities,
      documents: erased.documents,
      ledgerItems: ledger.ledgerItems,
      auditEntries: erased.auditEntries + ledger.auditEntries,
      bitrix: { taskIds: erased.taskIds, fileUrls: erased.fileUrls },
      backupDays: BACKUP_KEEP_DAYS,
    };
    audit({
      actorType: actor.type,
      actorId: actor.id,
      actorName: actor.name,
      action: "Dados pessoais excluídos",
      entity: "privacy",
      detail: { text: `${done.journeys} jornada(s), ${done.documents} documento(s) e ${done.ledgerItems} item(ns) de inventário. ${done.bitrix.taskIds.length} tarefa(s) seguem no Bitrix24.` },
    });
    return done;
  });
  // Depois da transação: se ela desfizer, os arquivos continuam onde estavam.
  for (const file of localFiles) removeDocumentFile(file);
  flushDeleted(getDb());
  return receipt;
}

/** Cópia cifrada e sempre nova, para guardar fora do volume: nunca leva quem acabou de ser excluído. Sem a chave da instância, ela não abre. */
export async function downloadBackup(actor: Actor): Promise<Response> {
  if (!rateLimit(`backup-download:${actor.id}`, BACKUP_RULE).allowed) throw new AppError("TOO_MANY_ATTEMPTS", "Muitas cópias seguidas. Espere alguns minutos.", 429);
  const backup = await createBackup();
  audit({ actorType: actor.type, actorId: actor.id, actorName: actor.name, action: "Cópia de segurança baixada", entity: "privacy", detail: { text: backup.name } });
  return new Response(Readable.toWeb(createReadStream(backup.path)) as ReadableStream, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${backup.name}"`,
      "Content-Length": String(backup.size),
    },
  });
}
