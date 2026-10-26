import { route } from "@/server/http/handler";
import { replaceWebhook } from "@/server/services/settings";
import { replaceWebhookInput } from "@/shared/schemas";

export const dynamic = "force-dynamic";

export const POST = route({ auth: "admin", input: replaceWebhookInput }, ({ input, actor }) => replaceWebhook(input.webhookUrl, actor));
