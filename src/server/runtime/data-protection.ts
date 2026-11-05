import "server-only";
import { chmodSync, existsSync, readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import type { DataProtectionDTO } from "@/shared/contracts";
import { log } from "../log";

/**
 * Permissões da pasta de dados: só o usuário do processo lê e grava (pastas 0700, arquivos 0600). O SQLite cria os arquivos
 * -wal e -shm com a permissão do banco, por isso o banco nasce fechado e tudo é conferido de novo a cada abertura.
 * Windows não tem permissões POSIX: lá `applies` é falso e quem protege é a ACL da pasta do usuário.
 */
const SUBFOLDERS = ["documents", "backups"];
const OTHERS_MASK = 0o077;

const appliesHere = () => process.platform !== "win32";

function entries(dir: string): Array<{ name: string; path: string; folder: boolean }> {
  const out: Array<{ name: string; path: string; folder: boolean }> = [{ name: ".", path: dir, folder: true }];
  const collect = (base: string, prefix: string) => {
    for (const item of readdirSync(base, { withFileTypes: true })) {
      const name = `${prefix}${item.name}`;
      const path = join(base, item.name);
      if (item.isFile()) out.push({ name, path, folder: false });
      else if (item.isDirectory() && !prefix && SUBFOLDERS.includes(item.name)) {
        out.push({ name, path, folder: true });
        collect(path, `${name}/`);
      }
    }
  };
  collect(dir, "");
  return out;
}

/** Fecha o que estiver aberto. Nunca derruba o Nexo: num volume que o processo não controla, o Diagnóstico mostra o que sobrou. */
export function hardenDataDir(dir: string): void {
  if (!existsSync(dir)) return;
  // A sonda antiga (até a v2) deixava bancos de teste aqui.
  for (const name of readdirSync(dir)) if (/^probe-.*\.sqlite(-wal|-shm|-journal)?$/.test(name)) rmSync(join(dir, name), { force: true });
  if (!appliesHere()) return;
  for (const entry of entries(dir)) {
    try {
      chmodSync(entry.path, entry.folder ? 0o700 : 0o600);
    } catch (error) {
      log.warn("data_permissions_failed", { message: "Não foi possível fechar a permissão de um arquivo de dados.", file: entry.name, error });
    }
  }
}

export function inspectDataProtection(dir: string, env: Record<string, string | undefined> = process.env): DataProtectionDTO {
  const keyFromEnv = Boolean(env.NEXO_ENCRYPTION_KEY?.trim());
  if (!appliesHere()) return { applies: false, ok: true, exposed: [], keyFromEnv };
  const exposed: string[] = [];
  try {
    for (const entry of entries(dir)) {
      if (statSync(entry.path).mode & OTHERS_MASK) exposed.push(entry.name);
    }
  } catch {
    return { applies: true, ok: false, exposed, keyFromEnv };
  }
  return { applies: true, ok: exposed.length === 0, exposed, keyFromEnv };
}
