import { route } from "@/server/http/handler";
import { publicStatus } from "@/server/services/setup-state";

export const dynamic = "force-dynamic";

export const GET = route({ auth: "public" }, () => publicStatus());
