import { route } from "@/server/http/handler";
import { getSettings, updateSettings } from "@/server/services/settings";
import { settingsInput } from "@/shared/schemas";

export const dynamic = "force-dynamic";

export const GET = route({ auth: "user" }, () => getSettings());

export const PUT = route({ auth: "admin", input: settingsInput }, ({ input, actor }) => updateSettings(input, actor));
