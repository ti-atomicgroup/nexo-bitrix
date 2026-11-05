import { NextResponse, type NextRequest } from "next/server";

/**
 * Content-Security-Policy com nonce, nova a cada página. Só os scripts e estilos que o próprio Nexo emitiu nesta resposta rodam:
 * sem `unsafe-inline`, um script injetado por XSS não executa. O Next lê o nonce do cabeçalho e o aplica aos scripts dele.
 * Exige renderização dinâmica: o layout raiz chama `connection()`. Em desenvolvimento, o Next e o React precisam de eval e estilos inline.
 */
const production = process.env.NODE_ENV === "production";

// A Onnira exibe o app dentro do painel (iframe). Localhost só fora de produção (testes locais): em produção, nenhuma página local emoldura o Nexo.
const frameAncestors = ["'self'", "https://app.onnira.com", "https://app.onnira.com.br", ...(production ? [] : ["http://localhost:*", "http://127.0.0.1:*"])].join(" ");

export function pageContentSecurityPolicy(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${production ? "" : " 'unsafe-eval'"}`,
    production ? `style-src 'self' 'nonce-${nonce}'` : "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src 'self'${production ? "" : " ws: wss:"}`,
    `frame-ancestors ${frameAncestors}`,
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join("; ");
}

export function proxy(request: NextRequest): NextResponse {
  const nonce = Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString("base64");
  const policy = pageContentSecurityPolicy(nonce);
  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", policy);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("Content-Security-Policy", policy);
  return response;
}

export const config = {
  matcher: [
    /*
     * Só documentos HTML. Ficam de fora: API e /health (CSP fixa no next.config), arquivos estáticos e os POSTs do link do
     * colaborador. O proxy guardaria o corpo em memória e cortaria em 10 MB o envio de documentos, que passa um pouco disso.
     */
    {
      source: "/((?!api/|health$|_next/static|_next/image|favicon\\.ico|icon\\.svg|j/[^/]+/(?:feito|documento)$).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
