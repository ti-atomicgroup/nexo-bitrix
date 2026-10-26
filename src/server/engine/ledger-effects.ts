import "server-only";
import { audit } from "../db/repos/audit";
import type { ActivityRow } from "../db/repos/activities";
import type { JourneyRow } from "../db/repos/journeys";
import { findLedgerByGrant, insertLedgerItem, listLedger, updateLedgerItem } from "../db/repos/ledger";
import { ledgerGrants, matchLedgerKey } from "../domain/ledger";

/**
 * "Tudo o que entrou, sai": reflete o checklist no inventário da pessoa.
 * - Entrada: item com etiqueta marcado → item do inventário ativo (idempotente por atividade + chave);
 *   desmarcado → volta para previsto.
 * - Saída (tarefa "Revogar e recolher"): item `ledger-…` marcado → encerrado; desmarcado → devolução pedida de novo.
 * Itens dispensados nunca mudam por aqui.
 */
export function applyLedgerEffects(journey: JourneyRow, activity: ActivityRow, now: Date = new Date()): void {
  const at = now.toISOString();
  if (journey.kind === "onboarding") {
    for (const grant of ledgerGrants(activity)) {
      const existing = findLedgerByGrant(activity.id, grant.itemKey);
      if (grant.done && !existing) {
        insertLedgerItem({
          personId: journey.personId,
          kind: grant.kind,
          name: grant.name,
          status: "active",
          source: "onboarding",
          grantedJourneyId: journey.id,
          grantedActivityId: activity.id,
          grantedItemKey: grant.itemKey,
          grantedAt: at,
        });
        note(journey, `${grant.name} entrou no inventário da pessoa.`);
      } else if (grant.done && existing?.status === "planned") {
        updateLedgerItem(existing.id, { status: "active", grantedAt: at });
        note(journey, `${grant.name} entrou no inventário da pessoa.`);
      } else if (!grant.done && existing?.status === "active" && existing.source === "onboarding") {
        updateLedgerItem(existing.id, { status: "planned" });
        note(journey, `${grant.name} voltou para previsto no inventário (item desmarcado).`);
      }
    }
    return;
  }
  if (activity.ledgerRole !== "revoke_and_collect") return;
  const ledger = listLedger(journey.personId);
  for (const item of activity.checklist) {
    const entry = matchLedgerKey(item.key, ledger);
    if (!entry) continue;
    if (item.done && (entry.status === "active" || entry.status === "return_requested")) {
      updateLedgerItem(entry.id, { status: "closed", closedAt: at, closingJourneyId: journey.id, closingActivityId: activity.id });
      note(journey, `${entry.name} ${entry.kind === "access" ? "revogado" : "devolvido"}.`);
    } else if (!item.done && entry.status === "closed" && entry.closingActivityId === activity.id) {
      updateLedgerItem(entry.id, { status: "return_requested", closedAt: null });
      note(journey, `${entry.name} voltou para a lista de devolução (item desmarcado).`);
    }
  }
}

function note(journey: JourneyRow, text: string): void {
  audit({ actorType: "system", action: "Inventário atualizado", entity: "journey", entityId: journey.id, detail: { text } });
}
