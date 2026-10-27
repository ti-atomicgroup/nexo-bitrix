import { route } from "@/server/http/handler";
import { taskStatus } from "@/server/services/tasks";

export const dynamic = "force-dynamic";

export const GET = route({ auth: "public", params: ["taskId"] }, ({ params }) => taskStatus(params.taskId));
