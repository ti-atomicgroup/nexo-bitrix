import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as loginRoute } from "@/app/api/auth/login/route";
import { POST as logoutRoute } from "@/app/api/auth/logout/route";
import { POST as passwordRoute } from "@/app/api/me/password/route";
import { GET as meRoute } from "@/app/api/me/route";
import { GET as todayRoute } from "@/app/api/today/route";
import { PATCH as updateUserRoute } from "@/app/api/users/[userId]/route";
import { POST as createUserRoute } from "@/app/api/users/route";
import { resetRateLimitsForTests } from "@/server/security/rate-limit";
import type { AppUserDTO, MeDTO, SessionDTO } from "@/shared/contracts";
import { useTestDb } from "../support/db";
import { call, PASSWORD, seedUser, type ApiErrorBody } from "./support/seed";

vi.mock("@/server/engine", async () => (await import("./support/engine-mock")).engineMock());
vi.mock("@/server/domain", async () => (await import("./support/domain-fake")).domainFake());

const SAME_ORIGIN = { "x-nexo-client": "web", "sec-fetch-site": "same-origin" };
const NEW_PASSWORD = "minha-senha-nova-456";
const TEMPORARY = "senha-temporaria-789";

let cleanup: () => void;
beforeEach(() => {
  cleanup = useTestDb().cleanup;
  resetRateLimitsForTests();
  vi.spyOn(console, "log").mockImplementation(() => undefined);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const today = (token: string) => call<ApiErrorBody>(todayRoute, { path: "/api/today", token });
const me = (token: string) => call<MeDTO>(meRoute, { path: "/api/me", token });
const changePassword = (token: string, currentPassword: string, newPassword: string) =>
  call<ApiErrorBody>(passwordRoute, { path: "/api/me/password", token, body: { currentPassword, newPassword } });

async function loginAs(email: string, password: string): Promise<string> {
  const session = await call<SessionDTO>(loginRoute, { path: "/api/auth/login", body: { email, password, transport: "bearer" }, headers: SAME_ORIGIN });
  expect(session.status).toBe(200);
  return session.body.token as string;
}

function expectBlocked(result: { status: number; body: ApiErrorBody }): void {
  expect(result.status).toBe(403);
  expect(result.body.error.code).toBe("PASSWORD_CHANGE_REQUIRED");
  expect(result.body.error.message).toBe("Troque a senha temporária para continuar.");
}

describe("senha temporária", () => {
  it("bloqueia a API até a troca e libera na mesma sessão depois dela", async () => {
    const { token } = await seedUser({ mustChangePassword: true });

    expectBlocked(await today(token));
    expect((await me(token)).body.user.mustChangePassword).toBe(true);

    expect((await changePassword(token, PASSWORD, NEW_PASSWORD)).status).toBe(200);

    expect((await today(token)).status).toBe(200);
    expect((await me(token)).body.user.mustChangePassword).toBe(false);
  });

  it("tentativa de troca recusada não libera a API", async () => {
    const { token } = await seedUser({ mustChangePassword: true });

    const wrongCurrent = await changePassword(token, "senha-que-nao-confere", NEW_PASSWORD);
    expect(wrongCurrent.status).toBe(400);
    expect(wrongCurrent.body.error.code).toBe("INVALID_PASSWORD");
    expectBlocked(await today(token));

    const samePassword = await changePassword(token, PASSWORD, PASSWORD);
    expect(samePassword.status).toBe(400);
    expect(samePassword.body.error.code).toBe("SAME_PASSWORD");
    expectBlocked(await today(token));
  });

  it("quem está bloqueado consegue sair", async () => {
    const { token } = await seedUser({ mustChangePassword: true });

    expect((await call(logoutRoute, { path: "/api/auth/logout", method: "POST", token })).status).toBe(200);

    expect((await me(token)).status).toBe(401);
  });

  it("acesso criado pela Equipe entra bloqueado", async () => {
    const admin = await seedUser({ role: "admin" });
    const created = await call<AppUserDTO>(createUserRoute, {
      path: "/api/users",
      token: admin.token,
      body: { name: "Rita Lima", email: "rita@empresa.com.br", role: "rh", temporaryPassword: TEMPORARY },
    });
    expect(created.status).toBe(200);

    expectBlocked(await today(await loginAs("rita@empresa.com.br", TEMPORARY)));
  });

  it("senha redefinida pela administração volta a bloquear, e a troca libera", async () => {
    const admin = await seedUser({ role: "admin" });
    const rita = await seedUser({ email: "rita@empresa.com.br" });
    expect((await today(rita.token)).status).toBe(200);

    const reset = await call<AppUserDTO, "userId">(updateUserRoute, {
      method: "PATCH",
      path: `/api/users/${rita.user.id}`,
      token: admin.token,
      params: { userId: rita.user.id },
      body: { resetPassword: TEMPORARY },
    });
    expect(reset.status).toBe(200);

    const token = await loginAs("rita@empresa.com.br", TEMPORARY);
    expectBlocked(await today(token));
    expect((await changePassword(token, TEMPORARY, NEW_PASSWORD)).status).toBe(200);
    expect((await today(token)).status).toBe(200);
  });
});
