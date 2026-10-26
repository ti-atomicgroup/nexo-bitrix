import { route } from "@/server/http/handler";
import { buildMe } from "@/server/services/session";

export const dynamic = "force-dynamic";

export const GET = route({ auth: "user" }, ({ user }) => buildMe(user));
