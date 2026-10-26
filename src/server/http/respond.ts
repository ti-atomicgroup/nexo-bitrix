import "server-only";

/** Respostas da API: JSON, nunca em cache, com o id da requisição para cruzar com o log. */
export function baseHeaders(requestId: string): Record<string, string> {
  return { "Cache-Control": "no-store", "X-Request-Id": requestId };
}

export function json(data: unknown, requestId: string, status = 200): Response {
  return Response.json(data, { status, headers: baseHeaders(requestId) });
}

/** Corpo `ApiErrorDTO` ({ error: { code, message } }), com `details` só quando o erro traz dados seguros para a tela. */
export function errorJson(requestId: string, status: number, code: string, message: string, details?: Record<string, unknown>): Response {
  const error: Record<string, unknown> = { code, message };
  if (details && Object.keys(details).length) error.details = details;
  if (status >= 500) error.requestId = requestId;
  return json({ error }, requestId, status);
}

/** Garante os cabeçalhos padrão numa resposta pronta (ex.: redirecionamento) devolvida pelo serviço. */
export function withBaseHeaders(response: Response, requestId: string): Response {
  for (const [key, value] of Object.entries(baseHeaders(requestId))) {
    if (!response.headers.has(key)) {
      try {
        response.headers.set(key, value);
      } catch {
        // cabeçalhos imutáveis (ex.: Response.redirect): mantém como veio
      }
    }
  }
  return response;
}
