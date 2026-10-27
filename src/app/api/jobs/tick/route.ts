import { kick } from "@/server/engine";
import { AppError } from "@/server/errors";
import { isWorkerRequest } from "@/server/bitrix/relay";
import { route } from "@/server/http/handler";

export const dynamic = "force-dynamic";

/** Rota interna: o worker do Bitrix24 chama por http://127.0.0.1 a cada minuto para o motor rodar os trabalhos pendentes. */
export const POST = route({ auth: "public" }, ({ request }) => {
  if (!isWorkerRequest(request)) throw new AppError("NOT_FOUND", "Não encontramos o que você procurou.", 404);
  kick();
  return { ok: true };
});
