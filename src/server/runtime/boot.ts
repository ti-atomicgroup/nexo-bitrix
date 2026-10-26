import "server-only";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildInfo } from "./build-info";
import { resolveDataDir } from "./data-dir";

const BOOT_KEY = Symbol.for("nexo.boot");

export interface BootRecord {
  count: number;
  history: string[];
}

type BootGlobal = typeof globalThis & { [BOOT_KEY]?: { at: string; record: BootRecord | null; error: string | null } };

function readRecord(file: string): BootRecord {
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as Partial<BootRecord>;
    return { count: Number(parsed.count) || 0, history: Array.isArray(parsed.history) ? parsed.history.map(String) : [] };
  } catch {
    return { count: 0, history: [] };
  }
}

/** Registra a inicialização do processo uma única vez. Nunca lança exceção: o servidor precisa subir mesmo com disco indisponível. */
export function recordBoot(): { at: string; record: BootRecord | null; error: string | null } {
  const global = globalThis as BootGlobal;
  if (global[BOOT_KEY]) return global[BOOT_KEY];
  const at = new Date().toISOString();
  let state: { at: string; record: BootRecord | null; error: string | null };
  try {
    const dir = resolveDataDir();
    const file = join(dir.path, "boots.json");
    const previous = readRecord(file);
    const record = { count: previous.count + 1, history: [at, ...previous.history].slice(0, 10) };
    writeFileSync(file, JSON.stringify(record), { mode: 0o600 });
    state = { at, record, error: null };
    console.log(JSON.stringify({ level: "info", event: "boot", at, node: process.version, ...buildInfo(), dataDir: dir.path, dataDirSource: dir.source, boots: record.count }));
  } catch (error) {
    state = { at, record: null, error: error instanceof Error ? error.message : String(error) };
    console.error(JSON.stringify({ level: "error", event: "boot", at, node: process.version, error: state.error }));
  }
  global[BOOT_KEY] = state;
  return state;
}
