import { readBodyText } from "@/server/http/input";
import { log } from "@/server/log";
import { isCollaboratorLinkActive, markDoneFromLinkToken } from "@/server/services/collaborator";
import { collaboratorDoneInput } from "@/shared/schemas";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow" };
/** O formulário só manda o id da atividade: rota pública, nada de corpo sem limite na memória. */
const MAX_BODY_BYTES = 4 * 1024;

/** `activityId` do formulário (urlencoded, o padrão do navegador); corpo grande demais ou ilegível vale como ausente. */
async function readActivityId(request: Request): Promise<string | null> {
  try {
    return new URLSearchParams(await readBodyText(request, MAX_BODY_BYTES)).get("activityId");
  } catch {
    return null;
  }
}

// Volta por caminho relativo: funciona atrás do proxy da Onnira sem conhecer o domínio público.
function backTo(token: string, flash: "feito" | "erro"): Response {
  return new Response(null, { status: 303, headers: { ...NO_STORE, Location: `/j/${encodeURIComponent(token)}?${flash}=1` } });
}

function gone(): Response {
  const html =
    '<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Link indisponível</title>' +
    '<body style="font:16px/1.5 system-ui,sans-serif;background:#eef3ef;color:#0e2a21;padding:24px"><main style="max-width:520px;margin:0 auto">' +
    "<h1>Este link não está mais ativo</h1><p>Peça um novo link pessoal ao RH da sua empresa.</p></main></body></html>";
  return new Response(html, { status: 404, headers: { ...NO_STORE, "Content-Type": "text/html; charset=utf-8" } });
}

/** "Marcar como feita" enviado pelo formulário da página do colaborador (POST sem JavaScript). */
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }): Promise<Response> {
  const { token } = await params;
  // Nada do corpo é lido antes de conferir o link.
  if (!isCollaboratorLinkActive(token)) return gone();
  const parsed = collaboratorDoneInput.safeParse({ activityId: await readActivityId(request) });
  try {
    const outcome = markDoneFromLinkToken(token, parsed.success ? parsed.data.activityId : "");
    if (outcome === "not_found") return gone();
    return backTo(token, outcome === "done" && parsed.success ? "feito" : "erro");
  } catch (error) {
    // Nunca registra o token: só o evento.
    log.error("collaborator_done_failed", { message: "Falha inesperada no formulário do link do colaborador.", error });
    return backTo(token, "erro");
  }
}
