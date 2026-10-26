import { route } from "@/server/http/handler";
import { refreshPeopleCache } from "@/server/services/read/people";

export const dynamic = "force-dynamic";

export const POST = route({ auth: "user" }, () => refreshPeopleCache());
