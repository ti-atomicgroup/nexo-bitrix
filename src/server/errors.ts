export class AppError extends Error {
  constructor(public readonly code: string, message: string, public readonly status = 400) { super(message); this.name = "AppError"; }
}
export class BitrixError extends AppError {
  constructor(code: string, public readonly retryable = false, public readonly uncertain = false) {
    super(code, code === "ACCESS_DENIED" || code === "insufficient_scope" ? "O Bitrix24 negou esta operação. Revise permissões e escopos." : code === "OAUTH_REAUTHORIZE" ? "Abra o Nexo novamente no Bitrix24 para autorizar sua conta." : code === "RATE_LIMIT" ? "Limite temporário do Bitrix24. A fila tentará novamente." : "O Bitrix24 não confirmou a operação. Consulte a pendência e revise os campos obrigatórios e permissões.", retryable ? 503 : 422);
  }
}
