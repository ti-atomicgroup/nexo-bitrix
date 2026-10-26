import { route } from "@/server/http/handler";
import { prepare } from "@/server/services/install";
import { prepareInput } from "@/shared/schemas";

export const dynamic = "force-dynamic";

export const POST = route({ auth: "admin", input: prepareInput }, ({ input, actor }) => prepare(input, actor));
