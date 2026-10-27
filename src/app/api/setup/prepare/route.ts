import { route } from "@/server/http/handler";
import { startPrepare } from "@/server/services/install";
import { taskStarted } from "@/server/services/tasks";
import { prepareInput } from "@/shared/schemas";

export const dynamic = "force-dynamic";

export const POST = route({ auth: "admin", input: prepareInput }, ({ input, actor }) => taskStarted(startPrepare(input, actor)));
