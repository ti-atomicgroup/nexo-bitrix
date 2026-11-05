import { route } from "@/server/http/handler";
import { archiveTemplateById, getTemplateDTO, updateTemplateFromInput } from "@/server/services/read/templates";
import { templateInput } from "@/shared/schemas";

export const dynamic = "force-dynamic";

export const GET = route({ auth: "session", operation: "template.read", params: ["templateId"] }, ({ params }) => getTemplateDTO(params.templateId));

export const PUT = route({ auth: "session", operation: "template.write", params: ["templateId"], input: templateInput }, ({ params, input, actor }) =>
  updateTemplateFromInput(params.templateId, input, actor),
);

export const DELETE = route({ auth: "session", operation: "template.write", params: ["templateId"] }, ({ params, actor }) => archiveTemplateById(params.templateId, actor));
