import "server-only";
import type { MeDTO, SessionDTO } from "@/shared/contracts";
import type { SessionTransport } from "@/shared/enums";
import { issueSession } from "../auth/sessions";
import type { AppUserRow } from "../db/repos/users";
import { setupState } from "./setup-state";

export function buildMe(user: AppUserRow): MeDTO {
  return {
    user: { id: user.id, name: user.name, email: user.email, role: user.role, mustChangePassword: user.mustChangePassword },
    setup: setupState(),
  };
}

/** Abre uma sessão nova; o token só existe nesta resposta (`sessionResponse` decide se ele vai em cookie ou no corpo). */
export function startSession(user: AppUserRow, transport: SessionTransport = "bearer"): SessionDTO {
  const { token, expiresAt } = issueSession(user, Date.now(), transport);
  return { transport, token, expiresAt, me: buildMe(user) };
}
