import "server-only";
import { isIP } from "node:net";
import { AppError } from "../errors";

export interface BitrixCredentials {
  /** Origem do portal, sem barra final (ex.: https://empresa.bitrix24.com.br). */
  portal: string;
  userId: string;
  secret: string;
}

const PATH_PATTERN = /^\/rest\/(\d{1,12})\/([A-Za-z0-9_]{4,128})\/?$/;
const PRIVATE_SUFFIXES = [".localhost", ".local", ".internal", ".lan", ".home", ".corp", ".intranet"];

const invalid = (message: string) => new AppError("WEBHOOK_URL_INVALID", message, 400);

/**
 * Valida o webhook de entrada do Bitrix24 e separa portal, usuário e segredo.
 * Aceita qualquer domínio público (inclusive domínio próprio), mas só https, sem porta, credenciais, parâmetros ou IP.
 */
export function parseWebhookUrl(value: string): BitrixCredentials {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw invalid("Cole o endereço completo do webhook, começando com https://.");
  }
  if (url.protocol !== "https:") throw invalid("O webhook precisa começar com https://.");
  if (url.username || url.password) throw invalid("O endereço do webhook não pode conter usuário ou senha.");
  if (url.search || url.hash || value.includes("?") || value.includes("#")) throw invalid("Cole o endereço sem nada depois de ? ou #.");
  if (url.port && url.port !== "443") throw invalid("Use o endereço padrão do portal, sem número de porta.");
  const hostname = url.hostname.replace(/\.$/, "").toLowerCase();
  const bare = hostname.replace(/^\[|\]$/g, "");
  if (isIP(bare) || bare.includes(":")) throw invalid("Use o endereço do seu portal Bitrix24, não um endereço IP.");
  if (!hostname.includes(".") || hostname === "localhost" || PRIVATE_SUFFIXES.some((suffix) => hostname.endsWith(suffix))) {
    throw invalid("Use o endereço público do seu portal Bitrix24.");
  }
  const match = PATH_PATTERN.exec(url.pathname);
  if (!match?.[1] || !match[2]) throw invalid("O caminho do webhook deve ser /rest/<número>/<código>/, como o Bitrix24 mostra ao criá-lo.");
  return { portal: `https://${hostname}`, userId: match[1], secret: match[2] };
}

/** Forma canônica guardada cifrada: https://portal/rest/<id>/<segredo>/ */
export function normalizeWebhookUrl(credentials: BitrixCredentials): string {
  return `${credentials.portal}/rest/${credentials.userId}/${credentials.secret}/`;
}

/** "https://empresa.bitrix24.com.br/rest/1/••••••/": para exibir sem revelar o segredo. */
export function maskWebhookUrl(value: string): string {
  try {
    const { portal, userId } = parseWebhookUrl(value);
    return `${portal}/rest/${userId}/••••••/`;
  } catch {
    return "••••••";
  }
}

/** Defesa extra para logs: apaga qualquer trecho /rest/<id>/<segredo>/ que escape num texto. */
export function redactWebhookSecrets(text: string): string {
  return text.replace(/\/rest\/(\d+)\/[A-Za-z0-9_]+/g, "/rest/$1/••••••");
}
