import { isOwnClient, PROBE_COOKIE, probeCookie, readCookie } from "@/server/auth/session-cookie";
import { route } from "@/server/http/handler";
import type { SessionTransportDTO } from "@/shared/contracts";

export const dynamic = "force-dynamic";

/**
 * Teste do cookie protegido antes de entrar: a primeira chamada grava um cookie sem valor; a segunda diz se ele voltou.
 * Confere também o cabeçalho da interface, sem o qual o cookie não vale: se a borda o removesse, a sessão cairia a cada pedido.
 */
export const GET = route({ auth: "public" }, ({ request }) => {
  const returned = readCookie(request, PROBE_COOKIE) !== null;
  const body: SessionTransportDTO = { cookie: returned && isOwnClient(request) };
  return Response.json(body, returned ? {} : { headers: { "Set-Cookie": probeCookie() } });
});
