import { route } from "@/server/http/handler";
import { searchPeopleDTO } from "@/server/services/read/people";
import { peopleQueryInput } from "@/shared/schemas";

export const dynamic = "force-dynamic";

export const GET = route({ auth: "session", operation: "people.read", input: peopleQueryInput }, ({ input }) => searchPeopleDTO(input.query, input.limit));
