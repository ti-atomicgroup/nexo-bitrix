import { describe, expect, it } from "vitest";
import { changePasswordInput, ledgerItemInput, loginInput } from "@/shared/schemas";

/** Os formulários validam no navegador com `safeParse` puro: as mensagens padrão do zod precisam sair em pt-BR. */
const ENGLISH = /expected|invalid|too (small|big)|required/i;

describe("mensagens de validação no navegador", () => {
  it("campo obrigatório sem mensagem própria sai em pt-BR", () => {
    const parsed = changePasswordInput.safeParse({ currentPassword: "", newPassword: "uma-senha-bem-longa" });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.message).toBe("Preencha este campo.");
  });

  it("nenhum erro padrão vaza em inglês", () => {
    const results = [
      changePasswordInput.safeParse({}),
      ledgerItemInput.safeParse({ kind: "carro", name: "x".repeat(200) }),
      loginInput.safeParse({ email: 42, password: "" }),
    ];
    const messages = results.flatMap((result) => result.error?.issues.map((issue) => issue.message) ?? []);
    expect(messages.length).toBeGreaterThan(3);
    for (const message of messages) expect(message).not.toMatch(ENGLISH);
  });
});
