import { route } from "@/server/http/handler";
import { login } from "@/server/services/auth";
import { loginInput } from "@/shared/schemas";

export const dynamic = "force-dynamic";

export const POST = route({ auth: "public", input: loginInput }, ({ input }) => login(input));
