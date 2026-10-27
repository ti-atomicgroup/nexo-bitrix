import { route } from "@/server/http/handler";
import { replaceWebhook } from "@/server/services/settings";
import { startTask, taskStarted } from "@/server/services/tasks";
import { replaceWebhookInput } from "@/shared/schemas";

export const dynamic = "force-dynamic";

// Confere o webhook novo no Bitrix24 em segundo plano: 202 na hora e a tela consulta /api/tasks/:id.
export const POST = route({ auth: "admin", input: replaceWebhookInput }, ({ input, actor }) =>
  taskStarted(startTask("settings.webhook", () => replaceWebhook(input.webhookUrl, actor))),
);
