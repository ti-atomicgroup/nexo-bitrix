import { route } from "@/server/http/handler";
import { buildMe } from "@/server/services/session";

export const dynamic = "force-dynamic";

export const GET = route({ auth: "session", operation: "session.self" }, ({ user }) => buildMe(user));
