#!/usr/bin/env node
/**
 * Restaura uma cópia de segurança cifrada do Nexo para um arquivo novo. Nunca toca no banco em uso.
 * Uso: npm run backup:restaurar -- <arquivo .sqlite.enc> <destino.sqlite>
 * A chave vem de NEXO_ENCRYPTION_KEY ou do arquivo .nexo-key da pasta de dados. Pare o Nexo e troque o banco à mão depois de conferir.
 */
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { decryptBackupFile } from "./lib/backup-file.mjs";

function dataDir() {
  if (process.env.NEXO_DATA_DIR?.trim()) return resolve(process.env.NEXO_DATA_DIR.trim());
  if (existsSync("/app/.data/.nexo-key")) return "/app/.data";
  if (existsSync(".data/.nexo-key")) return resolve(process.cwd(), ".data");
  return resolve(process.cwd(), "data");
}

const [source, target] = process.argv.slice(2);
if (!source || !target) {
  console.error("Uso: npm run backup:restaurar -- <arquivo .sqlite.enc> <destino.sqlite>");
  process.exit(1);
}
if (existsSync(resolve(target))) {
  console.error("O destino já existe. Escolha outro nome: a restauração nunca sobrescreve um arquivo.");
  process.exit(1);
}
const keyFile = join(dataDir(), ".nexo-key");
const key = process.env.NEXO_ENCRYPTION_KEY?.trim() || (existsSync(keyFile) ? readFileSync(keyFile, "utf8").trim() : "");
if (!key) {
  console.error("Não encontrei a chave: defina NEXO_ENCRYPTION_KEY ou rode na pasta do Nexo. Sem a chave, a cópia não abre.");
  process.exit(1);
}
try {
  await decryptBackupFile(resolve(source), resolve(target), key);
  console.log(`Pronto: ${resolve(target)}. Confira antes de trocar o banco, com o Nexo parado.`);
} catch (error) {
  console.error(`Não deu para restaurar: ${error?.message ?? error}. A chave é a mesma da instância que gerou a cópia?`);
  process.exit(1);
}
