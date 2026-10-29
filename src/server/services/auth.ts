import "server-only";
import type { z } from "zod";
import type { SessionDTO } from "@/shared/contracts";
import type { changePasswordInput, LoginInput } from "@/shared/schemas";
import { revoke, revokeOtherSessions } from "../auth/sessions";
import { purgeExpiredSessions } from "../db/repos/sessions";
import { findUserByEmail, recordLoginFailure, recordLoginSuccess, updateUser, type AppUserRow } from "../db/repos/users";
import { AppError } from "../errors";
import { hashPassword, verifyAgainstDummy, verifyPassword } from "../security/passwords";
import { clearRateLimit, rateLimit } from "../security/rate-limit";
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

/**
 * Registra a falha; a 5ª seguida bloqueia a conta por 15 min. Bloqueio vencido recomeça a contagem.
 * A conta é atualizada no banco a partir da linha atual (falhas em paralelo não se sobrescrevem);
 * `lastAttempt`: o limitador em memória já não aceita outra tentativa para este e-mail.
 */
function registerFailure(user: AppUserRow | null, lastAttempt: boolean, now: number): boolean {
  if (!user) return lastAttempt;
  const after = recordLoginFailure(user.id, { now: new Date(now).toISOString(), lockUntil: new Date(now + LOCK_MS).toISOString(), maxFailures: MAX_LOGIN_FAILURES });
  return after.lockedUntil !== null && Date.parse(after.lockedUntil) > now;
}

export async function login(input: LoginInput, now = Date.now()): Promise<SessionDTO> {
  const key = loginKey(input.email);
  const user = findUserByEmail(input.email);
  const lockedInDb = user?.lockedUntil ? Date.parse(user.lockedUntil) > now : false;
  if (lockedInDb) throw locked();
  // A vaga é reservada antes de conferir a senha (scrypt é assíncrono): tentativas em paralelo não passam de 5 por janela.
  const attempt = rateLimit(key, LOGIN_RULE, now);
  if (!attempt.allowed) throw locked();

  const valid = user && user.active ? await verifyPassword(input.password, user.passwordHash) : await verifyAgainstDummy(input.password);
  if (!valid || !user || !user.active) {
    throw registerFailure(user && user.active ? user : null, attempt.remaining === 0, now) ? locked() : invalidCredentials();
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
  // Mesma regra do login: a vaga é reservada antes da conferência assíncrona da senha atual.
  if (!rateLimit(key, PASSWORD_RULE).allowed) throw new AppError("TOO_MANY_ATTEMPTS", LOCKED_MESSAGE, 429);
  if (!(await verifyPassword(input.currentPassword, user.passwordHash))) {
    throw new AppError("INVALID_PASSWORD", "A senha atual não confere.", 400, { field: "currentPassword" });
  }
  clearRateLimit(key);
  if (input.newPassword === input.currentPassword) {
    throw new AppError("SAME_PASSWORD", "Escolha uma senha diferente da atual.", 400, { field: "newPassword" });
  }
  updateUser(user.id, { passwordHash: await hashPassword(input.newPassword), mustChangePassword: false });
  revokeOtherSessions(user.id, tokenHash);
  auditAs({ type: "user", id: user.id, name: user.name }, "Senha alterada", "user", user.id);
  return { ok: true };
}
