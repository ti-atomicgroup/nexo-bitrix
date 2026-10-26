import "server-only";
import type { JourneyChecklistItem } from "@/shared/contracts";
import type { LedgerKind } from "@/shared/enums";
import type { ActivityRow } from "../db/repos/activities";
import type { LedgerRow } from "../db/repos/ledger";

export const LEDGER_KEY_PREFIX = "ledger-";
export const REVOKE_ROOT_TITLE = "Revogar e recolher";

/** Chave do item na lista "Revogar e recolher": o UUID sem hífens cabe no limite de 40 caracteres das chaves. */
export function ledgerChecklistKey(ledgerId: string): string {
  return `${LEDGER_KEY_PREFIX}${ledgerId.replace(/-/g, "").toLowerCase()}`.slice(0, 40);
}

export function matchLedgerKey<T extends Pick<LedgerRow, "id">>(key: string, ledger: T[]): T | null {
  if (!key.startsWith(LEDGER_KEY_PREFIX)) return null;
  return ledger.find((item) => ledgerChecklistKey(item.id) === key) ?? null;
}

export function ledgerItemText(item: Pick<LedgerRow, "kind" | "name" | "detail">): string {
  const detail = item.detail.trim();
  const label = detail ? `${item.name} · ${detail}` : item.name;
  return item.kind === "access" ? `Revogar acesso: ${label}` : `Recolher equipamento: ${label}`;
}

/** Checklist da tarefa de TI na saída: exatamente o que está com a pessoa. */
export function revokeChecklist(items: LedgerRow[]): JourneyChecklistItem[] {
  return items.map((item) => ({ key: ledgerChecklistKey(item.id), text: ledgerItemText(item), done: false, bitrixItemId: null, ledger: null }));
}

/** Itens do checklist com etiqueta de inventário (acesso ou equipamento) e se já foram marcados. */
export function ledgerGrants(activity: Pick<ActivityRow, "checklist">): Array<{ itemKey: string; kind: LedgerKind; name: string; done: boolean }> {
  return activity.checklist
    .filter((item): item is JourneyChecklistItem & { ledger: NonNullable<JourneyChecklistItem["ledger"]> } => item.ledger !== null)
    .map((item) => ({ itemKey: item.key, kind: item.ledger.kind, name: item.ledger.name, done: item.done }));
}
