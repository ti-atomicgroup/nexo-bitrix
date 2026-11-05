export const dynamic = "force-dynamic";

// Só diz que o processo está vivo, para a hospedagem. Não toca no banco e não revela nada do ambiente.
export function GET() {
  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
