import "server-only";
import { randomUUID } from "node:crypto";
import type { SqlInput } from "../driver";

export const nowIso = (): string => new Date().toISOString();
export const newId = (): string => randomUUID();

export function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string") return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export const toBool = (value: unknown): boolean => value === 1 || value === true || value === "1" || value === 1n;
export const toNumberOrNull = (value: unknown): number | null => (value === null || value === undefined ? null : Number(value));
export const toStringOrNull = (value: unknown): string | null => (value === null || value === undefined ? null : String(value));

/** Monta `SET a = @a, b = @b` só com as chaves presentes no patch (mapa camelCase → coluna). */
export function buildSet(patch: object, columns: Record<string, string>): { sql: string; params: Record<string, SqlInput> } {
  const parts: string[] = [];
  const params: Record<string, SqlInput> = {};
  const values = patch as Record<string, unknown>;
  for (const [key, column] of Object.entries(columns)) {
    if (!(key in values)) continue;
    const value = values[key];
    parts.push(`${column} = @${key}`);
    params[key] = value !== null && typeof value === "object" && !(value instanceof Uint8Array) ? JSON.stringify(value) : (value as SqlInput);
  }
  return { sql: parts.join(", "), params };
}

/** Remove acentos e caixa para buscas em português. */
export function normalizeSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}
