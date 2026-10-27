import { log } from "@/server/log";
import { MAX_DOCUMENT_BYTES } from "@/server/domain/documents";
import { isCollaboratorLinkActive, receiveDocumentFromLinkToken, type LinkDocumentOutcome } from "@/server/services/collaborator";
import { collaboratorDocumentInput } from "@/shared/schemas";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow" };
/** Folga para os campos e separadores do formulário além do arquivo. */
const MAX_BODY_BYTES = MAX_DOCUMENT_BYTES + 256 * 1024;
/** Envios lidos ao mesmo tempo: cada um ocupa algumas cópias de até 10 MB na memória (a Onnira dá 512 MB). */
const MAX_IN_FLIGHT = 3;
let inFlight = 0;

const FLASH: Record<Exclude<LinkDocumentOutcome, "not_found">, string> = {
  received: "enviado=1",
  completed: "enviado=completo",
  too_big: "erro=grande",
  bad_type: "erro=tipo",
  error: "erro=documento",
};

// Volta por caminho relativo, direto para a atividade: funciona atrás do proxy da Onnira sem conhecer o domínio público.
function backTo(token: string, outcome: Exclude<LinkDocumentOutcome, "not_found">, activityId: string | null): Response {
  const anchor = activityId ? `#atividade-${encodeURIComponent(activityId)}` : "";
  return new Response(null, { status: 303, headers: { ...NO_STORE, Location: `/j/${encodeURIComponent(token)}?${FLASH[outcome]}${anchor}` } });
}

function gone(): Response {
  const html =
    '<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Link indisponível</title>' +
    '<body style="font:16px/1.5 system-ui,sans-serif;background:#eef3ef;color:#0e2a21;padding:24px"><main style="max-width:520px;margin:0 auto">' +
    "<h1>Este link não está mais ativo</h1><p>Peça um novo link pessoal ao RH da sua empresa.</p></main></body></html>";
  return new Response(html, { status: 404, headers: { ...NO_STORE, "Content-Type": "text/html; charset=utf-8" } });
}

/** Documento enviado pela página do colaborador (formulário multipart, sem JavaScript). */
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }): Promise<Response> {
  const { token } = await params;
  // Nada do corpo é lido antes de conferir o link e o tamanho declarado.
  if (!isCollaboratorLinkActive(token)) return gone();
  // Sem tamanho declarado (envio em partes), o corpo não teria fim conhecido; o formulário do navegador sempre declara.
  const length = request.headers.get("content-length");
  if (!length || !/^\d+$/.test(length)) return backTo(token, "error", null);
  if (Number(length) > MAX_BODY_BYTES) return backTo(token, "too_big", null);
  if (inFlight >= MAX_IN_FLIGHT) return backTo(token, "error", null);
  inFlight++;
  let activityId: string | null = null;
  try {
    let form: FormData | null = null;
    try {
      form = await request.formData();
    } catch {
      form = null;
    }
    const parsed = collaboratorDocumentInput.safeParse({ activityId: form?.get("activityId"), key: form?.get("key") });
    const file = form?.get("file");
    activityId = parsed.success ? parsed.data.activityId : null;
    if (!parsed.success || !(file instanceof File) || file.size === 0) return backTo(token, "error", activityId);
    if (file.size > MAX_DOCUMENT_BYTES) return backTo(token, "too_big", activityId);
    const outcome = receiveDocumentFromLinkToken(token, parsed.data.activityId, parsed.data.key, new Uint8Array(await file.arrayBuffer()));
    return outcome === "not_found" ? gone() : backTo(token, outcome, activityId);
  } catch (error) {
    // Nunca registra o token nem o conteúdo: só o evento.
    log.error("collaborator_document_failed", { message: "Falha inesperada no envio de documento pelo link do colaborador.", error });
    return backTo(token, "error", activityId);
  } finally {
    inFlight--;
  }
}
