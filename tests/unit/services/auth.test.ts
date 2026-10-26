import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authenticate, issueSession } from "@/server/auth/sessions";
import { findUserById, updateUser } from "@/server/db/repos/users";
import { AppError } from "@/server/errors";
import { resetRateLimitsForTests } from "@/server/security/rate-limit";
import { changePassword, INVALID_CREDENTIALS_MESSAGE, LOCK_MS, LOCKED_MESSAGE, login } from "@/server/services/auth";
import { PASSWORD, seedUser } from "../../api/support/seed";
import { useTestDb } from "../../support/db";

vi.mock("@/server/engine", async () => (await import("../../api/support/engine-mock")).engineMock());

let cleanup: () => void;
beforeEach(() => {
  cleanup = useTestDb().cleanup;
  resetRateLimitsForTests();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

async function failure(promise: Promise<unknown>): Promise<AppError> {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(AppError);
  return error as AppError;
}

const bearer = (token: string) => new Request("http://localhost/api/me", { headers: { authorization: `Bearer ${token}` } });

describe("login", () => {
  it("abre sessão com o perfil e a etapa da instalação", async () => {
    const { user } = await seedUser({ role: "admin", email: "marina@empresa.com.br", name: "Marina Souza" });
    const session = await login({ email: " MARINA@empresa.com.br ", password: PASSWORD });
    expect(session.me.user).toEqual({ id: user.id, name: "Marina Souza", email: "marina@empresa.com.br", role: "admin", mustChangePassword: false });
    expect(session.me.setup.stage).toBe("connect");
    expect(authenticate(bearer(session.token))?.user.id).toBe(user.id);
    expect(findUserById(user.id)?.lastLoginAt).not.toBeNull();
  });

  it("dá a mesma mensagem genérica para senha errada, e-mail inexistente e acesso desativado", async () => {
    await seedUser({ email: "rita@empresa.com.br" });
    await seedUser({ email: "inativa@empresa.com.br", active: false });
    for (const attempt of [
      { email: "rita@empresa.com.br", password: "errada-000" },
      { email: "ninguem@empresa.com.br", password: PASSWORD },
      { email: "inativa@empresa.com.br", password: PASSWORD },
    ]) {
      const error = await failure(login(attempt));
      expect(error).toMatchObject({ code: "INVALID_CREDENTIALS", status: 401, message: INVALID_CREDENTIALS_MESSAGE });
    }
  });

  it("bloqueia 15 min depois de 5 erros seguidos, mesmo com a senha certa", async () => {
    const { user } = await seedUser({ email: "rita@empresa.com.br" });
    const now = Date.parse("2026-10-26T12:00:00.000Z");
    for (let attempt = 1; attempt <= 4; attempt++) {
      expect((await failure(login({ email: "rita@empresa.com.br", password: "errada-000" }, now))).code).toBe("INVALID_CREDENTIALS");
    }
    const fifth = await failure(login({ email: "rita@empresa.com.br", password: "errada-000" }, now));
    expect(fifth).toMatchObject({ code: "LOGIN_LOCKED", status: 429, message: LOCKED_MESSAGE });
    expect(findUserById(user.id)?.lockedUntil).toBe(new Date(now + LOCK_MS).toISOString());
    expect((await failure(login({ email: "rita@empresa.com.br", password: PASSWORD }, now + 60_000))).code).toBe("LOGIN_LOCKED");

    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(now + LOCK_MS + 1));
    const session = await login({ email: "rita@empresa.com.br", password: PASSWORD }, now + LOCK_MS + 1);
    expect(session.me.user.id).toBe(user.id);
    expect(findUserById(user.id)).toMatchObject({ failedLogins: 0, lockedUntil: null });
  });

  it("recomeça a contagem depois que o bloqueio vence", async () => {
    const { user } = await seedUser({ email: "rita@empresa.com.br" });
    updateUser(user.id, { failedLogins: 5, lockedUntil: "2026-10-26T11:00:00.000Z" });
    const now = Date.parse("2026-10-26T12:00:00.000Z");
    expect((await failure(login({ email: "rita@empresa.com.br", password: "errada-000" }, now))).code).toBe("INVALID_CREDENTIALS");
    expect(findUserById(user.id)).toMatchObject({ failedLogins: 1, lockedUntil: null });
  });

  it("e-mail inexistente também é bloqueado depois de 5 erros (sem revelar quem existe)", async () => {
    const now = Date.parse("2026-10-26T12:00:00.000Z");
    for (let attempt = 1; attempt <= 4; attempt++) await failure(login({ email: "ninguem@empresa.com.br", password: "errada-000" }, now));
    expect((await failure(login({ email: "ninguem@empresa.com.br", password: "errada-000" }, now))).code).toBe("LOGIN_LOCKED");
  });
});

describe("troca de senha", () => {
  it("exige a senha atual, desliga a troca obrigatória e encerra as outras sessões", async () => {
    const { user, token } = await seedUser({ email: "rita@empresa.com.br" });
    updateUser(user.id, { mustChangePassword: true });
    const other = issueSession(user);
    const current = authenticate(bearer(token))!;

    const wrong = await failure(changePassword(current.user, current.tokenHash, { currentPassword: "errada-000", newPassword: "nova-senha-456" }));
    expect(wrong).toMatchObject({ code: "INVALID_PASSWORD", status: 400 });
    const same = await failure(changePassword(current.user, current.tokenHash, { currentPassword: PASSWORD, newPassword: PASSWORD }));
    expect(same.code).toBe("SAME_PASSWORD");

    await expect(changePassword(current.user, current.tokenHash, { currentPassword: PASSWORD, newPassword: "nova-senha-456" })).resolves.toEqual({ ok: true });
    expect(findUserById(user.id)?.mustChangePassword).toBe(false);
    expect(authenticate(bearer(token))).not.toBeNull();
    expect(authenticate(bearer(other.token))).toBeNull();
    await expect(login({ email: "rita@empresa.com.br", password: "nova-senha-456" })).resolves.toMatchObject({ me: { user: { id: user.id } } });
  });
});
