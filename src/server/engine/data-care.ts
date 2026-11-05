import "server-only";
import { getDb } from "../db";
import { audit } from "../db/repos/audit";
import { flushDeleted } from "../db/driver";
import { anonymizeDetection, eraseJourneys, eraseLedger, erasePersonRow } from "../db/repos/erasure";
import { purgeFailedJobs } from "../db/repos/jobs";
import { KEEP_SECURITY_EVENTS_MS, purgeSecurityEvents } from "../db/repos/security-events";
import { purgeExpiredSessions } from "../db/repos/sessions";
import { getRetentionMonths, getSyncState, patchSyncState } from "../db/repos/settings";
import { log } from "../log";
import { createBackup, rotateBackups } from "../runtime/backup";
import { removeDocumentFile } from "../security/document-vault";

/**
 * Cuidado diário com os dados, independente do Bitrix24: retenção, limpeza e cópia de segurança. Política em docs/seguranca-lgpd.md.
 */
const DAY_MS = 24 * 3_600_000;
const MONTH_MS = 30 * DAY_MS;
const KEEP_FAILED_JOBS_MS = 90 * DAY_MS;

/** Exclui as jornadas encerradas além do prazo escolhido. Devolve quantas. */
export function applyRetention(now = Date.now()): number {
  const db = getDb();
  const cutoff = new Date(now - getRetentionMonths() * MONTH_MS).toISOString();
  const due = db
    .prepare("SELECT id, person_id FROM journeys WHERE status IN ('completed','cancelled') AND COALESCE(completed_at, cancelled_at, updated_at) < ?")
    .all<{ id: string; person_id: string }>(cutoff);
  // Candidatos dispensados: nunca viraram jornada, mas o nome e o e-mail ficaram na detecção.
  const staleDetections = db.prepare("SELECT id FROM detections WHERE status = 'dismissed' AND detected_at < ? AND (person_name IS NOT NULL OR person_email IS NOT NULL)").all<{ id: string }>(cutoff);
  if (staleDetections.length) db.tx(() => staleDetections.forEach((row) => anonymizeDetection(row.id)));
  if (!due.length) {
    if (staleDetections.length) flushDeleted(db);
    return 0;
  }
  const localFiles: string[] = [];
  const count = db.tx(() => {
    const erased = eraseJourneys(due.map((row) => row.id));
    localFiles.push(...erased.localFiles);
    for (const personId of new Set(due.map((row) => row.person_id))) {
      const others = db.prepare("SELECT COUNT(*) AS total FROM journeys WHERE person_id = ?").get<{ total: number }>(personId)?.total ?? 0;
      if (Number(others) > 0) continue;
      // Quem ainda trabalha na empresa fica com o cadastro e o inventário: o notebook entregue no onboarding antigo ainda precisa voltar na saída.
      const person = db.prepare("SELECT active, bitrix_user_id FROM people WHERE id = ?").get<{ active: number; bitrix_user_id: unknown }>(personId);
      if (person?.bitrix_user_id && person.active) continue;
      // Item que não voltou é pendência, não histórico: o registro fica até alguém resolver.
      const open = db.prepare("SELECT COUNT(*) AS total FROM ledger_items WHERE person_id = ? AND status IN ('active','return_requested')").get<{ total: number }>(personId)?.total ?? 0;
      if (Number(open) > 0) continue;
      eraseLedger(personId);
      erasePersonRow(personId, new Date(now).toISOString());
    }
    audit({ actorType: "system", action: "Retenção aplicada", entity: "privacy", detail: { text: `${erased.journeys} jornada(s) encerrada(s) há mais de ${getRetentionMonths()} meses foram excluídas.` } });
    return erased.journeys;
  });
  for (const file of localFiles) removeDocumentFile(file);
  flushDeleted(db);
  return count;
}

function purgeOld(now: number): void {
  const db = getDb();
  purgeExpiredSessions(new Date(now).toISOString());
  purgeSecurityEvents(new Date(now - KEEP_SECURITY_EVENTS_MS).toISOString());
  purgeFailedJobs(new Date(now - KEEP_FAILED_JOBS_MS).toISOString());
  db.prepare("DELETE FROM rate_limit_hits WHERE expires_ms <= ?").run(now);
  // O registro de atividades segue o mesmo prazo das jornadas.
  db.prepare("DELETE FROM audit_log WHERE at < ?").run(new Date(now - getRetentionMonths() * MONTH_MS).toISOString());
}

/** Uma vez por dia, no ciclo. Cada etapa falha sozinha: um disco cheio na cópia não impede a retenção. */
export async function runDataCareIfDue(now = Date.now()): Promise<boolean> {
  const last = getSyncState().dataCareAt;
  if (last && now - Date.parse(last) < DAY_MS) return false;
  patchSyncState({ dataCareAt: new Date(now).toISOString() });
  try {
    applyRetention(now);
    purgeOld(now);
  } catch (error) {
    log.error("data_care_failed", { step: "retention", error });
  }
  try {
    // Antes de copiar: com o disco cheio de cópias vencidas, a nova só cabe depois de apagá-las.
    rotateBackups(now);
    await createBackup(now);
    patchSyncState({ lastBackupAt: new Date(now).toISOString(), lastBackupError: null });
  } catch (error) {
    log.error("data_care_failed", { step: "backup", error });
    patchSyncState({ lastBackupError: error instanceof Error ? error.message.slice(0, 200) : "Falha na cópia de segurança." });
  }
  return true;
}
