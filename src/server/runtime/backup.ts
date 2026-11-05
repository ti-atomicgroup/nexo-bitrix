import "server-only";
import { randomUUID } from "node:crypto";
import { mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { encryptBackupFile } from "../../../scripts/lib/backup-file.mjs";
import { getDataDir, getDb } from "../db";
import { instanceKey } from "../security/crypto";

/**
 * Cópia de segurança do banco: um retrato consistente (`VACUUM INTO`), cifrado com AES-256-GCM e a chave da instância, na
 * pasta `backups` do volume. O retrato em texto vive só o tempo de cifrar. Vale BACKUP_KEEP_DAYS dias; depois é apagado.
 * Protege contra banco corrompido ou publicação com defeito; contra perder o volume, o administrador baixa uma cópia.
 */
const FOLDER = "backups";
const NAME = /^nexo-(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z\.sqlite\.enc$/;

export const BACKUP_KEEP_DAYS = (() => {
  const days = Number.parseInt(process.env.NEXO_BACKUP_KEEP_DAYS ?? "", 10);
  return Number.isInteger(days) && days >= 1 && days <= 365 ? days : 14;
})();

export interface BackupFile {
  name: string;
  path: string;
  at: number;
  size: number;
}

function folder(): string {
  const path = join(getDataDir(), FOLDER);
  mkdirSync(path, { recursive: true, mode: 0o700 });
  return path;
}

function takenAt(name: string): number | null {
  const match = NAME.exec(name);
  return match ? Date.parse(`${match[1]}T${match[2]}:${match[3]}:${match[4]}.${match[5]}Z`) : null;
}

/** Da mais recente para a mais antiga. */
export function listBackups(): BackupFile[] {
  const base = folder();
  return readdirSync(base)
    .flatMap((name) => {
      const at = takenAt(name);
      if (at === null) return [];
      const path = join(base, name);
      return [{ name, path, at, size: statSync(path).size }];
    })
    .sort((a, b) => b.at - a.at);
}

/** Restos de cópia interrompida (retrato em texto, arquivo pela metade): mais velhos que isto, ninguém está usando. */
const LEFTOVER_MS = 3_600_000;

export function rotateBackups(now = Date.now()): number {
  const base = folder();
  for (const name of readdirSync(base)) {
    if (NAME.test(name)) continue;
    const path = join(base, name);
    if (now - statSync(path).mtimeMs > LEFTOVER_MS) rmSync(path, { force: true });
  }
  let removed = 0;
  for (const backup of listBackups()) {
    if (now - backup.at > BACKUP_KEEP_DAYS * 24 * 3_600_000) {
      rmSync(backup.path, { force: true });
      removed++;
    }
  }
  return removed;
}

export async function createBackup(now = Date.now()): Promise<BackupFile> {
  const base = folder();
  const name = `nexo-${new Date(now).toISOString().replace(/[:.]/g, "-")}.sqlite.enc`;
  const path = join(base, name);
  const snapshot = join(base, `.retrato-${randomUUID()}.tmp`);
  try {
    getDb().exec(`VACUUM INTO '${snapshot.replace(/'/g, "''")}'`);
    await encryptBackupFile(snapshot, path, instanceKey().toString("hex"));
  } finally {
    rmSync(snapshot, { force: true });
  }
  return { name, path, at: now, size: statSync(path).size };
}
