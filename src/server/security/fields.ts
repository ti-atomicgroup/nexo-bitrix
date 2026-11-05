import "server-only";
import { log } from "../log";
import { decrypt, encrypt, instanceKey } from "./crypto";

/**
 * Cifragem de campo (AES-256-GCM, chave da instância) para os dados de maior risco guardados no SQLite: quem copia só o
 * banco ou um backup não lê motivo de desligamento, inventário, e-mails nem o texto do histórico. A lista está em
 * docs/seguranca-lgpd.md. O prefixo separa valor cifrado de valor antigo em texto, que continua legível até a migração.
 */
const PREFIX = "enc:v1:";

export const isSealed = (value: unknown): boolean => typeof value === "string" && value.startsWith(PREFIX);

export function sealField<T extends string | null | undefined>(value: T, key?: Buffer): T | string {
  if (typeof value !== "string" || value === "" || value.startsWith(PREFIX)) return value;
  return `${PREFIX}${encrypt(value, key ?? instanceKey())}`;
}

/** Valor em texto. Cifrado com outra chave (chave trocada ou perdida) volta como nulo, nunca derruba a tela. */
export function openField(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value);
  if (!text.startsWith(PREFIX)) return text;
  try {
    return decrypt(text.slice(PREFIX.length));
  } catch (error) {
    log.error("sealed_field_unreadable", { message: "Campo cifrado ilegível: a chave da instância mudou?", error });
    return null;
  }
}
