import "server-only";
import type { LedgerItemDTO } from "@/shared/contracts";
import type { LedgerItemInput } from "@/shared/schemas";
import { addManualLedgerItem, waiveLedgerItem, type Actor } from "@/server/engine";
import { getLedgerItem, listLedger, toLedgerItemDTO } from "../../db/repos/ledger";
import { findPerson } from "../../db/repos/people";
import { AppError } from "../../errors";

/** Inventário "tudo o que entrou, sai": acessos e equipamentos por pessoa. */
function requirePerson(personId: string): void {
  if (!findPerson(personId)) throw new AppError("NOT_FOUND", "Não encontramos esta pessoa.", 404);
}

export function listPersonLedger(personId: string): LedgerItemDTO[] {
  requirePerson(personId);
  return listLedger(personId).map(toLedgerItemDTO);
}

export function addPersonLedgerItem(personId: string, input: LedgerItemInput, actor: Actor): LedgerItemDTO {
  requirePerson(personId);
  return toLedgerItemDTO(addManualLedgerItem(personId, input, actor));
}

export function waiveItem(itemId: string, reason: string, actor: Actor): LedgerItemDTO {
  if (!getLedgerItem(itemId)) throw new AppError("NOT_FOUND", "Não encontramos este item do inventário.", 404);
  return toLedgerItemDTO(waiveLedgerItem(itemId, reason, actor));
}
