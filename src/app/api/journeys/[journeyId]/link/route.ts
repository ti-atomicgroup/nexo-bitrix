import { route } from "@/server/http/handler";
import { createCollaboratorLink, revokeCollaboratorLink } from "@/server/services/collaborator";
import { collaboratorLinkInput } from "@/shared/schemas";

export const dynamic = "force-dynamic";

export const POST = route({ auth: "user", params: ["journeyId"], input: collaboratorLinkInput }, ({ params, input, actor }) =>
  input.action === "create" ? createCollaboratorLink(params.journeyId, actor) : revokeCollaboratorLink(params.journeyId, actor),
);
