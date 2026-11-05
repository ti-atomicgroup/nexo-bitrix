import type { SessionTransportSeenDTO } from "@/shared/contracts";

export interface CookieTraceInput {
  /** Resposta final do servidor: o cookie de teste foi aceito. */
  cookie: boolean;
  /** O navegador guardou a dica que o servidor mandou por Set-Cookie. */
  hintVisible: boolean;
  /** A própria página consegue gravar um cookie com os mesmos atributos. */
  pageWriteWorks: boolean;
  seen: SessionTransportSeenDTO;
}

export type CookieLoss = "funciona" | "navegador" | "set-cookie" | "cookie" | "cabecalho" | "origem";

/** Lê as evidências na ordem do caminho do cookie: servidor → borda → navegador → borda → servidor. */
export function explainCookieTrace({ cookie, hintVisible, pageWriteWorks, seen }: CookieTraceInput): { where: CookieLoss; detail: string } {
  if (cookie) return { where: "funciona", detail: "O cookie de teste foi e voltou." };
  if (seen.probeReturned && !seen.clientHeader) return { where: "cabecalho", detail: "O cookie chega ao servidor, mas a borda remove o cabeçalho X-Nexo-Client." };
  if (seen.probeReturned) return { where: "origem", detail: `O cookie chega ao servidor, mas o pedido não veio como da própria página (Sec-Fetch-Site: ${seen.fetchSite}).` };
  if (hintVisible) return { where: "cookie", detail: `O navegador guardou o cookie, mas ele não chega ao servidor: a borda altera o cabeçalho Cookie (${seen.cookieCount} cookie(s) recebidos).` };
  if (pageWriteWorks) return { where: "set-cookie", detail: "O navegador aceita o cookie gravado pela página, mas o do servidor não aparece: a borda altera o Set-Cookie." };
  return { where: "navegador", detail: "O navegador recusa cookies neste iframe, mesmo gravados pela própria página." };
}
