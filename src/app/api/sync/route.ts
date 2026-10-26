import { route } from "@/server/http/handler";
import { syncNow } from "@/server/services/sync";

export const dynamic = "force-dynamic";

export const POST = route({ auth: "user" }, ({ requestId }) => syncNow(requestId));
