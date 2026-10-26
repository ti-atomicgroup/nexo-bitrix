import { route } from "@/server/http/handler";
import { auditQueryInput, recentAudit } from "@/server/services/audit";

export const dynamic = "force-dynamic";

export const GET = route({ auth: "user", input: auditQueryInput }, ({ input }) => recentAudit(input.limit));
