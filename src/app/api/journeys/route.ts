import { assertCan } from "@/server/auth/authorize";
import { route } from "@/server/http/handler";
import { startJourney } from "@/server/services/journeys";
import { journeysQueryInput, listJourneySummaries } from "@/server/services/read/journeys";
import { createJourneyInput } from "@/shared/schemas";

export const dynamic = "force-dynamic";

export const GET = route({ auth: "session", operation: "journey.read", input: journeysQueryInput }, ({ input }) => listJourneySummaries(input));

export const POST = route({ auth: "session", operation: "journey.create", input: createJourneyInput }, ({ input, actor, user }) => {
  // Convidar cria uma conta no portal com o privilégio da conta técnica: só a administração.
  if ("invite" in input.person && input.person.invite) assertCan(user, "person.invite");
  return startJourney(input, actor);
});
