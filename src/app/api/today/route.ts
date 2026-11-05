import { route } from "@/server/http/handler";
import { buildToday } from "@/server/services/read/today";

export const dynamic = "force-dynamic";

export const GET = route({ auth: "session", operation: "today.read" }, ({ user }) => buildToday(user));
