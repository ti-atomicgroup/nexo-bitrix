import { route } from "@/server/http/handler";
import { changePassword } from "@/server/services/auth";
import { changePasswordInput } from "@/shared/schemas";

export const dynamic = "force-dynamic";

export const POST = route({ auth: "user", input: changePasswordInput }, ({ user, tokenHash, input }) => changePassword(user, tokenHash, input));
