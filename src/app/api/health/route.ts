import { buildInfo } from "@/server/runtime/build-info";

export const dynamic = "force-dynamic";

// Não toca no banco: responde mesmo se o SQLite estiver indisponível.
export function GET() {
  return Response.json(
    { ok: true, ...buildInfo(), node: process.version, uptimeSeconds: Math.round(process.uptime()) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
