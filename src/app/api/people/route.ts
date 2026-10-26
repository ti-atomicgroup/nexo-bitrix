import { route } from "@/server/http/handler";
import { searchPeopleDTO } from "@/server/services/read/people";
import { peopleQueryInput } from "@/shared/schemas";

export const dynamic = "force-dynamic";

export const GET = route({ auth: "user", input: peopleQueryInput }, ({ input }) => searchPeopleDTO(input.query, input.limit));
