import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { cx } from "@/lib/cx";
import type { JourneyKind } from "@/shared/enums";
import styles from "./station-list.module.css";

export interface StationListItem {
  key: string;
  title: ReactNode;
  state: "done" | "current" | "upcoming";
  /** Linha de contexto abaixo do título (ex.: "Libera em 3 dias"). */
  meta?: ReactNode;
  children?: ReactNode;
}

export interface StationListProps {
  items: StationListItem[];
  kind: JourneyKind;
  /** Nome acessível da lista. */
  label: string;
  hereLabel?: string;
  headingLevel?: 2 | 3 | 4;
  className?: string;
}

const STATE_TEXT = { done: "Etapa concluída", upcoming: "Próxima etapa" } as const;

/** Linha vertical: cada etapa é uma estação; o conteúdo da etapa fica ao lado do trilho. */
export function StationList({ items, kind, label, hereLabel = "Você está aqui", headingLevel = 3, className }: StationListProps) {
  const Heading = headingLevel === 2 ? "h2" : headingLevel === 3 ? "h3" : "h4";
  return (
    <ol className={cx(styles.list, styles[kind], className)} aria-label={label}>
      {items.map((item) => (
        <li key={item.key} className={cx(styles.item, styles[item.state])}>
          <span className={styles.dot} aria-hidden="true">
            {item.state === "done" ? <Check size={14} strokeWidth={3.5} /> : null}
          </span>
          <div className={styles.content}>
            <div className={styles.head}>
              <Heading className={styles.title}>{item.title}</Heading>
              {item.state === "current" ? <span className={styles.here}>{hereLabel}</span> : <span className="sr-only">{STATE_TEXT[item.state]}</span>}
            </div>
            {item.meta ? <div className={styles.meta}>{item.meta}</div> : null}
            {item.children ? <div className={styles.children}>{item.children}</div> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
