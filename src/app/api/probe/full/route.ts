import { workerConfig, workerProbe } from "@/server/bitrix/relay";
import { AppError } from "@/server/errors";
import { route } from "@/server/http/handler";
import { egressProbe, isBitrixHost } from "@/server/runtime/egress";
import { fullProbe } from "@/server/runtime/probe";
import { rateLimit } from "@/server/security/rate-limit";
import type { FullProbeDTO } from "@/shared/contracts";

export const dynamic = "force-dynamic";

/** O teste de saída abre conexões para fora: poucas vezes por minuto, mesmo para a administração. */
const EGRESS_RULE = { limit: 10, windowMs: 60_000 };

export const GET = route({ auth: "session", operation: "diagnostics.read" }, async ({ request, user }) => {
  const host = new URL(request.url).searchParams.get("bitrix")?.trim().toLowerCase() ?? "";
  let egress: FullProbeDTO["egress"] = null;
  if (host) {
    if (!isBitrixHost(host)) {
      egress = { host, error: "Use só o domínio do portal, como suaempresa.bitrix24.com.br. Portal em domínio próprio precisa estar em NEXO_BITRIX_ALLOWED_HOSTS." };
    } else {
      if (!rateLimit(`probe-egress:${user.id}`, EGRESS_RULE).allowed) throw new AppError("TOO_MANY_ATTEMPTS", "Muitos testes seguidos. Espere um minuto.", 429);
      // A mesma saída testada pelo worker do Bitrix24, que é quem faz as chamadas de verdade.
      const [direct, worker] = await Promise.all([egressProbe(host), workerProbe(host)]);
      egress = { ...direct, worker };
    }
  }
  return fullProbe(egress, workerConfig() !== null);
});
