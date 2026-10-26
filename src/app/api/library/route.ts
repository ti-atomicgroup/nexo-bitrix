import { route } from "@/server/http/handler";
import { libraryActivities } from "@/server/services/read/templates";

export const dynamic = "force-dynamic";

export const GET = route({ auth: "user" }, () => libraryActivities());
