import { egressProbe, isBitrixHost } from "@/server/runtime/egress";
import { serverProbe } from "@/server/runtime/probe";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const host = new URL(request.url).searchParams.get("bitrix")?.trim().toLowerCase() ?? "";
    const egress = host ? (isBitrixHost(host) ? await egressProbe(host) : { host, error: "Use só o domínio do portal, como suaempresa.bitrix24.com.br." }) : null;
    return Response.json({ ...serverProbe(request.headers), egress }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
