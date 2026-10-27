import "server-only";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getDataDir } from "../db";
import { decryptBytes, encryptBytes } from "./crypto";

/**
 * Espera dos documentos enviados pelo link pessoal: cifrados (AES-256-GCM) em `<pasta de dados>/documents`
 * só até o motor gravá-los no Drive do projeto no Bitrix24. Depois do envio, o arquivo é apagado daqui.
 */
const FOLDER = "documents";
const FILE_NAME = /^[a-f0-9-]{36}\.bin$/;

function folder(): string {
  const path = join(getDataDir(), FOLDER);
  mkdirSync(path, { recursive: true, mode: 0o700 });
  return path;
}

function pathOf(fileName: string): string {
  // Só nomes gerados pelo próprio Nexo: nada de caminhos vindos de fora.
  if (!FILE_NAME.test(fileName)) throw new Error("Nome de arquivo inválido no cofre de documentos.");
  return join(folder(), fileName);
}

/** Guarda o arquivo cifrado e devolve o nome local (`<id>.bin`). */
export function storeDocumentFile(documentId: string, content: Uint8Array): string {
  const fileName = `${documentId}.bin`;
  writeFileSync(pathOf(fileName), encryptBytes(content), { mode: 0o600 });
  return fileName;
}

export function readDocumentFile(fileName: string): Buffer {
  return decryptBytes(readFileSync(pathOf(fileName)));
}

export function removeDocumentFile(fileName: string): void {
  rmSync(pathOf(fileName), { force: true });
}
