import { route } from "@/server/http/handler";
import { buildJourneyDTO } from "@/server/services/read/journeys";

export const dynamic = "force-dynamic";

export const GET = route({ auth: "session", operation: "journey.read", params: ["journeyId"] }, ({ params }) => buildJourneyDTO(params.journeyId));
