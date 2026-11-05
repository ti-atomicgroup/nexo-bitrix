import { clientOrigin } from "@/server/http/client-origin";
import { route } from "@/server/http/handler";
import { startConnectWebhook } from "@/server/services/install";
import { taskStarted } from "@/server/services/tasks";
import { connectWebhookInput } from "@/shared/schemas";

export const dynamic = "force-dynamic";

export const POST = route({ auth: "public", input: connectWebhookInput }, ({ input, request }) => taskStarted(startConnectWebhook(input.webhookUrl, clientOrigin(request))));
