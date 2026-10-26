import type { ReactNode } from "react";
import { cx } from "@/lib/cx";
import styles from "./panel.module.css";

export interface PanelProps {
  title?: ReactNode;
  description?: ReactNode;
  /** Ações no canto do cabeçalho. */
  actions?: ReactNode;
  headingLevel?: 2 | 3;
  /** `flush` tira o espaçamento interno (para listas que encostam nas bordas). */
  flush?: boolean;
  id?: string;
  className?: string;
  children?: ReactNode;
}

/** Cartão branco com borda fina, sem sombra. */
export function Panel({ title, description, actions, headingLevel = 2, flush = false, id, className, children }: PanelProps) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const headingId = id ? `${id}-titulo` : undefined;
  return (
    <section id={id} className={cx(styles.panel, className)} aria-labelledby={title ? headingId : undefined}>
      {title || actions ? (
        <header className={styles.header}>
          <div className={styles.headText}>
            {title ? (
              <Heading id={headingId} className={styles.title}>
                {title}
              </Heading>
            ) : null}
            {description ? <p className={styles.description}>{description}</p> : null}
          </div>
          {actions ? <div className={styles.actions}>{actions}</div> : null}
        </header>
      ) : null}
      <div className={cx(styles.body, flush && styles.flush)}>{children}</div>
    </section>
  );
}
