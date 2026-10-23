import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ApiClient } from "../../src/lib/client";

describe("cliente da API", () => {
  it("envia cookies same-origin sem anexar token Bearer", async () => {
    let requestInit: RequestInit | undefined;
    const client = new ApiClient(async (_input, init) => { requestInit = init; return Response.json({ data: { ok: true } }); });
    await client.request("/api/workspace", z.object({ ok: z.boolean() }));
    expect(requestInit?.credentials).toBe("same-origin");
    expect(new Headers(requestInit?.headers).has("Authorization")).toBe(false);
  });
  it("não envia a sessão para destinos externos", async () => {
    const client = new ApiClient();
    await expect(
      client.request("https://example.org/api/workspace", z.unknown()),
    ).rejects.toThrow("inválido");
  });
  it("apresenta mensagem de erro do servidor e preserva o código", async () => {
    const client = new ApiClient(
      async () =>
        new Response(
          JSON.stringify({
            error: {
              code: "FORBIDDEN",
              message: "Você não tem acesso a esta jornada.",
            },
          }),
          { status: 403 },
        ),
    );
    await expect(
      client.request("/api/workspace", z.unknown()),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Você não tem acesso a esta jornada.",
    });
  });
  it("rejeita resposta incompatível em vez de mostrar sucesso", async () => {
    const client = new ApiClient(
      async () => new Response(JSON.stringify({ data: { id: null } })),
    );
    await expect(
      client.request("/api/workspace", z.object({ id: z.string() })),
    ).rejects.toThrow("resposta");
  });
});
