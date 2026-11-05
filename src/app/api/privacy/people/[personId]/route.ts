import { route } from "@/server/http/handler";
import { exportSubject } from "@/server/services/privacy";

export const dynamic = "force-dynamic";

export const GET = route({ auth: "session", operation: "privacy.manage", params: ["personId"] }, ({ params, actor }) => exportSubject(params.personId, actor));
