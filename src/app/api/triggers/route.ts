import { route } from "@/server/http/handler";
import { createTriggerFromInput, listTriggerDTOs } from "@/server/services/read/triggers";
import { triggerInput } from "@/shared/schemas";

export const dynamic = "force-dynamic";

export const GET = route({ auth: "session", operation: "trigger.read" }, () => listTriggerDTOs());

export const POST = route({ auth: "session", operation: "trigger.write", input: triggerInput }, ({ input, actor }) => createTriggerFromInput(input, actor));
