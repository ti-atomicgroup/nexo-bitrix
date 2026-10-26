import { route } from "@/server/http/handler";
import { deleteTriggerById, updateTriggerFromInput } from "@/server/services/read/triggers";
import { triggerInput } from "@/shared/schemas";

export const dynamic = "force-dynamic";

export const PUT = route({ auth: "admin", params: ["triggerId"], input: triggerInput }, ({ params, input, actor }) =>
  updateTriggerFromInput(params.triggerId, input, actor),
);

export const DELETE = route({ auth: "admin", params: ["triggerId"] }, ({ params, actor }) => deleteTriggerById(params.triggerId, actor));
