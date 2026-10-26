export const dynamic = "force-dynamic";

// Volta para a página de teste por caminho relativo: funciona atrás do proxy da Onnira sem conhecer o domínio público.
export function POST() {
  return new Response(null, { status: 303, headers: { Location: "/j/teste?enviado=1", "Cache-Control": "no-store" } });
}
