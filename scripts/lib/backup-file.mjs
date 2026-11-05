/**
 * Formato da cópia de segurança: "NEXOBK1\n" + iv (12 bytes) + conteúdo cifrado (AES-256-GCM) + tag (16 bytes).
 * Em fluxo, para caber nos 512 MB da hospedagem. Compartilhado entre o servidor e `npm run backup:restaurar`.
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { createReadStream, createWriteStream, existsSync, openSync, closeSync, fstatSync, readSync, renameSync, rmSync } from "node:fs";
import { pipeline } from "node:stream/promises";

const MAGIC = Buffer.from("NEXOBK1\n");
const IV_BYTES = 12;
const TAG_BYTES = 16;

function parseKey(hexKey) {
  if (!/^[a-f\d]{64}$/i.test(hexKey)) throw new Error("A chave precisa ter 64 caracteres hexadecimais.");
  return Buffer.from(hexKey, "hex");
}

/** Cifra `source` em `target` (permissão 0600). Só aparece com o nome final depois de pronta: nunca há cópia pela metade com cara de válida. */
export async function encryptBackupFile(source, target, hexKey) {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", parseKey(hexKey), iv);
  const partial = `${target}.parcial`;
  async function* framed(content) {
    yield MAGIC;
    yield iv;
    for await (const chunk of content) yield chunk;
    yield cipher.getAuthTag();
  }
  try {
    await pipeline(createReadStream(source), cipher, framed, createWriteStream(partial, { flags: "wx", mode: 0o600 }));
    renameSync(partial, target);
  } catch (error) {
    rmSync(partial, { force: true });
    throw error;
  }
}

/** Decifra em `target` (permissão 0600). Chave errada ou arquivo adulterado: erro, e nada fica no destino. */
export async function decryptBackupFile(source, target, hexKey) {
  if (existsSync(target)) throw new Error("O destino já existe. Escolha outro nome: a restauração nunca sobrescreve um arquivo.");
  const input = openSync(source, "r");
  let iv;
  let tag;
  let size;
  try {
    size = fstatSync(input).size;
    const header = Buffer.alloc(MAGIC.length + IV_BYTES);
    tag = Buffer.alloc(TAG_BYTES);
    if (size < header.length + TAG_BYTES || readSync(input, header, 0, header.length, 0) !== header.length || !header.subarray(0, MAGIC.length).equals(MAGIC)) {
      throw new Error("Este arquivo não é uma cópia de segurança do Nexo.");
    }
    iv = header.subarray(MAGIC.length);
    readSync(input, tag, 0, TAG_BYTES, size - TAG_BYTES);
  } finally {
    closeSync(input);
  }
  const decipher = createDecipheriv("aes-256-gcm", parseKey(hexKey), iv);
  decipher.setAuthTag(tag);
  const start = MAGIC.length + IV_BYTES;
  const end = size - TAG_BYTES - 1;
  try {
    await pipeline(createReadStream(source, { start, end }), decipher, createWriteStream(target, { flags: "wx", mode: 0o600 }));
  } catch (error) {
    rmSync(target, { force: true });
    throw error;
  }
}
