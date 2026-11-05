import "server-only";
import { createHash } from "node:crypto";

/**
 * Página de link inativo dos formulários do colaborador. Essas rotas ficam fora do proxy (src/proxy.ts), então a própria
 * resposta traz a CSP, e o único estilo permitido é o desta página, pelo hash.
 */
const CSS = "body{font:16px/1.5 system-ui,sans-serif;background:#eef3ef;color:#0e2a21;padding:24px}main{max-width:520px;margin:0 auto}";
const HASH = createHash("sha256").update(CSS).digest("base64");
const HTML = `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Link indisponível</title><style>${CSS}</style><body><main><h1>Este link não está mais ativo</h1><p>Peça um novo link pessoal ao RH da sua empresa.</p></main></body></html>`;

export function linkGoneResponse(): Response {
  return new Response(HTML, {
    status: 404,
    headers: {
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      "X-Robots-Tag": "noindex, nofollow",
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": `default-src 'none'; style-src 'sha256-${HASH}'; frame-ancestors 'self' https://app.onnira.com https://app.onnira.com.br; base-uri 'none'; form-action 'none'`,
    },
  });
}
