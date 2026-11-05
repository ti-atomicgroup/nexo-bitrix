import { instanceKey } from "../../security/crypto";
import { isSealed, sealField } from "../../security/fields";
import type { Db } from "../driver";

/** Colunas cifradas. Valor vazio fica como está; valor já cifrado não muda. */
const SEALED_COLUMNS: Array<{ table: string; column: string; key: string; skip?: string[] }> = [
  { table: "journeys", column: "cancel_reason", key: "id" },
  { table: "ledger_items", column: "detail", key: "id" },
  { table: "ledger_items", column: "waived_reason", key: "id" },
  { table: "documents", column: "file_name", key: "id" },
  { table: "documents", column: "rejected_reason", key: "id" },
  { table: "detections", column: "person_email", key: "id" },
  { table: "people", column: "email", key: "id" },
  { table: "audit_log", column: "detail", key: "id", skip: ["{}"] },
  { table: "journey_activities", column: "checklist", key: "id", skip: ["[]"] },
  { table: "jobs", column: "payload", key: "id", skip: ["{}"] },
];

/**
 * Cifra os dados que já existem numa instalação anterior. Roda uma vez, dentro da transação da migração: se algo falhar, nada muda.
 * A chave só é lida se houver o que cifrar, e fica em `dataDir` (a conexão global ainda não existe neste momento).
 */
export const migration008 = {
  id: 8,
  name: "seal-fields",
  sql: "",
  rewriteFile: true,
  run(db: Db, context: { dataDir?: string } = {}): void {
    let key: Buffer | null = null;
    const seal = (value: string): string => sealField(value, (key ??= instanceKey(context.dataDir))) as string;

    for (const row of db.prepare("SELECT id, offboarding_reason FROM journeys WHERE offboarding_reason IS NOT NULL").all<{ id: string; offboarding_reason: string }>()) {
      db.prepare("UPDATE journeys SET offboarding_reason_sealed = ?, offboarding_reason = NULL WHERE id = ?").run(seal(row.offboarding_reason), row.id);
    }
    for (const { table, column, key: id, skip = [] } of SEALED_COLUMNS) {
      const rows = db.prepare(`SELECT ${id} AS id, ${column} AS value FROM ${table} WHERE ${column} IS NOT NULL AND ${column} <> ''`).all<{ id: string | number; value: string }>();
      const update = db.prepare(`UPDATE ${table} SET ${column} = ? WHERE ${id} = ?`);
      for (const row of rows) {
        if (skip.includes(row.value) || isSealed(row.value)) continue;
        update.run(seal(row.value), row.id);
      }
    }
  },
};
