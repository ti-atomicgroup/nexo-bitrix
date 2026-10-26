import { route } from "@/server/http/handler";
import { linkPerson } from "@/server/services/journeys";
import { linkPersonInput } from "@/shared/schemas";

export const dynamic = "force-dynamic";

export const POST = route({ auth: "user", params: ["journeyId"], input: linkPersonInput }, ({ params, input, actor }) =>
  linkPerson(params.journeyId, input.bitrixUserId, actor),
);
