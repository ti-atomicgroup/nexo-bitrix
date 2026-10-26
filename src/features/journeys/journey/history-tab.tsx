"use client";

import { formatSince } from "@/lib/format";
import { useNow } from "@/lib/use-session";
import type { AuditEntryDTO } from "@/shared/contracts";
import styles from "./history-tab.module.css";

function absoluteTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(date);
}

/** Histórico da jornada: quem fez o quê e quando, do mais recente ao mais antigo. */
export function HistoryTab({ entries }: { entries: AuditEntryDTO[] }) {
  const now = useNow(60_000);
  if (!entries.length) return <p className={styles.quiet}>Nada registrado ainda.</p>;
  return (
    <ol className={styles.list}>
      {entries.map((entry, index) => (
        <li key={`${entry.at}-${index}`} className={styles.item}>
          <span className={styles.dot} aria-hidden="true" />
          <div className={styles.body}>
            <p className={styles.action}>
              <strong>{entry.actor}</strong> {entry.action}
            </p>
            {entry.detail ? <p className={styles.detail}>{entry.detail}</p> : null}
            <p className={styles.when}>
              <time dateTime={entry.at} title={absoluteTime(entry.at)}>
                {now === null ? absoluteTime(entry.at) : formatSince(entry.at, now)}
              </time>
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}
