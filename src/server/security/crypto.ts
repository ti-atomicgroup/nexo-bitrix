import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { closeSync, existsSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getDataDir } from "../db";
import { AppError } from "../errors";

const KEY_FILE = ".nexo-key";
const KEY_CACHE = Symbol.for("nexo.instance-key");
type KeyGlobal = typeof globalThis & { [KEY_CACHE]?: Buffer };

/**
 * Chave AES-256 da instância: `NEXO_ENCRYPTION_KEY` (64 hex) ou um arquivo `0600` gerado na pasta de dados.
 * Limitação conhecida (documentada em docs/seguranca-lgpd.md): a chave fica no mesmo volume do banco.
 */
export function instanceKey(dataDir = getDataDir()): Buffer {
  const global = globalThis as KeyGlobal;
  if (global[KEY_CACHE]) return global[KEY_CACHE];
  const fromEnv = process.env.NEXO_ENCRYPTION_KEY?.trim();
  let hex: string;
  if (fromEnv) {
    if (!/^[a-f\d]{64}$/i.test(fromEnv)) throw new AppError("ENCRYPTION_KEY_INVALID", "NEXO_ENCRYPTION_KEY precisa ter 64 caracteres hexadecimais.", 500);
    hex = fromEnv;
  } else {
    const file = join(dataDir, KEY_FILE);
    if (!existsSync(file)) {
      try {
        const handle = openSync(file, "wx", 0o600);
        try {
          writeFileSync(handle, randomBytes(32).toString("hex"));
        } finally {
          closeSync(handle);
        }
      } catch (error) {
        if (!(error instanceof Error && "code" in error && error.code === "EEXIST")) throw error;
      }
    }
    hex = readFileSync(file, "utf8").trim();
    if (!/^[a-f\d]{64}$/i.test(hex)) throw new AppError("ENCRYPTION_KEY_INVALID", "O arquivo de chave da instância está corrompido.", 500);
  }
  global[KEY_CACHE] = Buffer.from(hex, "hex");
  return global[KEY_CACHE];
}

/** Para testes: esquece a chave em cache (ex.: ao trocar a pasta de dados). */
export function resetInstanceKeyForTests(): void {
  delete (globalThis as KeyGlobal)[KEY_CACHE];
}

export function encrypt(value: string, key = instanceKey()): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const payload = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), payload.toString("base64url")].join(".");
}

export function decrypt(value: string, key = instanceKey()): string {
  const [version, iv, tag, payload] = value.split(".");
  if (version !== "v1" || !iv || !tag || !payload) throw new AppError("CIPHER_INVALID", "Credencial cifrada inválida.", 500);
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(payload, "base64url")), decipher.final()]).toString("utf8");
}

/** Arquivo binário cifrado: iv (12) + tag (16) + conteúdo. */
export function encryptBytes(value: Uint8Array, key = instanceKey()): Buffer {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const payload = Buffer.concat([cipher.update(value), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), payload]);
}

export function decryptBytes(value: Uint8Array, key = instanceKey()): Buffer {
  const data = Buffer.from(value);
  if (data.length < 28) throw new AppError("CIPHER_INVALID", "Arquivo cifrado inválido.", 500);
  const decipher = createDecipheriv("aes-256-gcm", key, data.subarray(0, 12));
  decipher.setAuthTag(data.subarray(12, 28));
  return Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]);
}

/** Token aleatório de 256 bits (sessões, link do colaborador, instalação). */
export function newToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Só o hash do token vai para o banco. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const first = Buffer.from(a);
  const second = Buffer.from(b);
  return first.length === second.length && timingSafeEqual(first, second);
}
