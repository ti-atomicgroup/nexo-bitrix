import { route } from "@/server/http/handler";
import { updateAppUser } from "@/server/services/users";
import { updateUserInput } from "@/shared/schemas";

export const dynamic = "force-dynamic";

export const PATCH = route({ auth: "admin", params: ["userId"], input: updateUserInput }, ({ params, input, actor }) =>
  updateAppUser(params.userId, input, actor),
);
