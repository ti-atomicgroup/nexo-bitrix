import { route } from "@/server/http/handler";
import { runActivityAction } from "@/server/services/journeys";
import { activityActionInput } from "@/shared/schemas";

export const dynamic = "force-dynamic";

export const POST = route({ auth: "user", params: ["activityId"], input: activityActionInput }, ({ params, input, actor }) =>
  runActivityAction(params.activityId, input, actor),
);
