import { route } from "@/server/http/handler";
import { createAppUser, listAppUsers } from "@/server/services/users";
import { createUserInput } from "@/shared/schemas";

export const dynamic = "force-dynamic";

export const GET = route({ auth: "session", operation: "users.manage" }, () => listAppUsers());

export const POST = route({ auth: "session", operation: "users.manage", input: createUserInput }, ({ input, actor }) => createAppUser(input, actor));
