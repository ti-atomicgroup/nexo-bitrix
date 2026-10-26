import { route } from "@/server/http/handler";
import { runJourneyAction } from "@/server/services/journeys";
import { journeyActionInput } from "@/shared/schemas";

export const dynamic = "force-dynamic";

export const POST = route({ auth: "user", params: ["journeyId"], input: journeyActionInput }, ({ params, input, actor }) =>
  runJourneyAction(params.journeyId, input, actor),
);
