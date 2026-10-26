import "server-only";
import { isAppError } from "../errors";

/** Não é falha: o job volta para a fila no horário pedido (ex.: esperando o Bitrix confirmar uma criação incerta). */
export class RetryLater extends Error {
  constructor(
    readonly at: number,
    message: string,
  ) {
    super(message);
    this.name = "RetryLater";
  }
}

/** Mensagem pt-BR segura para mostrar na tela e gravar (erros internos não vazam detalhes). */
export function errorMessage(error: unknown): string {
  if (error instanceof RetryLater || isAppError(error)) return error.message;
  return "Falha interna do Nexo ao sincronizar com o Bitrix24. O Nexo tenta de novo no próximo ciclo.";
}
