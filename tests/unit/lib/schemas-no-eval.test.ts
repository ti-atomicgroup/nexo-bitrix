import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("validação no navegador sob a CSP", () => {
  it("o zod não tenta usar eval: a CSP bloquearia e registraria uma violação a cada página", async () => {
    vi.resetModules();
    const attempt = vi.fn(() => () => undefined);
    vi.stubGlobal("Function", attempt);
    const { loginInput } = await import("@/shared/schemas");
    expect(loginInput.safeParse({ email: "a@b.com", password: "x" }).success).toBe(true);
    expect(attempt).not.toHaveBeenCalled();
  });
});
