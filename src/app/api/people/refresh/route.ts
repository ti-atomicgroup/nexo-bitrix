import { route } from "@/server/http/handler";
import { refreshPeopleCache } from "@/server/services/read/people";
import { runningTask, startTask, taskStarted } from "@/server/services/tasks";

export const dynamic = "force-dynamic";

// Lê as pessoas do Bitrix24 em segundo plano (202 + consulta); pedidos repetidos acompanham a mesma leitura.
export const POST = route({ auth: "user" }, () => taskStarted(runningTask("people.refresh") ?? startTask("people.refresh", () => refreshPeopleCache())));
