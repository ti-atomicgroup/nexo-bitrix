import { route } from "@/server/http/handler";
import { createAppUser, listAppUsers } from "@/server/services/users";
import { createUserInput } from "@/shared/schemas";

export const dynamic = "force-dynamic";

export const GET = route({ auth: "admin" }, () => listAppUsers());

export const POST = route({ auth: "admin", input: createUserInput }, ({ input, actor }) => createAppUser(input, actor));
