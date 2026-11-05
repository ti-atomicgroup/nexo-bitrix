import { clientOrigin } from "@/server/http/client-origin";
import { route } from "@/server/http/handler";
import { AppError } from "@/server/errors";
import { basicProbe } from "@/server/runtime/probe";
import { rateLimit } from "@/server/security/rate-limit";
import { recordSecurityEvent } from "@/server/db/repos/security-events";

export const dynamic = "force-dynamic";

const PER_ORIGIN = { limit: 30, windowMs: 60_000 };
const OVERALL = { limit: 300, windowMs: 60_000 };

/** Sonda mínima para o suporte antes do login. O diagnóstico completo é `/api/probe/full`, só para a administração. */
export const GET = route({ auth: "public" }, ({ request }) => {
  const origin = clientOrigin(request);
  if (!rateLimit(`probe-origin:${origin}`, PER_ORIGIN).allowed || !rateLimit("probe:all", OVERALL).allowed) {
    recordSecurityEvent("rate_limited", { origin });
    throw new AppError("TOO_MANY_ATTEMPTS", "Muitas tentativas. Tente de novo em alguns minutos.", 429);
  }
  return basicProbe(request.headers);
});
