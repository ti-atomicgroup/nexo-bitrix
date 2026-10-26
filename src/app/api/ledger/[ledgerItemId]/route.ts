import { route } from "@/server/http/handler";
import { waiveItem } from "@/server/services/read/ledger";
import { ledgerWaiveInput } from "@/shared/schemas";

export const dynamic = "force-dynamic";

export const PATCH = route({ auth: "user", params: ["ledgerItemId"], input: ledgerWaiveInput }, ({ params, input, actor }) =>
  waiveItem(params.ledgerItemId, input.reason, actor),
);
