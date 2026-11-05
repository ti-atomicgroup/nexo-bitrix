import "server-only";
import type { UserRef } from "@/shared/contracts";

/** Quem fez a ação (vai para o histórico). */
export interface Actor {
  type: "user" | "system" | "link";
  id: string | null;
  name: string | null;
}

export interface WebhookCheck {
  portal: string;
  owner: UserRef;
  /** Escopos concedidos ao webhook (resposta do método `scope`). */
  scopes: string[];
  /** URL cifrada (AES-256-GCM), pronta para `setWebhookRecord`. */
  encryptedUrl: string;
  /** A conta do webhook é administradora do portal (nulo: o Bitrix24 não informou). */
  ownerIsPortalAdmin?: boolean | null;
}

export interface SchedulerStatus {
  running: boolean;
  lastCycleAt: string | null;
  lastCycleMs: number | null;
  lastError: string | null;
  nextCycleAt: string | null;
}

export const SYSTEM_ACTOR: Actor = { type: "system", id: null, name: null };
