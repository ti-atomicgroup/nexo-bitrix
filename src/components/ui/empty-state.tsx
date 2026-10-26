import { Inbox, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cx } from "@/lib/cx";
import styles from "./empty-state.module.css";

export interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  /** Cor do trecho de linha decorativo. */
  tone?: "forest" | "arrival" | "departure";
  headingLevel?: 2 | 3;
  className?: string;
}

/** Estado vazio: um trecho de linha sem estações ocupadas, título, explicação e o próximo passo. */
export function EmptyState({ icon: Icon = Inbox, title, children, action, tone = "forest", headingLevel = 2, className }: EmptyStateProps) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <div className={cx(styles.empty, styles[tone], className)}>
      <div className={styles.line} aria-hidden="true">
        <span className={styles.station} />
        <span className={styles.tile}>
          <Icon size={26} strokeWidth={2.25} />
        </span>
        <span className={styles.station} />
      </div>
      <Heading className={styles.title}>{title}</Heading>
      {children ? <div className={styles.text}>{children}</div> : null}
      {action ? <div className={styles.action}>{action}</div> : null}
    </div>
  );
}
