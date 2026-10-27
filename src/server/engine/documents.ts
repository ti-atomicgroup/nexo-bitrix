import "server-only";
import { createHash } from "node:crypto";
import type { DocumentRequest } from "@/shared/contracts";
import { isBitrixError } from "../bitrix/errors";
import { addTaskComment, attachFileToTask, ensureDriveFolder, findDriveChild, findTaskAttachment, getGroupDriveRoot, uploadDriveFile } from "../bitrix/methods";
import { getDb } from "../db";
import { getActivity, type ActivityRow } from "../db/repos/activities";
import { audit } from "../db/repos/audit";
import { getDocument, insertDocument, listDocumentsByActivity, listDocumentsByStatus, updateDocument, type DocumentRow } from "../db/repos/documents";
import { enqueueJob } from "../db/repos/jobs";
import { getJourney, type JourneyRow } from "../db/repos/journeys";
import { beginOperation, confirmOperation, getOperation, markOperationFailed, markOperationUncertain } from "../db/repos/operations";
import { findPerson } from "../db/repos/people";
import { getWebhookRecord } from "../db/repos/settings";
import { driveFileName, journeyFolderName, missingRequired, type FileType } from "../domain/documents";
import { AppError } from "../errors";
import { log } from "../log";
import { readDocumentFile, removeDocumentFile, storeDocumentFile } from "../security/document-vault";
import { newId } from "../db/repos/util";
import { markDoneFromLink } from "./actions";
import { RetryLater } from "./job-errors";
import { JOB_KINDS } from "./queue";
import type { EngineContext } from "./runtime";
import { kick } from "./scheduler";

/**
 * Documentos pedidos pelo RH e enviados pelo colaborador no link pessoal.
 * Recebimento (síncrono): confere, guarda cifrado na pasta de dados e enfileira `document.send`.
 * Envio (ciclo): grava no Drive do projeto ("Nexo · Documentos" / uma pasta por jornada), anexa à tarefa da atividade,
 * comenta na tarefa (avisa responsável e observadores) e apaga a cópia local.
 */
export const DOCUMENTS_ROOT_FOLDER = "Nexo · Documentos";
const RETRY_FOLDER_MS = 1_000;
const DRIVE_SCOPE_MESSAGE = "Falta a permissão Drive no webhook do Bitrix24. Marque Drive, salve e conecte de novo em Ajustes.";

/** O webhook tem a permissão Drive: sem ela o link não oferece envio de arquivos. */
export function documentsEnabled(scopes: string[] = getWebhookRecord()?.scopes ?? []): boolean {
  return scopes.includes("disk");
}

export interface ReceivedFile {
  bytes: Uint8Array;
  type: FileType;
}

export interface ReceiveResult {
  document: DocumentRow;
  /** Mesmo arquivo enviado de novo para o mesmo pedido: nada foi gravado. */
  duplicate: boolean;
  /** Todos os obrigatórios chegaram e a atividade foi marcada como feita. */
  completed: boolean;
}

const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

/**
 * Recebe um arquivo do link pessoal. Quem chama já conferiu o link, o tipo e o tamanho;
 * aqui confere a atividade e o pedido. Quando o último obrigatório chega, a atividade fica feita (como "Marcar como feita").
 */
export function receiveDocument(journey: JourneyRow, activityId: string, requestKey: string, file: ReceivedFile): ReceiveResult {
  const activity = getActivity(activityId);
  const mine = activity?.journeyId === journey.id && activity.role === "colaborador" && activity.visibility === "employee";
  if (!activity || !mine) throw new AppError("DOCUMENT_NOT_ALLOWED", "Este documento não pode ser enviado por aqui.", 403);
  const request = activity.documents.find((item) => item.key === requestKey);
  if (!request) throw new AppError("DOCUMENT_NOT_REQUESTED", "Este documento não foi pedido pelo RH.", 422);
  if (journey.status !== "active" && journey.status !== "paused") throw new AppError("JOURNEY_CLOSED", "Esta jornada já foi encerrada.", 409);
  if (activity.status === "locked" || activity.status === "cancelled") throw new AppError("ACTIVITY_LOCKED", "Esta atividade ainda não foi liberada.", 409);

  const hash = sha256(file.bytes);
  const previous = listDocumentsByActivity(activity.id).find((document) => document.requestKey === request.key && document.sha256 === hash);
  if (previous) return { document: previous, duplicate: true, completed: false };

  const person = findPerson(journey.personId);
  const id = newId();
  const fileName = driveFileName({ requestName: request.name, personName: person?.name ?? "Colaborador", ext: file.type.ext, id });
  const localFile = storeDocumentFile(id, file.bytes);
  let document: DocumentRow;
  try {
    document = getDb().tx(() => {
      const created = insertDocument({ id, journeyId: journey.id, activityId: activity.id, requestKey: request.key, fileName, mimeType: file.type.mime, size: file.bytes.length, sha256: hash, localFile });
      enqueueJob({ kind: JOB_KINDS.documentSend, dedupeKey: `${JOB_KINDS.documentSend}:${id}`, payload: { documentId: id } });
      audit({
        actorType: "link",
        action: "Colaborador enviou documento",
        entity: "journey",
        entityId: journey.id,
        detail: { text: `“${request.name}” recebido pelo link pessoal.`, activityId: activity.id },
      });
      return created;
    });
  } catch (error) {
    removeDocumentFile(localFile);
    throw error;
  }

  const completed = completeWhenAllReceived(journey, activity);
  kick();
  return { document, duplicate: false, completed };
}

/** Conclui quando chega o último obrigatório. Atividade só com opcionais fica para o colaborador marcar como feita. */
function completeWhenAllReceived(journey: JourneyRow, activity: ActivityRow): boolean {
  if (activity.status !== "open" && activity.status !== "in_progress") return false;
  if (!activity.documents.some((request) => request.required)) return false;
  const received = listDocumentsByActivity(activity.id).map((document) => document.requestKey);
  if (missingRequired(activity.documents, received).length) return false;
  return markDoneFromLink(journey.id, activity.id).ok;
}

/** Tarefa da atividade criada depois que os arquivos chegaram ao Drive: anexa os que estavam esperando. */
export function enqueuePendingAttachments(activityId: string): void {
  for (const document of listDocumentsByActivity(activityId)) {
    if (document.status === "sent" && document.driveFileId && !document.attachmentId) {
      enqueueJob({ kind: JOB_KINDS.documentSend, dedupeKey: `${JOB_KINDS.documentSend}:${document.id}`, payload: { documentId: document.id } });
    }
  }
}

/* ───────────── envio ao Bitrix24 ───────────── */

/** Pasta guardada no diário de operações; refeita se sumiu no Bitrix. */
async function cachedFolder(key: string, create: () => Promise<string>): Promise<string> {
  const previous = getOperation(key);
  if (previous?.status === "confirmed" && previous.resultId) return previous.resultId;
  beginOperation(key);
  try {
    const id = await create();
    confirmOperation(key, id);
    return id;
  } catch (error) {
    markOperationFailed(key);
    throw error;
  }
}

async function journeyFolder(ctx: EngineContext, journey: JourneyRow): Promise<{ id: string; keys: string[] }> {
  const project = ctx.project;
  if (!project) throw new AppError("PROJECT_MISSING", "Prepare o Nexo (projeto no Bitrix24) antes de enviar documentos.", 409);
  const rootKey = `drive:documents-root:${project.id}`;
  const folderKey = `drive:journey-folder:${journey.id}`;
  const rootId = await cachedFolder(rootKey, async () => {
    const driveRoot = await getGroupDriveRoot(ctx.client, project.id);
    if (!driveRoot) throw new AppError("DRIVE_NOT_FOUND", "Não encontramos o Drive do projeto do Nexo no Bitrix24. Confira se o dono do webhook participa do projeto.", 409);
    return (await ensureDriveFolder(ctx.client, driveRoot, DOCUMENTS_ROOT_FOLDER)).id;
  });
  const person = findPerson(journey.personId);
  const name = journeyFolderName({ personName: person?.name ?? "Colaborador", kind: journey.kind, anchorDate: journey.anchorDate });
  const id = await cachedFolder(folderKey, async () => (await ensureDriveFolder(ctx.client, rootId, name)).id);
  return { id, keys: [rootKey, folderKey] };
}

const isNotFound = (error: unknown) => isBitrixError(error) && !error.retryable && (error.code.includes("NOT_FOUND") || error.httpStatus === 404);

/**
 * Grava o arquivo no Drive. O nome é único por documento: depois de qualquer tentativa anterior (incerta ou com erro),
 * procura pelo nome antes de reenviar, e uma recusa clara (ex.: nome já existe, gravado atrasado) também confere o Drive.
 */
async function uploadToDrive(ctx: EngineContext, document: DocumentRow, journey: JourneyRow): Promise<DocumentRow> {
  if (!document.localFile) throw new AppError("DOCUMENT_FILE_MISSING", "O arquivo não está mais guardado no Nexo. Peça ao colaborador para enviar de novo.", 409);
  const folder = await journeyFolder(ctx, journey);
  const key = `document:upload:${document.id}`;
  const previous = getOperation(key);
  try {
    let file = previous ? await findDriveChild(ctx.client, folder.id, document.fileName, "file") : null;
    if (!file) {
      beginOperation(key);
      try {
        file = await uploadDriveFile(ctx.client, folder.id, document.fileName, readDocumentFile(document.localFile));
      } catch (error) {
        if (isBitrixError(error) && error.uncertain) {
          markOperationUncertain(key);
          throw error;
        }
        file = isBitrixError(error) && !isNotFound(error) ? await findDriveChild(ctx.client, folder.id, document.fileName, "file").catch(() => null) : null;
        if (!file) {
          markOperationFailed(key);
          throw error;
        }
      }
    }
    confirmOperation(key, file.id);
    removeDocumentFile(document.localFile);
    return updateDocument(document.id, { driveFileId: file.id, bitrixUrl: file.detailUrl, localFile: null, error: null }) ?? document;
  } catch (error) {
    // Pasta apagada no Bitrix: esquece as pastas guardadas e tenta de novo, recriando.
    if (isNotFound(error)) {
      for (const folderKey of folder.keys) markOperationFailed(folderKey);
      throw new RetryLater(Date.now() + RETRY_FOLDER_MS, "A pasta de documentos sumiu do Drive; o Nexo vai recriá-la.");
    }
    throw error;
  }
}

/** Anexa o arquivo do Drive à tarefa. Depois de uma resposta incerta, confere os anexos da tarefa antes de anexar de novo. */
async function attachToTask(ctx: EngineContext, document: DocumentRow, taskId: string, driveFileId: string): Promise<DocumentRow> {
  const key = `document:attach:${document.id}`;
  const previous = getOperation(key);
  const unsure = previous?.status === "uncertain" || previous?.status === "sending";
  let attachmentId = unsure ? await findTaskAttachment(ctx.client, taskId, driveFileId) : null;
  if (!attachmentId) {
    beginOperation(key);
    try {
      attachmentId = (await attachFileToTask(ctx.client, taskId, driveFileId)) || "ok";
    } catch (error) {
      if (isBitrixError(error) && error.uncertain) markOperationUncertain(key);
      else markOperationFailed(key);
      throw error;
    }
  }
  confirmOperation(key, attachmentId);
  return updateDocument(document.id, { attachmentId }) ?? document;
}

function requestOf(activity: ActivityRow | null, document: DocumentRow): DocumentRequest | null {
  return activity?.documents.find((request) => request.key === document.requestKey) ?? null;
}

/** document.send: Drive → anexo na tarefa → comentário. Repetir é seguro (cada passo confere o que já foi feito). */
export async function handleDocumentSend(payload: Record<string, unknown>, ctx: EngineContext): Promise<void> {
  let document = getDocument(String(payload.documentId ?? ""));
  if (!document) return;
  const journey = getJourney(document.journeyId);
  if (!journey) return;
  if (!documentsEnabled(ctx.scopes)) {
    // Sem como enviar até o RH trocar o webhook; a troca em Ajustes reenfileira (resendDocuments).
    markDocumentFailed(document.id, DRIVE_SCOPE_MESSAGE);
    return;
  }
  if (!document.driveFileId) document = await uploadToDrive(ctx, document, journey);

  const activity = getActivity(document.activityId);
  const taskId = activity?.bitrixTaskId && !activity.bitrixMissing ? activity.bitrixTaskId : null;
  if (taskId && !document.attachmentId && document.driveFileId) {
    document = await attachToTask(ctx, document, taskId, document.driveFileId);
    const request = requestOf(activity, document);
    const person = findPerson(journey.personId);
    try {
      await addTaskComment(
        ctx.client,
        taskId,
        `${person?.name ?? "O colaborador"} enviou “${request?.name ?? document.fileName}” pelo link pessoal. O arquivo está anexado nesta tarefa e na pasta ${DOCUMENTS_ROOT_FOLDER} do projeto.`,
      );
    } catch (error) {
      // Aviso é bônus: o arquivo já está anexado.
      log.warn("document_comment_failed", { documentId: document.id, error });
    }
  }
  if (document.status !== "sent") {
    updateDocument(document.id, { status: "sent", sentAt: new Date().toISOString(), error: null });
    audit({
      actorType: "system",
      action: "Documento enviado ao Bitrix24",
      entity: "journey",
      entityId: journey.id,
      detail: { text: `“${requestOf(activity, document)?.name ?? document.fileName}” está no Drive do projeto${taskId ? " e anexado à tarefa" : ""}.`, activityId: document.activityId },
    });
  }
}

/** Envia de novo os documentos que pararam com erro (todos, ou só os de uma atividade). Devolve quantos voltaram para a fila. */
export function resendDocuments(activityId?: string): number {
  const failed = activityId ? listDocumentsByActivity(activityId).filter((document) => document.status === "error") : listDocumentsByStatus("error");
  for (const document of failed) {
    updateDocument(document.id, { status: "received", error: null });
    enqueueJob({ kind: JOB_KINDS.documentSend, dedupeKey: `${JOB_KINDS.documentSend}:${document.id}`, payload: { documentId: document.id } });
  }
  if (failed.length) kick();
  return failed.length;
}

/** Falha definitiva do envio: o RH vê o erro no documento (o arquivo continua guardado para uma nova tentativa). */
export function markDocumentFailed(documentId: string, message: string): void {
  if (getDocument(documentId)) updateDocument(documentId, { status: "error", error: message });
}
