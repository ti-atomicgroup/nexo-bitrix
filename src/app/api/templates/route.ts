import { route } from "@/server/http/handler";
import { createTemplateFromInput, listTemplateSummaries } from "@/server/services/read/templates";
import { templateInput } from "@/shared/schemas";

export const dynamic = "force-dynamic";

export const GET = route({ auth: "user" }, () => listTemplateSummaries());

export const POST = route({ auth: "user", input: templateInput }, ({ input, actor }) => createTemplateFromInput(input, actor));
