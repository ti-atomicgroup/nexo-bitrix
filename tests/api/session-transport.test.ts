import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as loginRoute } from "@/app/api/auth/login/route";
import { POST as logoutRoute } from "@/app/api/auth/logout/route";
import { GET as transportRoute } from "@/app/api/auth/transport/route";
import { GET as meRoute } from "@/app/api/me/route";
import { authenticate, issueSession, SESSION_BEARER_MAX_MS, SESSION_IDLE_MS, SESSION_MAX_MS } from "@/server/auth/sessions";
import { findSessionWithUser } from "@/server/db/repos/sessions";
import { route } from "@/server/http/handler";
import { hashToken } from "@/server/security/crypto";
import { resetRateLimitsForTests } from "@/server/security/rate-limit";
import type { MeDTO, SessionDTO, SessionTransportDTO } from "@/shared/contracts";
import { useTestDb } from "../support/db";
import { call, PASSWORD, seedUser, type ApiErrorBody } from "./support/seed";

vi.mock("@/server/engine", async () => (await import("./support/engine-mock")).engineMock());

const SAME_ORIGIN = { "x-nexo-client": "web", "sec-fetch-site": "same-origin" };

/** Valor do cookie `name` nos cabeçalhos Set-Cookie. */
function setCookie(headers: Headers, name: string): string | undefined {
  return headers.getSetCookie().find((line) => line.startsWith(`${name}=`));
}

const cookieValue = (line: string | undefined) => line?.split(";")[0]?.split("=")[1] ?? "";

let cleanup: () => void;
beforeEach(() => {
  cleanup = useTestDb().cleanup;
  resetRateLimitsForTests();
  vi.spyOn(console, "log").mockImplementation(() => undefined);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

async function loginWith(transport: "cookie" | "bearer") {
  await seedUser({ email: "rita@empresa.com.br" });
  return call<SessionDTO & ApiErrorBody>(loginRoute, { path: "/api/auth/login", body: { email: "rita@empresa.com.br", password: PASSWORD, transport }, headers: SAME_ORIGIN });
}

describe("teste do cookie protegido: o que o servidor viu", () => {
  it("a primeira chamada grava também uma dica legível, sem segredo, para a tela saber se o Set-Cookie chegou", async () => {
    const result = await call<SessionTransportDTO>(transportRoute, { path: "/api/auth/transport", headers: SAME_ORIGIN });
    expect(setCookie(result.headers, "__Host-nexo_probe")).toMatch(/HttpOnly/);
    expect(cookieValue(setCookie(result.headers, "__Host-nexo_probe_hint"))).toBe("1");
    expect(setCookie(result.headers, "__Host-nexo_probe_hint")).not.toMatch(/HttpOnly/);
    expect(result.body).toEqual({ cookie: false, seen: { cookieHeader: false, cookieCount: 0, probeReturned: false, clientHeader: true, fetchSite: "same-origin" } });
  });

  it("devolve só contagem e presença: nem nomes nem valores de outros cookies", async () => {
    const result = await call<SessionTransportDTO>(transportRoute, { path: "/api/auth/transport", headers: { ...SAME_ORIGIN, cookie: "__Host-nexo_probe=1; segredo-da-borda=valor-secreto" } });
    expect(result.body).toEqual({ cookie: true, seen: { cookieHeader: true, cookieCount: 2, probeReturned: true, clientHeader: true, fetchSite: "same-origin" } });
    expect(result.text).not.toContain("segredo");
    expect(result.text).not.toContain("valor-secreto");
  });

  it("origem desconhecida não é repetida na resposta", async () => {
    const result = await call<SessionTransportDTO>(transportRoute, { path: "/api/auth/transport", headers: { "x-nexo-client": "web", "sec-fetch-site": "<script>" } });
    expect(result.body.seen.fetchSite).toBe("outro");
    expect(result.text).not.toContain("<script>");
  });
});

describe("sessão por cookie protegido", () => {
  it("o token vai só no cookie HttpOnly: o corpo da resposta não traz nada que o JavaScript possa guardar", async () => {
    const result = await loginWith("cookie");
    expect(result.status).toBe(200);
    expect(result.body.transport).toBe("cookie");
    expect(result.body.token).toBeUndefined();
    const line = setCookie(result.headers, "__Host-nexo_session");
    expect(line).toMatch(/HttpOnly/);
    expect(line).toMatch(/Secure/);
    expect(line).toMatch(/SameSite=None/);
    expect(line).toMatch(/Partitioned/);
    expect(line).toMatch(/Path=\//);
    expect(line).not.toMatch(/Domain=/i);
    expect(result.text).not.toContain(cookieValue(line));
    // A dica legível pelo JavaScript não tem segredo nenhum.
    expect(cookieValue(setCookie(result.headers, "__Host-nexo_signed"))).toBe("1");
    expect(setCookie(result.headers, "__Host-nexo_signed")).not.toMatch(/HttpOnly/);
  });

  it("autentica pelo cookie quando vem da própria interface", async () => {
    const token = cookieValue(setCookie((await loginWith("cookie")).headers, "__Host-nexo_session"));
    const me = await call<MeDTO>(meRoute, { path: "/api/me", headers: { ...SAME_ORIGIN, cookie: `__Host-nexo_session=${token}` } });
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe("rita@empresa.com.br");
  });

  it("CSRF: sem o cabeçalho da interface ou vindo de outro site, o cookie não vale", async () => {
    const token = cookieValue(setCookie((await loginWith("cookie")).headers, "__Host-nexo_session"));
    const cookie = `__Host-nexo_session=${token}`;
    const service = vi.fn(() => ({ ok: true }));
    const handler = route({ auth: "session", operation: "journey.create" }, service);
    expect((await call(handler, { method: "POST", headers: { cookie } })).status).toBe(401);
    for (const site of ["cross-site", "same-site"]) {
      expect((await call(handler, { method: "POST", headers: { cookie, "x-nexo-client": "web", "sec-fetch-site": site } })).status).toBe(403);
      expect((await call(handler, { method: "GET", headers: { cookie, "x-nexo-client": "web", "sec-fetch-site": site } })).status).toBe(401);
    }
    expect(service).not.toHaveBeenCalled();
    // Navegador antigo, sem Fetch Metadata: o cabeçalho próprio já força a pré-verificação de CORS, que o Nexo não libera.
    expect((await call(handler, { method: "POST", headers: { cookie, "x-nexo-client": "web" } })).status).toBe(200);
  });

  it("o token de uma sessão por cookie não funciona como cabeçalho, e o de cabeçalho não funciona como cookie", async () => {
    const cookieToken = cookieValue(setCookie((await loginWith("cookie")).headers, "__Host-nexo_session"));
    expect((await call(meRoute, { path: "/api/me", token: cookieToken })).status).toBe(401);
    const { user } = await seedUser();
    const bearerToken = issueSession(user).token;
    expect((await call(meRoute, { path: "/api/me", headers: { ...SAME_ORIGIN, cookie: `__Host-nexo_session=${bearerToken}` } })).status).toBe(401);
  });

  it("sair revoga a sessão e apaga os dois cookies", async () => {
    const token = cookieValue(setCookie((await loginWith("cookie")).headers, "__Host-nexo_session"));
    const cookie = `__Host-nexo_session=${token}`;
    const out = await call(logoutRoute, { method: "POST", path: "/api/auth/logout", headers: { ...SAME_ORIGIN, cookie } });
    expect(out.status).toBe(200);
    expect(setCookie(out.headers, "__Host-nexo_session")).toMatch(/Max-Age=0/);
    expect(setCookie(out.headers, "__Host-nexo_signed")).toMatch(/Max-Age=0/);
    expect(findSessionWithUser(hashToken(token))).toBeNull();
    expect((await call(meRoute, { path: "/api/me", headers: { ...SAME_ORIGIN, cookie } })).status).toBe(401);
  });

  it("cookie vencido recebe 401 e a ordem de apagar os cookies", async () => {
    const result = await call(meRoute, { path: "/api/me", headers: { ...SAME_ORIGIN, cookie: "__Host-nexo_session=" + "x".repeat(43) } });
    expect(result.status).toBe(401);
    expect(setCookie(result.headers, "__Host-nexo_session")).toMatch(/Max-Age=0/);
  });

  it("ação de escrita vinda de outro site é recusada mesmo em rota pública (login forjado)", async () => {
    await seedUser({ email: "rita@empresa.com.br" });
    const result = await call<ApiErrorBody>(loginRoute, {
      path: "/api/auth/login",
      body: { email: "rita@empresa.com.br", password: PASSWORD, transport: "cookie" },
      headers: { "sec-fetch-site": "cross-site" },
    });
    expect(result.status).toBe(403);
    expect(result.body.error.code).toBe("CROSS_SITE_REQUEST");
    expect(result.headers.getSetCookie()).toEqual([]);
  });
});

describe("modo alternativo (cookie bloqueado pelo navegador ou pela hospedagem)", () => {
  it("devolve o token no corpo, sem cookie, e a sessão tem janela menor", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const t0 = new Date("2026-10-26T12:00:00.000Z");
    vi.setSystemTime(t0);
    const result = await loginWith("bearer");
    expect(result.body.transport).toBe("bearer");
    expect(result.body.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(result.headers.getSetCookie()).toEqual([]);

    const request = () => new Request("http://localhost/api/me", { headers: { "x-nexo-session": result.body.token! } });
    expect(SESSION_BEARER_MAX_MS).toBeLessThan(SESSION_MAX_MS);
    // Em uso constante, a sessão continua viva até o teto de 24 h e nunca passa dele.
    for (let elapsed = 2 * 3_600_000; elapsed < SESSION_BEARER_MAX_MS; elapsed += 2 * 3_600_000) {
      vi.setSystemTime(t0.getTime() + elapsed);
      expect(authenticate(request()), `depois de ${elapsed / 3_600_000} h`).not.toBeNull();
    }
    vi.setSystemTime(t0.getTime() + SESSION_BEARER_MAX_MS + 1);
    expect(authenticate(request())).toBeNull();
  });

  it("a sessão por cookie segue valendo além da janela do modo alternativo, com uso constante", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const t0 = new Date("2026-10-26T12:00:00.000Z");
    vi.setSystemTime(t0);
    const token = cookieValue(setCookie((await loginWith("cookie")).headers, "__Host-nexo_session"));
    const request = () => new Request("http://localhost/api/me", { headers: { ...SAME_ORIGIN, cookie: `__Host-nexo_session=${token}` } });
    for (let elapsed = SESSION_IDLE_MS / 2; elapsed <= SESSION_BEARER_MAX_MS + SESSION_IDLE_MS / 2; elapsed += SESSION_IDLE_MS / 2) {
      vi.setSystemTime(t0.getTime() + elapsed);
      expect(authenticate(request())).not.toBeNull();
    }
  });
});

describe("teste do cookie antes de entrar", () => {
  it("a primeira chamada grava o cookie de teste; a segunda confirma se ele voltou", async () => {
    const first = await call<{ cookie: boolean }>(transportRoute, { path: "/api/auth/transport", headers: SAME_ORIGIN });
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ cookie: false });
    const line = setCookie(first.headers, "__Host-nexo_probe");
    expect(line).toMatch(/Secure/);
    expect(line).toMatch(/Partitioned/);
    expect(line).toMatch(/HttpOnly/);
    const second = await call<{ cookie: boolean }>(transportRoute, { path: "/api/auth/transport", headers: { ...SAME_ORIGIN, cookie: "__Host-nexo_probe=1" } });
    expect(second.body).toMatchObject({ cookie: true });
    expect(second.headers.get("cache-control")).toBe("no-store");
  });

  it("se a borda remove o cabeçalho da interface, o cookie não serve e o Nexo usa o modo alternativo", async () => {
    const result = await call<{ cookie: boolean }>(transportRoute, { path: "/api/auth/transport", headers: { cookie: "__Host-nexo_probe=1" } });
    expect(result.body).toMatchObject({ cookie: false });
  });
});
