"use client";

import { CircleCheck, Hourglass, RefreshCw, TriangleAlert } from "lucide-react";
import { cx } from "@/lib/cx";
import { formatSince, plural } from "@/lib/format";
import { useNow } from "@/lib/use-session";
import type { SyncStatusDTO } from "@/shared/contracts";
import styles from "./sync-status.module.css";

type Tone = "ok" | "error" | "waiting";

function describe(sync: SyncStatusDTO | null, now: number | null): { tone: Tone; text: string } {
  if (!sync) return { tone: "waiting", text: "Verificando a sincronização" };
  if (!sync.connected) return { tone: "error", text: "Bitrix24 desconectado" };
  if (sync.lastError) return { tone: "error", text: "Falha ao sincronizar" };
  if (sync.rateLimitedUntil && now !== null && Date.parse(sync.rateLimitedUntil) > now) {
    return { tone: "waiting", text: `Bitrix24 pediu uma pausa, volta ${formatSince(sync.rateLimitedUntil, now)}` };
  }
  if (sync.lastCycleAt && now !== null) return { tone: "ok", text: `Sincronizado ${formatSince(sync.lastCycleAt, now)}` };
  return { tone: "waiting", text: "Aguardando a primeira sincronização" };
}

const ICON = { ok: CircleCheck, error: TriangleAlert, waiting: Hourglass } as const;

/** Estado da sincronização com o Bitrix24; clicar sincroniza agora. */
export function SyncStatus({ sync, syncing, onSyncNow }: { sync: SyncStatusDTO | null; syncing: boolean; onSyncNow: () => void }) {
  const now = useNow(30_000);
  const { tone, text } = describe(sync, now);
  const Icon = syncing ? RefreshCw : ICON[tone];
  const detail = sync?.lastError ?? (sync && sync.queued > 0 ? `${plural(sync.queued, "envio", "envios")} na fila para o Bitrix24` : null);
  return (
    <button
      type="button"
      className={cx(styles.sync, styles[tone])}
      onClick={onSyncNow}
      disabled={syncing}
      aria-busy={syncing || undefined}
      title={detail ? `${detail}. Clique para sincronizar agora.` : "Clique para sincronizar agora."}
    >
      <Icon className={cx(styles.icon, syncing && styles.spin)} size={20} strokeWidth={2.25} aria-hidden="true" />
      <span className={styles.text}>{syncing ? "Sincronizando…" : text}</span>
      <span className="sr-only">{detail ? `. ${detail}` : ""}. Sincronizar agora</span>
    </button>
  );
}
