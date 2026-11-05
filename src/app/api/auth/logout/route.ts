import { route } from "@/server/http/handler";
import { loggedOutResponse } from "@/server/http/session-response";
import { logout } from "@/server/services/auth";

export const dynamic = "force-dynamic";

export const POST = route({ auth: "session", operation: "session.self" }, ({ tokenHash }) => {
  logout(tokenHash);
  return loggedOutResponse();
});
