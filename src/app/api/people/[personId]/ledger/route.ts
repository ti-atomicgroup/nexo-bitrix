import { route } from "@/server/http/handler";
import { addPersonLedgerItem, listPersonLedger } from "@/server/services/read/ledger";
import { ledgerItemInput } from "@/shared/schemas";

export const dynamic = "force-dynamic";

export const GET = route({ auth: "user", params: ["personId"] }, ({ params }) => listPersonLedger(params.personId));

export const POST = route({ auth: "user", params: ["personId"], input: ledgerItemInput }, ({ params, input, actor }) =>
  addPersonLedgerItem(params.personId, input, actor),
);
