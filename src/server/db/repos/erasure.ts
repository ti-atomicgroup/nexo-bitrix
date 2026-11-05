import "server-only";
import { getDb } from "..";
import { openField } from "../../security/fields";
import { listDetections } from "./detections";
import { listDocumentsByJourney } from "./documents";
import { getDefaults, setDefaults } from "./settings";
import { parseJson, toStringOrNull } from "./util";

/**
 * Exclusão definitiva de dados pessoais (a pedido do titular ou por retenção vencida). Chamar dentro de uma transação.
 * Apaga no Nexo. O que está no Bitrix24 continua lá e volta na lista, para quem responde pelo portal decidir.
 */
export interface ErasedJourneys {
  journeys: number;
  activities: number;
  documents: number;
  auditEntries: number;
  taskIds: string[];
  fileUrls: string[];
  /** Arquivos cifrados à espera de envio: apagar do disco depois da transação. */
  localFiles: string[];
}

/** Trabalhos na fila que citam estes registros: as mensagens têm nome e texto da pessoa. */
function deleteJobs(references: { activityIds: Set<string>; journeyIds: Set<string>; documentIds: Set<string>; personId?: string; bitrixUserId?: string | null }): void {
  const db = getDb();
  const rows = db.prepare("SELECT id, payload, dedupe_key FROM jobs").all<{ id: string; payload: string; dedupe_key: string | null }>();
  const remove = db.prepare("DELETE FROM jobs WHERE id = ?");
  const journeys = [...references.journeyIds];
  for (const row of rows) {
    const payload = parseJson<Record<string, unknown>>(openField(row.payload), {});
    const cites =
      references.activityIds.has(String(payload.activityId)) ||
      references.journeyIds.has(String(payload.journeyId)) ||
      references.documentIds.has(String(payload.documentId)) ||
      (references.personId !== undefined && payload.personId === references.personId) ||
      // Avisos levam só a conta e o texto; a jornada aparece apenas na chave de deduplicação.
      (Boolean(references.bitrixUserId) && String(payload.userId) === references.bitrixUserId) ||
      journeys.some((id) => row.dedupe_key?.includes(id));
    if (cites) remove.run(row.id);
  }
}

export function eraseJourneys(journeyIds: string[], personId?: string, bitrixUserId?: string | null): ErasedJourneys {
  const db = getDb();
  const out: ErasedJourneys = { journeys: 0, activities: 0, documents: 0, auditEntries: 0, taskIds: [], fileUrls: [], localFiles: [] };
  const activityIds = new Set<string>();
  const documentIds = new Set<string>();
  for (const journeyId of journeyIds) {
    for (const row of db.prepare("SELECT id, bitrix_task_id FROM journey_activities WHERE journey_id = ?").all<{ id: string; bitrix_task_id: unknown }>(journeyId)) {
      activityIds.add(row.id);
      const taskId = toStringOrNull(row.bitrix_task_id);
      if (taskId) out.taskIds.push(taskId);
    }
    for (const document of listDocumentsByJourney(journeyId)) {
      documentIds.add(document.id);
      if (document.bitrixUrl) out.fileUrls.push(document.bitrixUrl);
      if (document.localFile) out.localFiles.push(document.localFile);
    }
  }
  deleteJobs({ activityIds, journeyIds: new Set(journeyIds), documentIds, personId, bitrixUserId });
  out.activities = activityIds.size;
  out.documents = documentIds.size;
  for (const journeyId of journeyIds) {
    // A linha do histórico fica (quem fez e quando); o texto, que cita a pessoa, sai.
    out.auditEntries += db.prepare("UPDATE audit_log SET detail = '{}' WHERE entity = 'journey' AND entity_id = ?").run(journeyId).changes;
    for (const row of db.prepare("SELECT id FROM detections WHERE journey_id = ?").all<{ id: string }>(journeyId)) anonymizeDetection(row.id);
    db.prepare("UPDATE ledger_items SET closing_journey_id = NULL, closing_activity_id = NULL WHERE closing_journey_id = ?").run(journeyId);
    // Atividades e documentos saem em cascata.
    out.journeys += db.prepare("DELETE FROM journeys WHERE id = ?").run(journeyId).changes;
  }
  return out;
}

/**
 * A linha da detecção fica sem nada da pessoa: é ela que impede o mesmo registro do CRM de ser detectado de novo.
 * O título também sai do texto de quem a dispensou.
 */
export function anonymizeDetection(id: string): void {
  const db = getDb();
  const row = db.prepare("SELECT trigger_id, title FROM detections WHERE id = ?").get<{ trigger_id: string; title: string }>(id);
  if (!row) return;
  const update = db.prepare("UPDATE audit_log SET detail = '{}' WHERE id = ?");
  for (const entry of db.prepare("SELECT id, detail FROM audit_log WHERE entity = 'trigger' AND entity_id = ?").all<{ id: number; detail: string }>(row.trigger_id)) {
    if (parseJson<{ text?: string }>(openField(entry.detail), {}).text === row.title) update.run(entry.id);
  }
  db.prepare("UPDATE detections SET title = 'Dados removidos', person_name = NULL, person_email = NULL, bitrix_user_id = NULL, crm_url = NULL, status = 'dismissed', journey_id = NULL WHERE id = ?").run(id);
}

/** Detecções que ainda não viraram jornada e têm o mesmo e-mail ou conta (o e-mail fica cifrado: a comparação é feita aqui). */
export function detectionsOf(email: string | null, bitrixUserId: string | null): string[] {
  const wanted = email?.trim().toLowerCase();
  return listDetections()
    .filter((row) => (wanted && row.personEmail?.trim().toLowerCase() === wanted) || (bitrixUserId && row.bitrixUserId === bitrixUserId))
    .map((row) => row.id);
}

/** Acesso ao Nexo que já foi desativado: fica a linha, sem nome nem e-mail, para o histórico continuar coerente. */
export function eraseAccessRow(userId: string): void {
  const db = getDb();
  db.prepare("UPDATE app_users SET name = 'Acesso removido', email = ?, bitrix_user_id = NULL, password_hash = '', must_change_password = 0, failed_logins = 0, locked_until = NULL WHERE id = ?").run(`removido-${userId}@nexo.invalid`, userId);
  db.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
  db.prepare("UPDATE audit_log SET actor_name = 'Acesso removido', actor_bitrix_id = NULL WHERE actor_id = ?").run(userId);
  db.prepare("UPDATE audit_log SET detail = '{}' WHERE entity = 'user' AND entity_id = ?").run(userId);
}

/** Tira a pessoa dos responsáveis padrão: jornadas novas não a escolhem mais. */
export function eraseFromDefaults(bitrixUserId: string): void {
  const defaults = getDefaults();
  const kept = Object.fromEntries(Object.entries(defaults).filter(([, ref]) => ref?.bitrixUserId !== bitrixUserId));
  if (Object.keys(kept).length !== Object.keys(defaults).length) setDefaults(kept);
}

/** Inventário inteiro da pessoa, com o texto do histórico de cada item. */
export function eraseLedger(personId: string): { ledgerItems: number; auditEntries: number } {
  const db = getDb();
  const ids = db.prepare("SELECT id FROM ledger_items WHERE person_id = ?").all<{ id: string }>(personId).map((row) => row.id);
  let auditEntries = 0;
  for (const id of ids) auditEntries += db.prepare("UPDATE audit_log SET detail = '{}' WHERE entity = 'ledger' AND entity_id = ?").run(id).changes;
  db.prepare("DELETE FROM ledger_items WHERE person_id = ?").run(personId);
  return { ledgerItems: ids.length, auditEntries };
}

/**
 * Tira a pessoa da lista. Quem veio do Bitrix24 vira uma marca sem nome nem e-mail: é ela que impede a atualização diária de
 * trazer de volta alguém que continua desativado no portal. Candidatos e cadastros manuais somem de vez.
 */
export function erasePersonRow(personId: string, now: string): void {
  const db = getDb();
  const removed = db.prepare("DELETE FROM people WHERE id = ? AND bitrix_user_id IS NULL").run(personId).changes;
  if (removed) return;
  db.prepare(
    "UPDATE people SET name = 'Pessoa removida', email = NULL, position = NULL, department = NULL, active = 0, invite_status = NULL, invite_error = NULL, erased_at = ?, updated_at = ? WHERE id = ?",
  ).run(now, now, personId);
}
