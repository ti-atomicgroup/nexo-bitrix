import "server-only";
import type { AppUserDTO } from "@/shared/contracts";
import type { AppRole } from "@/shared/enums";
import type { CreateUserInput, UpdateUserInput } from "@/shared/schemas";
import type { Actor } from "@/server/engine";
import { getDb } from "../db";
import { deleteUserSessions } from "../db/repos/sessions";
import { createUser, findUserByEmail, findUserById, listUsers, toAppUserDTO, updateUser, type AppUserRow } from "../db/repos/users";
import { AppError } from "../errors";
import { hashPassword } from "../security/passwords";
import { auditAs } from "./audit";

const ROLE_NAME: Record<AppRole, string> = { admin: "Administrador", rh: "RH" };

const duplicateEmail = () => new AppError("EMAIL_TAKEN", "Já existe um acesso com este e-mail.", 409, { field: "email" });
const userNotFound = () => new AppError("NOT_FOUND", "Não encontramos este acesso.", 404);

export function listAppUsers(): AppUserDTO[] {
  return listUsers().map(toAppUserDTO);
}

/** Acesso novo entra com senha temporária e precisa trocá-la no primeiro login. */
export async function createAppUser(input: CreateUserInput, actor: Actor): Promise<AppUserDTO> {
  if (findUserByEmail(input.email)) throw duplicateEmail();
  const passwordHash = await hashPassword(input.temporaryPassword);
  let user: AppUserRow;
  try {
    user = createUser({ name: input.name, email: input.email, passwordHash, role: input.role, mustChangePassword: true });
  } catch (error) {
    if (error instanceof Error && /UNIQUE/i.test(error.message)) throw duplicateEmail();
    throw error;
  }
  auditAs(actor, "Acesso criado", "user", user.id, `${user.name} · ${ROLE_NAME[user.role]}`);
  return toAppUserDTO(user);
}

function activeAdminCount(): number {
  return listUsers().filter((user) => user.active && user.role === "admin").length;
}

/** Ativar/desativar, trocar papel ou redefinir senha. Nunca deixa o Nexo sem um administrador ativo. */
export async function updateAppUser(id: string, input: UpdateUserInput, actor: Actor): Promise<AppUserDTO> {
  if (!findUserById(id)) throw userNotFound();
  // O hash é assíncrono: calculado antes da transação.
  const passwordHash = input.resetPassword !== undefined ? await hashPassword(input.resetPassword) : null;

  const updated = getDb().tx(() => {
    const target = findUserById(id);
    if (!target) throw userNotFound();
    const losesAdmin = target.role === "admin" && target.active && (input.active === false || (input.role !== undefined && input.role !== "admin"));
    if (losesAdmin && activeAdminCount() <= 1) {
      throw new AppError("LAST_ADMIN", "Mantenha pelo menos um administrador ativo. Promova outra pessoa antes.", 409);
    }

    const patch: Partial<AppUserRow> = {};
    const changes: string[] = [];
    if (input.active !== undefined && input.active !== target.active) {
      patch.active = input.active;
      changes.push(input.active ? "reativado" : "desativado");
    }
    if (input.role !== undefined && input.role !== target.role) {
      patch.role = input.role;
      changes.push(`papel ${ROLE_NAME[input.role]}`);
    }
    if (passwordHash) {
      Object.assign(patch, { passwordHash, mustChangePassword: true, failedLogins: 0, lockedUntil: null });
      changes.push("senha redefinida");
    }
    if (!changes.length) return target;

    const saved = updateUser(id, patch) ?? target;
    // Desativar ou redefinir a senha encerra as sessões abertas dessa pessoa.
    if (patch.active === false || passwordHash) deleteUserSessions(id);
    auditAs(actor, "Acesso atualizado", "user", id, `${saved.name}: ${changes.join(", ")}`);
    return saved;
  });
  return toAppUserDTO(updated);
}
