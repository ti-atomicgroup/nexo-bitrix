import { route } from "@/server/http/handler";
import { buildToday } from "@/server/services/read/today";

export const dynamic = "force-dynamic";

export const GET = route({ auth: "user" }, ({ user }) => buildToday(user));
