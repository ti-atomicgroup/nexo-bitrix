import { CLIENT_HEADER, countCookies, fetchSiteLabel, isOwnClient, PROBE_COOKIE, probeCookie, probeHintCookie, readCookie } from "@/server/auth/session-cookie";
import { route } from "@/server/http/handler";
import type { SessionTransportDTO } from "@/shared/contracts";

export const dynamic = "force-dynamic";

/**
 * Teste do cookie protegido antes de entrar: a primeira chamada grava um cookie sem valor; a segunda diz se ele voltou.
 * Confere também o cabeçalho da interface, sem o qual o cookie não vale: se a borda o removesse, a sessão cairia a cada pedido.
 * `seen` diz ao diagnóstico onde o cookie se perdeu. Rota pública: só contagem e presença, nunca nomes nem valores do que chegou.
 */
export const GET = route({ auth: "public" }, ({ request }) => {
  const returned = readCookie(request, PROBE_COOKIE) !== null;
  const count = countCookies(request);
  const body: SessionTransportDTO = {
    cookie: returned && isOwnClient(request),
    seen: { cookieHeader: count > 0, cookieCount: count, probeReturned: returned, clientHeader: request.headers.has(CLIENT_HEADER), fetchSite: fetchSiteLabel(request) },
  };
  if (returned) return Response.json(body);
  const headers = new Headers();
  headers.append("Set-Cookie", probeCookie());
  headers.append("Set-Cookie", probeHintCookie());
  return Response.json(body, { headers });
});
