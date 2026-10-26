import { route } from "@/server/http/handler";
import { logout } from "@/server/services/auth";

export const dynamic = "force-dynamic";

export const POST = route({ auth: "user" }, ({ tokenHash }) => logout(tokenHash));
