import "server-only";
import type { z } from "zod";
import { AppError } from "../errors";

export const MAX_BODY_BYTES = 1024 * 1024;

const tooLarge = () => new AppError("PAYLOAD_TOO_LARGE", "Envie no máximo 1 MB de dados.", 413);
const invalidJson = () => new AppError("INVALID_INPUT", "Envie os dados em JSON válido.", 400);

/** Lê o corpo como texto, interrompendo a leitura assim que passa do limite. */
export async function readBodyText(request: Request, limit = MAX_BODY_BYTES): Promise<string> {
  const declared = Number(request.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > limit) throw tooLarge();
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel().catch(() => undefined);
      throw tooLarge();
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/** Corpo JSON (vazio vale `{}`, para que o esquema aponte os campos que faltam). */
export async function readJsonBody(request: Request, limit = MAX_BODY_BYTES): Promise<unknown> {
  const text = await readBodyText(request, limit);
  if (!text.trim()) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw invalidJson();
  }
}

export function readQuery(request: Request): Record<string, string> {
  return Object.fromEntries(new URL(request.url).searchParams);
}

/** Para esquemas de query string: `?status=` (vazio) vale como ausente. */
export const blankAsUndefined = (value: unknown): unknown => (value === "" ? undefined : value);

/* Mensagens pt-BR para os erros padrão do zod (os esquemas com mensagem própria têm precedência). */

type RawIssue = Parameters<z.core.$ZodErrorMap>[0];

function count(value: number | bigint, singular: string, plural: string): string {
  return `${value} ${Number(value) === 1 ? singular : plural}`;
}

function sizeMessage(issue: Extract<RawIssue, { code: "too_small" | "too_big" }>): string {
  const small = issue.code === "too_small";
  const limit = issue.code === "too_small" ? issue.minimum : issue.maximum;
  switch (issue.origin) {
    case "string":
      if (small && Number(limit) <= 1) return "Preencha este campo.";
      return small ? `Use pelo menos ${count(limit, "caractere", "caracteres")}.` : `Use no máximo ${count(limit, "caractere", "caracteres")}.`;
    case "array":
    case "set":
      if (small && Number(limit) <= 1) return "Inclua pelo menos um item.";
      return small ? `Inclua pelo menos ${count(limit, "item", "itens")}.` : `Use no máximo ${count(limit, "item", "itens")}.`;
    case "number":
    case "int":
    case "bigint":
      return small ? `Use um valor a partir de ${limit}.` : `Use um valor até ${limit}.`;
    default:
      return "Confira o valor informado.";
  }
}

export const ptBrErrorMap: z.core.$ZodErrorMap = (issue) => {
  switch (issue.code) {
    case "invalid_type":
      if (issue.input === undefined) return "Preencha este campo.";
      if (issue.expected === "number" || issue.expected === "int") return "Informe um número.";
      return "Confira o valor informado.";
    case "too_small":
    case "too_big":
      return sizeMessage(issue);
    case "invalid_value":
      return "Escolha uma das opções disponíveis.";
    case "invalid_format":
      if (issue.format === "email") return "Informe um e-mail válido.";
      if (issue.format === "url") return "Informe um endereço válido.";
      if (issue.format === "uuid") return "Identificador inválido.";
      return "Use o formato pedido.";
    case "unrecognized_keys":
      return "Remova os campos desconhecidos.";
    default:
      return "Confira o valor informado.";
  }
};

/** Valida com o esquema; o primeiro problema vira `AppError` 400 `INVALID_INPUT` com mensagem pronta para a tela. */
export function parseInput<S extends z.ZodType>(schema: S, data: unknown): z.output<S> {
  const parsed = schema.safeParse(data, { error: ptBrErrorMap });
  if (parsed.success) return parsed.data;
  const issue = parsed.error.issues[0];
  const field = issue?.path.map(String).join(".") ?? "";
  throw new AppError("INVALID_INPUT", issue?.message || "Confira os dados enviados.", 400, field ? { field } : undefined);
}
