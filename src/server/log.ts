import "server-only";

/**
 * Log estruturado: uma linha JSON por evento no stdout. Nunca registra segredos:
 * chaves sensíveis viram "[redacted]" e qualquer caminho de webhook (`/rest/<id>/<segredo>`) perde o segredo.
 */
type Level = "info" | "warn" | "error";
export type LogFields = Record<string, unknown>;

const SENSITIVE_KEY = /password|passwd|token|secret|webhook|authorization|cookie|api[-_]?key/i;
const WEBHOOK_PATH = /\/rest\/(\d+)\/[^/\s"'?#<>]+/g;
const MAX_DEPTH = 5;
const MAX_ITEMS = 50;
const MAX_STRING = 2000;

/** Remove o segredo de qualquer URL de webhook dentro do texto. */
export function redactText(value: string): string {
  const clean = value.replace(WEBHOOK_PATH, "/rest/$1/[redacted]");
  return clean.length > MAX_STRING ? `${clean.slice(0, MAX_STRING)}…` : clean;
}

function redactError(error: Error, depth: number): Record<string, unknown> {
  const out: Record<string, unknown> = { name: error.name, message: redactText(error.message) };
  const code = (error as { code?: unknown }).code;
  if (typeof code === "string" || typeof code === "number") out.code = code;
  if (error.stack) out.stack = redactText(error.stack.split("\n").slice(0, 6).join("\n"));
  if (error.cause !== undefined && depth < MAX_DEPTH) out.cause = redact(error.cause, depth + 1);
  return out;
}

export function redact(value: unknown, depth = 0): unknown {
  if (typeof value === "string") return redactText(value);
  if (typeof value === "bigint") return value.toString();
  if (value === null || typeof value !== "object") return typeof value === "function" || typeof value === "symbol" ? undefined : value;
  if (depth >= MAX_DEPTH) return "[…]";
  if (value instanceof Error) return redactError(value, depth);
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  if (Array.isArray(value)) return value.slice(0, MAX_ITEMS).map((item) => redact(item, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    out[key] = SENSITIVE_KEY.test(key) ? "[redacted]" : redact(item, depth + 1);
  }
  return out;
}

function write(level: Level, event: string, fields: LogFields = {}): void {
  const safe = redact(fields) as Record<string, unknown>;
  const line: Record<string, unknown> = { at: new Date().toISOString(), level, event };
  for (const [key, value] of Object.entries(safe)) {
    if (!(key in line) && value !== undefined) line[key] = value;
  }
  try {
    console.log(JSON.stringify(line));
  } catch {
    // Log nunca derruba a requisição.
  }
}

export const log = {
  info: (event: string, fields?: LogFields) => write("info", event, fields),
  warn: (event: string, fields?: LogFields) => write("warn", event, fields),
  error: (event: string, fields?: LogFields) => write("error", event, fields),
};
