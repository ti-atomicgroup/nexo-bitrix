import { route } from "@/server/http/handler";
import { sendCollaboratorMessage } from "@/server/services/collaborator-message";
import { taskStarted } from "@/server/services/tasks";
import { collaboratorMessageInput } from "@/shared/schemas";

export const dynamic = "force-dynamic";

// Envia o link ou o lembrete no chat do Bitrix24 em segundo plano (202 + consulta).
export const POST = route({ auth: "user", params: ["journeyId"], input: collaboratorMessageInput }, ({ params, input, actor }) =>
  taskStarted(sendCollaboratorMessage(params.journeyId, input, actor)),
);
