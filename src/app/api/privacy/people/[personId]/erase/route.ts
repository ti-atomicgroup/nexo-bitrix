import { route } from "@/server/http/handler";
import { eraseSubject } from "@/server/services/privacy";
import { eraseSubjectInput } from "@/shared/schemas";

export const dynamic = "force-dynamic";

export const POST = route({ auth: "session", operation: "privacy.manage", params: ["personId"], input: eraseSubjectInput }, ({ params, input, actor }) =>
  eraseSubject(params.personId, input.confirmName, actor),
);
