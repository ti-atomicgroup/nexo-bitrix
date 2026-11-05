import { linkGoneResponse as gone } from "@/server/http/link-gone";
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
