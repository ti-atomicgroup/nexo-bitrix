import "server-only";
import { accessSync, constants, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

export const ONNIRA_VOLUME = "/app/.data";
/** Volume persistente da Onnira: a pasta oculta `.data` do projeto (em /app ou na pasta onde o Nexo roda). */
export const onniraVolumes = (): string[] => [ONNIRA_VOLUME, resolve(/*turbopackIgnore: true*/ process.cwd(), ".data")];

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
 * Pasta de dados: NEXO_DATA_DIR → volume persistente da Onnira (/app/.data ou ./.data, se existe e é gravável) → ./data.
 * Na Onnira, `./data` do guia do desafio corresponde ao volume `.data`; fora dele os dados se perdem a cada publicação.
 */
export function resolveDataDir(env: Record<string, string | undefined> = process.env, volumes = onniraVolumes()): DataDirChoice {
  const configured = env.NEXO_DATA_DIR?.trim();
  // Caminhos decididos em tempo de execução: o rastreador do Turbopack não deve incluí-los no build.
  if (configured) {
    const path = resolve(/*turbopackIgnore: true*/ configured);
    mkdirSync(/*turbopackIgnore: true*/ path, { recursive: true, mode: 0o700 });
    return { path, source: "NEXO_DATA_DIR" };
  }
  const volume = volumes.find((candidate) => existsSync(/*turbopackIgnore: true*/ candidate) && writable(candidate));
  if (volume) return { path: volume, source: "onnira-volume" };
  const path = resolve(/*turbopackIgnore: true*/ process.cwd(), "data");
  mkdirSync(/*turbopackIgnore: true*/ path, { recursive: true, mode: 0o700 });
  return { path, source: "local" };
}
