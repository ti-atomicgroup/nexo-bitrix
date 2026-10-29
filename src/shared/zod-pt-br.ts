/**
 * Mensagens pt-BR para os erros padrão do zod, no servidor e no navegador (os esquemas com mensagem própria têm precedência).
 * `schemas.ts` liga este mapa como padrão do zod: os formulários que validam antes de enviar mostram o mesmo texto da API.
 */
import type { z } from "zod";

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

