import "server-only";

/**
 * Cookies da sessão. `__Host-` obriga Secure, Path=/ e nenhum Domain: outro app no mesmo domínio-pai não consegue gravá-los.
 * `SameSite=None; Partitioned` é o que funciona no iframe do painel da Onnira: o cookie fica preso ao site de cima, então
 * uma página de terceiros não o recebe. Como `SameSite=None` deixa de barrar outros sites nos navegadores sem partição, o
 * cookie só vale junto com `X-Nexo-Client`, que obriga a pré-verificação de CORS, nunca liberada pelo Nexo.
 */
export const SESSION_COOKIE = "__Host-nexo_session";
/** Dica sem segredo, legível pelo JavaScript: a interface sabe que vale a pena pedir `/api/me`. */
export const SIGNED_COOKIE = "__Host-nexo_signed";
export const PROBE_COOKIE = "__Host-nexo_probe";
export const CLIENT_HEADER = "x-nexo-client";

const ATTRIBUTES = "Path=/; Secure; SameSite=None; Partitioned";
const PROBE_MAX_AGE_S = 60;

export function sessionCookies(token: string, maxAgeSeconds: number): string[] {
  return [`${SESSION_COOKIE}=${token}; ${ATTRIBUTES}; HttpOnly; Max-Age=${maxAgeSeconds}`, `${SIGNED_COOKIE}=1; ${ATTRIBUTES}; Max-Age=${maxAgeSeconds}`];
}

export function clearedSessionCookies(): string[] {
  return [`${SESSION_COOKIE}=; ${ATTRIBUTES}; HttpOnly; Max-Age=0`, `${SIGNED_COOKIE}=; ${ATTRIBUTES}; Max-Age=0`];
}

export function probeCookie(): string {
  return `${PROBE_COOKIE}=1; ${ATTRIBUTES}; HttpOnly; Max-Age=${PROBE_MAX_AGE_S}`;
}

export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator > 0 && part.slice(0, separator).trim() === name) return part.slice(separator + 1).trim();
  }
  return null;
}

/** Fetch Metadata: o navegador diz de onde veio o pedido. `none` é navegação direta; a ausência é navegador antigo ou chamada fora do navegador. */
function fetchSite(request: Request): string | null {
  return request.headers.get("sec-fetch-site")?.toLowerCase() ?? null;
}

/** Só a própria interface usa o cookie. */
export function isOwnClient(request: Request): boolean {
  if (!request.headers.get(CLIENT_HEADER)) return false;
  const site = fetchSite(request);
  return site === null || site === "same-origin";
}

/** Escrita pedida por outra página (formulário forjado, mesmo em rota pública como o login): nunca vale. */
export function isCrossSiteWrite(request: Request): boolean {
  const method = request.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return false;
  const site = fetchSite(request);
  return site === "cross-site" || site === "same-site";
}
