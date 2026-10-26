import { route } from "@/server/http/handler";
import { crmSources } from "@/server/services/read/triggers";

export const dynamic = "force-dynamic";

// Única leitura ao vivo do Bitrix numa tela: a configuração de gatilhos (só administradores).
export const GET = route({ auth: "admin" }, () => crmSources());
