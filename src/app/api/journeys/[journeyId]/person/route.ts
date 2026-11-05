import { assertCan } from "@/server/auth/authorize";
import { route } from "@/server/http/handler";
import { linkPerson } from "@/server/services/journeys";
import { linkPersonInput } from "@/shared/schemas";

export const dynamic = "force-dynamic";

export const POST = route({ auth: "session", operation: "journey.link_person", params: ["journeyId"], input: linkPersonInput }, ({ params, input, actor, user }) => {
  // Convidar cria uma conta no portal com o privilégio da conta técnica: só a administração.
  if ("inviteEmail" in input) assertCan(user, "person.invite");
  return linkPerson(params.journeyId, input, actor);
});
