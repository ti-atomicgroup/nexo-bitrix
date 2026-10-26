import { route } from "@/server/http/handler";
import { startJourney } from "@/server/services/journeys";
import { journeysQueryInput, listJourneySummaries } from "@/server/services/read/journeys";
import { createJourneyInput } from "@/shared/schemas";

export const dynamic = "force-dynamic";

export const GET = route({ auth: "user", input: journeysQueryInput }, ({ input }) => listJourneySummaries(input));

export const POST = route({ auth: "user", input: createJourneyInput }, ({ input, actor }) => startJourney(input, actor));
