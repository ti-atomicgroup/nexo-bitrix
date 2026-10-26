import { serverProbe } from "@/server/runtime/probe";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  try {
    return Response.json(serverProbe(request.headers), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
