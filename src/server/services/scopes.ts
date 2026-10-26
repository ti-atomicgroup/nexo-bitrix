import "server-only";
import type { ScopeCheckDTO, UserRef } from "@/shared/contracts";
import { OPTIONAL_SCOPES, REQUIRED_SCOPES, SCOPE_LABEL, type RequiredScope } from "@/shared/enums";
import { AppError } from "../errors";

/** Escopos equivalentes aceitos pelo Bitrix24 (`user` cobre `user_brief`; `sonet` cobre `sonet_group`). */
const ALTERNATIVES: Partial<Record<RequiredScope, string[]>> = { user_brief: ["user"], sonet_group: ["sonet"] };

export function scopeCheck(granted: string[]): ScopeCheckDTO {
  const has = new Set(granted.map((scope) => scope.trim().toLowerCase()));
  const required = Object.fromEntries(
    REQUIRED_SCOPES.map((scope) => [scope, has.has(scope) || (ALTERNATIVES[scope] ?? []).some((alternative) => has.has(alternative))]),
  ) as ScopeCheckDTO["required"];
  const optional = Object.fromEntries(OPTIONAL_SCOPES.map((scope) => [scope, has.has(scope)])) as ScopeCheckDTO["optional"];
  return { required, optional };
}

export function missingRequiredScopes(check: ScopeCheckDTO): RequiredScope[] {
  return REQUIRED_SCOPES.filter((scope) => !check.required[scope]);
}

function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} e ${names[names.length - 1]}`;
}

/** Falta escopo obrigatório → 422 com a lista para a tela de instalação marcar ✓/–. */
export function assertRequiredScopes(check: ScopeCheckDTO, context: { portal: string; owner: UserRef }): void {
  const missing = missingRequiredScopes(check);
  if (!missing.length) return;
  const names = joinNames(missing.map((scope) => SCOPE_LABEL[scope]));
  throw new AppError("SCOPES_MISSING", `Marque ${names} no webhook do Bitrix24, salve e cole o endereço de novo.`, 422, {
    scopes: check,
    missing,
    portal: context.portal,
    owner: context.owner,
  });
}
