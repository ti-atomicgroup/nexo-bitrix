import { describe, expect, it } from "vitest";
import { safeReturnPath } from "@/lib/use-session";

/** `?voltar=` do login: o roteador resolve o valor com o analisador de URL; tudo que sair do site volta para /hoje. */
describe("caminho de volta depois do login", () => {
  it("recusa qualquer valor que o navegador normaliza para outro site", () => {
    const attacks = [
      "/\t/evil.example/entrar", // ?voltar=/%09/evil.example: o tab some e vira //evil.example
      "/\n/evil.example",
      "/\r/evil.example",
      "/\\evil.example",
      "/\t\\evil.example",
      "//evil.example",
      "https://evil.example",
      "javascript:alert(1)",
    ];
    for (const value of attacks) expect(safeReturnPath(value)).toBe("/hoje");
  });

  it("aceita caminhos internos e devolve o caminho normalizado", () => {
    expect(safeReturnPath("/pessoas/1?x=1#y")).toBe("/pessoas/1?x=1#y");
    expect(safeReturnPath("/trilhas")).toBe("/trilhas");
  });

  it("não volta para o login nem para a instalação", () => {
    for (const value of ["/entrar", "/entrar?voltar=/hoje", "/instalar", "", null, undefined]) expect(safeReturnPath(value)).toBe("/hoje");
  });
});
