import { route } from "@/server/http/handler";
import { downloadBackup } from "@/server/services/privacy";

export const dynamic = "force-dynamic";

export const GET = route({ auth: "session", operation: "backup.download" }, ({ actor }) => downloadBackup(actor));
