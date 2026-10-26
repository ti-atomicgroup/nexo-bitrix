import "server-only";
import { accessSync, constants, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

export const ONNIRA_VOLUME = "/app/.data";

export interface DataDirChoice {
  path: string;
  source: "NEXO_DATA_DIR" | "onnira-volume" | "local";
}

function writable(path: string): boolean {
  try {
    accessSync(/*turbopackIgnore: true*/ path, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Pasta de dados: NEXO_DATA_DIR → volume persistente da Onnira (/app/.data, se gravável) → ./data.
 * Na Onnira, `./data` do guia do desafio corresponde ao volume /app/.data.
 */
export function resolveDataDir(env: Record<string, string | undefined> = process.env, volume = ONNIRA_VOLUME): DataDirChoice {
  const configured = env.NEXO_DATA_DIR?.trim();
  // Caminhos decididos em tempo de execução: o rastreador do Turbopack não deve incluí-los no build.
  if (configured) {
    const path = resolve(/*turbopackIgnore: true*/ configured);
    mkdirSync(/*turbopackIgnore: true*/ path, { recursive: true, mode: 0o700 });
    return { path, source: "NEXO_DATA_DIR" };
  }
  if (existsSync(/*turbopackIgnore: true*/ volume) && writable(volume)) return { path: volume, source: "onnira-volume" };
  const path = resolve(/*turbopackIgnore: true*/ process.cwd(), "data");
  mkdirSync(/*turbopackIgnore: true*/ path, { recursive: true, mode: 0o700 });
  return { path, source: "local" };
}
