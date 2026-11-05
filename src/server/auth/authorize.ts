import "server-only";
import type { AppRole } from "@/shared/enums";
import { can, type Operation } from "@/shared/permissions";
import { AppError } from "../errors";

export const FORBIDDEN_MESSAGE = "Peça a um administrador do Nexo para fazer isso.";

/** Aplica a matriz de papel × operação. Rotas chamam pelo envoltório; quem varia conforme a entrada (ex.: convite) chama direto. */
export function assertCan(user: { role: AppRole }, operation: Operation): void {
  if (!can(user.role, operation)) throw new AppError("FORBIDDEN", FORBIDDEN_MESSAGE, 403);
}
