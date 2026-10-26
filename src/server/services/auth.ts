import "server-only";
import type { z } from "zod";
import type { SessionDTO } from "@/shared/contracts";
import type { changePasswordInput, LoginInput } from "@/shared/schemas";
import { revoke, revokeOtherSessions } from "../auth/sessions";
import { purgeExpiredSessions } from "../db/repos/sessions";
import { findUserByEmail, recordLoginFailure, recordLoginSuccess, updateUser, type AppUserRow } from "../db/repos/users";
import { AppError } from "../errors";
import { hashPassword, verifyAgainstDummy, verifyPassword } from "../security/passwords";
import { clearRateLimit, peekRateLimit, recordHit } from "../security/rate-limit";
import { auditAs } from "./audit";
import { startSession } from "./session";

/** 5 erros seguidos bloqueiam o login por 15 min (no banco para contas existentes, em memória para qualquer e-mail). */
export const MAX_LOGIN_FAILURES = 5;
export const LOCK_MS = 15 * 60 * 1000;
const LOGIN_RULE = { limit: MAX_LOGIN_FAILURES, windowMs: LOCK_MS };
const PASSWORD_RULE = { limit: 5, windowMs: LOCK_MS };

export const INVALID_CREDENTIALS_MESSAGE = "E-mail ou senha incorretos.";
export const LOCKED_MESSAGE = "Muitas tentativas. Tente de novo em alguns minutos.";

const invalidCredentials = () => new AppError("INVALID_CREDENTIALS", INVALID_CREDENTIALS_MESSAGE, 401);
const locked = () => new AppError("LOGIN_LOCKED", LOCKED_MESSAGE, 429);

function loginKey(email: string): string {
  return `login:${email.trim().toLowerCase()}`;
}

/** Registra a falha; a 5ª seguida bloqueia a conta por 15 min. Bloqueio vencido recomeça a contagem. */
function registerFailure(user: AppUserRow | null, key: string, now: number): boolean {
  const memory = recordHit(key, LOGIN_RULE, now);
  if (!user) return !memory.allowed;
  const lockExpired = user.lockedUntil !== null && !(Date.parse(user.lockedUntil) > now);
  const previous = lockExpired ? 0 : user.failedLogins;
  if (lockExpired) updateUser(user.id, { failedLogins: 0, lockedUntil: null });
  const lockNow = previous + 1 >= MAX_LOGIN_FAILURES;
  recordLoginFailure(user.id, lockNow ? new Date(now + LOCK_MS).toISOString() : null);
  return lockNow;
}

export async function login(input: LoginInput, now = Date.now()): Promise<SessionDTO> {
  const key = loginKey(input.email);
  const user = findUserByEmail(input.email);
  const lockedInDb = user?.lockedUntil ? Date.parse(user.lockedUntil) > now : false;
  if (lockedInDb || !peekRateLimit(key, LOGIN_RULE, now).allowed) throw locked();

  const valid = user && user.active ? await verifyPassword(input.password, user.passwordHash) : await verifyAgainstDummy(input.password);
  if (!valid || !user || !user.active) {
    throw registerFailure(user && user.active ? user : null, key, now) ? locked() : invalidCredentials();
  }

  recordLoginSuccess(user.id);
  clearRateLimit(key);
  purgeExpiredSessions();
  return startSession(user);
}

export function logout(tokenHash: string): { ok: true } {
  revoke(tokenHash);
  return { ok: true };
}

export async function changePassword(user: AppUserRow, tokenHash: string, input: z.output<typeof changePasswordInput>): Promise<{ ok: true }> {
  const key = `password:${user.id}`;
  if (!peekRateLimit(key, PASSWORD_RULE).allowed) throw new AppError("TOO_MANY_ATTEMPTS", LOCKED_MESSAGE, 429);
  if (!(await verifyPassword(input.currentPassword, user.passwordHash))) {
    recordHit(key, PASSWORD_RULE);
    throw new AppError("INVALID_PASSWORD", "A senha atual não confere.", 400, { field: "currentPassword" });
  }
  if (input.newPassword === input.currentPassword) {
    throw new AppError("SAME_PASSWORD", "Escolha uma senha diferente da atual.", 400, { field: "newPassword" });
  }
  clearRateLimit(key);
  updateUser(user.id, { passwordHash: await hashPassword(input.newPassword), mustChangePassword: false });
  revokeOtherSessions(user.id, tokenHash);
  auditAs({ type: "user", id: user.id, name: user.name }, "Senha alterada", "user", user.id);
  return { ok: true };
}
