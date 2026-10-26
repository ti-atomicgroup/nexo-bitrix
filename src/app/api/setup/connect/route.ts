import { route } from "@/server/http/handler";
import { connectWebhook } from "@/server/services/install";
import { connectWebhookInput } from "@/shared/schemas";

export const dynamic = "force-dynamic";

export const POST = route({ auth: "public", input: connectWebhookInput }, ({ input }) => connectWebhook(input.webhookUrl));
