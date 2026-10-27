import { workerProbe } from "@/server/bitrix/relay";
import { egressProbe, isBitrixHost } from "@/server/runtime/egress";
import { serverProbe } from "@/server/runtime/probe";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const host = new URL(request.url).searchParams.get("bitrix")?.trim().toLowerCase() ?? "";
    const valid = Boolean(host) && isBitrixHost(host);
    const egress = host ? (valid ? await egressProbe(host) : { host, error: "Use só o domínio do portal, como suaempresa.bitrix24.com.br." }) : null;
    // A mesma saída testada pelo worker do Bitrix24, que é quem faz as chamadas de verdade.
    const workerEgress = valid ? await workerProbe(host) : null;
    return Response.json({ ...serverProbe(request.headers), egress, workerEgress }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
