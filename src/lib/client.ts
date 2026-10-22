import { z } from "zod";

export class RequestError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "RequestError";
  }
}

export function consumeLaunchHash(
  hash: string,
): { kind: "session" | "bootstrap"; token: string } | null {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const session = params.get("session");
  const bootstrap = params.get("bootstrap");
  if (session && bootstrap) return null;
  const token = session || bootstrap;
  if (!token || !/^[a-zA-Z0-9_-]{32,256}$/.test(token)) return null;
  return { kind: session ? "session" : "bootstrap", token };
}

const errorSchema = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
});

export class ApiClient {
  private token = "";
  private readonly getToken: () => string;
  constructor(
    getToken?: () => string,
    private readonly fetcher: typeof fetch = fetch,
  ) {
    this.getToken = getToken || (() => this.token);
  }
  setToken(token: string) {
    this.token = token;
  }

  async request<T>(
    path: string,
    schema: z.ZodType<T>,
    body?: unknown,
    method?: string,
  ): Promise<T> {
    if (
      !path.startsWith("/api/") ||
      path.includes("\\") ||
      path.includes("\n")
    ) {
      throw new RequestError("Endereço de API inválido.", "INVALID_PATH", 400);
    }
    const headers: Record<string, string> = { Accept: "application/json" };
    const token = this.getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) headers["Content-Type"] = "application/json";
    let response: Response;
    try {
      const fetcher = this.fetcher;
      response = await fetcher(path, {
        method: method || (body === undefined ? "GET" : "POST"),
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(60000),
      });
    } catch {
      throw new RequestError(
        "Não foi possível alcançar o Nexo. Verifique a conexão e tente novamente.",
        "NETWORK_ERROR",
        0,
      );
    }
    let value: unknown;
    try {
      value = await response.json();
    } catch {
      throw new RequestError(
        "O servidor enviou uma resposta inesperada. Tente novamente.",
        "INVALID_RESPONSE",
        response.status,
      );
    }
    const error = errorSchema.safeParse(value);
    if (error.success)
      throw new RequestError(
        error.data.error.message,
        error.data.error.code,
        response.status,
      );
    if (!response.ok)
      throw new RequestError(
        "Não foi possível concluir a operação.",
        "REQUEST_FAILED",
        response.status,
      );
    const result = z.object({ data: schema }).safeParse(value);
    if (!result.success)
      throw new RequestError(
        "A resposta do servidor está incompleta. Atualize a aplicação ou contate o suporte.",
        "INVALID_RESPONSE",
        response.status,
      );
    return result.data.data;
  }
}

export function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Não foi possível concluir a operação.";
}
