import "server-only";
import type { AppUserDTO } from "@/shared/contracts";
import type { AppRole } from "@/shared/enums";
import { getDb } from "..";
import { buildSet, newId, nowIso, toBool, toStringOrNull } from "./util";

export interface AppUserRow {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: AppRole;
  bitrixUserId: string | null;
  active: boolean;
  mustChangePassword: boolean;
  failedLogins: number;
  lockedUntil: string | null;
  createdAt: string;
  lastLoginAt: string | null;
}

const COLUMNS = {
  name: "name",
  email: "email",
  passwordHash: "password_hash",
  role: "role",
  bitrixUserId: "bitrix_user_id",
  active: "active",
  mustChangePassword: "must_change_password",
  failedLogins: "failed_logins",
  lockedUntil: "locked_until",
  lastLoginAt: "last_login_at",
};

function map(row: Record<string, unknown>): AppUserRow {
  return {
    id: String(row.id),
    name: String(row.name),
    email: String(row.email),
    passwordHash: String(row.password_hash),
    role: row.role as AppRole,
    bitrixUserId: toStringOrNull(row.bitrix_user_id),
    active: toBool(row.active),
    mustChangePassword: toBool(row.must_change_password),
    failedLogins: Number(row.failed_logins ?? 0),
    lockedUntil: toStringOrNull(row.locked_until),
    createdAt: String(row.created_at),
    lastLoginAt: toStringOrNull(row.last_login_at),
  };
}

export function createUser(input: { name: string; email: string; passwordHash: string; role: AppRole; bitrixUserId?: string | null; mustChangePassword?: boolean }): AppUserRow {
  const id = newId();
  getDb()
    .prepare(
      "INSERT INTO app_users (id, name, email, password_hash, role, bitrix_user_id, must_change_password, created_at) VALUES (@id, @name, @email, @passwordHash, @role, @bitrixUserId, @mustChangePassword, @createdAt)",
    )
    .run({
      id,
      name: input.name,
      email: input.email.trim().toLowerCase(),
      passwordHash: input.passwordHash,
      role: input.role,
      bitrixUserId: input.bitrixUserId ?? null,
      mustChangePassword: input.mustChangePassword ?? false,
      createdAt: nowIso(),
    });
  return findUserById(id)!;
}

export function findUserById(id: string): AppUserRow | null {
  const row = getDb().prepare("SELECT * FROM app_users WHERE id = ?").get(id);
  return row ? map(row) : null;
}

export function findUserByEmail(email: string): AppUserRow | null {
  const row = getDb().prepare("SELECT * FROM app_users WHERE email = ? COLLATE NOCASE").get(email.trim().toLowerCase());
  return row ? map(row) : null;
}

export function listUsers(): AppUserRow[] {
  return getDb().prepare("SELECT * FROM app_users ORDER BY name COLLATE NOCASE").all().map(map);
}

export function countUsers(): number {
  return Number(getDb().prepare("SELECT COUNT(*) AS total FROM app_users").get<{ total: number }>()?.total ?? 0);
}

export function updateUser(id: string, patch: Partial<Omit<AppUserRow, "id" | "createdAt">>): AppUserRow | null {
  const { sql, params } = buildSet(patch, COLUMNS);
  if (sql) getDb().prepare(`UPDATE app_users SET ${sql} WHERE id = @id`).run({ ...params, id });
  return findUserById(id);
}

export function recordLoginFailure(id: string, lockedUntil: string | null): void {
  getDb().prepare("UPDATE app_users SET failed_logins = failed_logins + 1, locked_until = ? WHERE id = ?").run(lockedUntil, id);
}

export function recordLoginSuccess(id: string): void {
  getDb().prepare("UPDATE app_users SET failed_logins = 0, locked_until = NULL, last_login_at = ? WHERE id = ?").run(nowIso(), id);
}

export function toAppUserDTO(row: AppUserRow): AppUserDTO {
  return { id: row.id, name: row.name, email: row.email, role: row.role, active: row.active, lastLoginAt: row.lastLoginAt };
}
