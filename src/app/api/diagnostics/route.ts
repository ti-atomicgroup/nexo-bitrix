import { route } from "@/server/http/handler";
import { getDiagnostics } from "@/server/services/diagnostics";

export const dynamic = "force-dynamic";

export const GET = route({ auth: "user" }, () => getDiagnostics());
