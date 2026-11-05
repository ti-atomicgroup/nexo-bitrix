import { route } from "@/server/http/handler";
import { crmSources } from "@/server/services/read/triggers";
import { startTask, taskStarted } from "@/server/services/tasks";

export const dynamic = "force-dynamic";

// Única leitura ao vivo do Bitrix numa tela (configuração de gatilhos, só administradores): em segundo plano, 202 + consulta.
export const GET = route({ auth: "session", operation: "crm.read" }, () => taskStarted(startTask("crm.sources", () => crmSources())));
