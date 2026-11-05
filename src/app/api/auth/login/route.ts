import { clientOrigin } from "@/server/http/client-origin";
import { route } from "@/server/http/handler";
import { sessionResponse } from "@/server/http/session-response";
import { login } from "@/server/services/auth";
import { loginInput } from "@/shared/schemas";

export const dynamic = "force-dynamic";

export const POST = route({ auth: "public", input: loginInput }, async ({ input, request }) => sessionResponse(await login(input, Date.now(), clientOrigin(request))));
