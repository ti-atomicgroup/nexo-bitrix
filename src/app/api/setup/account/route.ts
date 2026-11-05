import { clientOrigin } from "@/server/http/client-origin";
import { route } from "@/server/http/handler";
import { sessionResponse } from "@/server/http/session-response";
import { createFirstAccount } from "@/server/services/install";
import { createAccountInput } from "@/shared/schemas";

export const dynamic = "force-dynamic";

// O token de instalação vem no corpo e é conferido no serviço (só enquanto não existe nenhum acesso).
export const POST = route({ auth: "install", input: createAccountInput }, async ({ input, request }) => sessionResponse(await createFirstAccount(input, clientOrigin(request))));
