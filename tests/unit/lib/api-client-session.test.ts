import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, clearToken, getToken, hasSession } from "@/lib/api-client";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const me = { user: { id: "u", name: "Rita", email: "r@e.com", role: "rh", mustChangePassword: false }, setup: { stage: "ready", portal: null, webhookOwner: null, scopes: null } };

/** Navegador mínimo: dois armazenamentos e o `document.cookie` do que a resposta gravou. */
function fakeBrowser() {
  const area = () => {
    const data = new Map<string, string>();
    return {
      data,
      getItem: (key: string) => data.get(key) ?? null,
      setItem: vi.fn((key: string, value: string) => void data.set(key, value)),
      removeItem: (key: string) => void data.delete(key),
    };
  };
  const local = area();
  const session = area();
  // Como o navegador: Max-Age=0 apaga o cookie.
  let stored = "";
  const browser = {
    get cookie() {
      return stored;
    },
    set cookie(value: string) {
      stored = value.includes("Max-Age=0") ? "" : value.split(";")[0]!;
    },
  };
  vi.stubGlobal("window", { localStorage: local, sessionStorage: session, addEventListener: () => undefined, removeEventListener: () => undefined });
  vi.stubGlobal("document", browser);
  return { local, session, browser };
}

function serve(routes: Array<(path: string, init: RequestInit) => Response>) {
  const seen: Array<{ path: string; headers: Record<string, string>; body: unknown }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string, init: RequestInit) => {
      seen.push({ path, headers: init.headers as Record<string, string>, body: init.body ? JSON.parse(String(init.body)) : undefined });
      const next = routes.shift();
      if (!next) throw new Error(`sem resposta para ${path}`);
      return next(path, init);
    }),
  );
  return seen;
}

let browser: ReturnType<typeof fakeBrowser>;
beforeEach(() => {
  browser = fakeBrowser();
  clearToken();
});
afterEach(() => vi.unstubAllGlobals());

describe("sessão no navegador", () => {
  it("com cookie aceito: entra por cookie e nenhum token passa pelo JavaScript", async () => {
    const seen = serve([
      () => json({ cookie: false }),
      () => json({ cookie: true }),
      () => {
        browser.browser.cookie = "__Host-nexo_signed=1";
        return json({ transport: "cookie", expiresAt: "2026-11-05T00:00:00Z", me });
      },
    ]);
    await api.login({ email: "r@e.com", password: "x" });
    expect(seen[2]?.body).toMatchObject({ transport: "cookie" });
    expect(getToken()).toBeNull();
    expect(hasSession()).toBe(true);
    expect(browser.local.setItem).not.toHaveBeenCalled();
    expect(browser.session.setItem).not.toHaveBeenCalled();
  });

  it("cookie bloqueado: pede o modo alternativo e guarda só no sessionStorage, nunca no localStorage", async () => {
    const seen = serve([() => json({ cookie: false }), () => json({ cookie: false }), () => json({ transport: "bearer", token: "t".repeat(43), expiresAt: "x", me })]);
    await api.login({ email: "r@e.com", password: "x" });
    expect(seen[2]?.body).toMatchObject({ transport: "bearer" });
    expect(getToken()).toBe("t".repeat(43));
    expect(browser.local.setItem).not.toHaveBeenCalled();
    expect(browser.session.data.get("nexo.session")).toBe("t".repeat(43));
  });

  it("falha no teste do cookie cai no modo alternativo, sem impedir o login", async () => {
    serve([() => json({ error: { code: "x", message: "y" } }, 403), () => json({ transport: "bearer", token: "t".repeat(43), expiresAt: "x", me })]);
    await expect(api.login({ email: "r@e.com", password: "x" })).resolves.toMatchObject({ transport: "bearer" });
  });

  it("toda chamada se identifica como a interface (CSRF), e só o modo alternativo manda o token", async () => {
    const seen = serve([() => json(me), () => json({ transport: "bearer", token: "t".repeat(43), expiresAt: "x", me }), () => json(me)]);
    await api.me();
    expect(seen[0]?.headers["X-Nexo-Client"]).toBe("web");
    expect(seen[0]?.headers["X-Nexo-Session"]).toBeUndefined();
  });

  it("apaga o token antigo que a v2 deixava no localStorage", () => {
    browser.local.data.set("nexo.session", "antigo");
    clearToken();
    expect(browser.local.data.has("nexo.session")).toBe(false);
    expect(hasSession()).toBe(false);
  });

  it("sessão vencida (401) limpa a dica do cookie", async () => {
    browser.browser.cookie = "__Host-nexo_signed=1";
    serve([() => json({ error: { code: "UNAUTHENTICATED", message: "Sua sessão expirou." } }, 401)]);
    await expect(api.me()).rejects.toMatchObject({ status: 401 });
    expect(browser.browser.cookie).toBe("");
    expect(hasSession()).toBe(false);
  });
});
