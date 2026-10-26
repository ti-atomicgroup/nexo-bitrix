import "server-only";

/** Erro esperado da aplicação: `message` é pt-BR e pode ir direto para a tela; `status` é o HTTP da resposta. */
export class AppError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

export function notFound(what: string): AppError {
  return new AppError("NOT_FOUND", `${what} não encontrado(a).`, 404);
}
