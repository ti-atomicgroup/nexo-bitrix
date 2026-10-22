import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ApiClient, consumeLaunchHash } from "../../src/lib/client";

describe("contexto de abertura do frame", () => {
  it("recupera uma sessão opaca sem aceitar identificadores de usuário", () => {
    expect(consumeLaunchHash("#session=" + "a".repeat(43))).toEqual({
      kind: "session",
      token: "a".repeat(43),
    });
    expect(consumeLaunchHash("#userId=1&role=admin")).toBeNull();
  });
  it("rejeita contexto ambíguo ou truncado", () => {
    expect(consumeLaunchHash("#session=abc")).toBeNull();
    expect(
      consumeLaunchHash(
        "#session=" + "a".repeat(43) + "&bootstrap=" + "b".repeat(43),
      ),
    ).toBeNull();
  });
});

describe("cliente da API", () => {
  it("não envia a sessão para destinos externos", async () => {
    const client = new ApiClient(() => "secret");
    await expect(
      client.request("https://example.org/api/workspace", z.unknown()),
    ).rejects.toThrow("inválido");
  });
  it("apresenta mensagem de erro do servidor e preserva o código", async () => {
    const client = new ApiClient(
      () => "token",
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
      () => "token",
      async () => new Response(JSON.stringify({ data: { id: null } })),
    );
    await expect(
      client.request("/api/workspace", z.object({ id: z.string() })),
    ).rejects.toThrow("resposta");
  });
});
