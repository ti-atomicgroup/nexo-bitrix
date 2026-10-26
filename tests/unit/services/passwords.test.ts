import { describe, expect, it } from "vitest";
import { hashPassword, verifyAgainstDummy, verifyPassword } from "@/server/security/passwords";

describe("senhas (scrypt)", () => {
  it("gera o formato scrypt$N$r$p$sal$hash com sal aleatório e chave de 64 bytes", async () => {
    const first = await hashPassword("senha-forte-123");
    const second = await hashPassword("senha-forte-123");
    expect(first).toMatch(/^scrypt\$16384\$8\$1\$[0-9a-f]{32}\$[0-9a-f]{128}$/);
    expect(second).not.toBe(first);
  });

  it("confere a senha certa e recusa a errada", async () => {
    const stored = await hashPassword("senha-forte-123");
    await expect(verifyPassword("senha-forte-123", stored)).resolves.toBe(true);
    await expect(verifyPassword("senha-forte-124", stored)).resolves.toBe(false);
    await expect(verifyPassword("", stored)).resolves.toBe(false);
  });

  it("normaliza Unicode (é composto e decomposto valem a mesma senha)", async () => {
    const stored = await hashPassword("café-com-leite");
    await expect(verifyPassword("café-com-leite", stored)).resolves.toBe(true);
  });

  it("trata hash adulterado ou ilegível como senha errada, sem lançar", async () => {
    const stored = await hashPassword("senha-forte-123");
    const parts = stored.split("$");
    const tampered = [...parts.slice(0, 5), `${parts[5]!.slice(0, -2)}00`].join("$");
    await expect(verifyPassword("senha-forte-123", tampered)).resolves.toBe(false);
    for (const broken of ["", "texto", "bcrypt$10$abc", "scrypt$15$8$1$00$00", "scrypt$16384$8$1$zz$zz", `${stored}$extra`]) {
      await expect(verifyPassword("senha-forte-123", broken)).resolves.toBe(false);
    }
  });

  it("verificação fictícia sempre falha (iguala o tempo do login com e-mail inexistente)", async () => {
    await expect(verifyAgainstDummy("qualquer-coisa")).resolves.toBe(false);
  });
});
