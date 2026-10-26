import { CircleAlert, CircleCheck, Info, TriangleAlert, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cx } from "@/lib/cx";
import styles from "./notice.module.css";

export type NoticeTone = "info" | "success" | "warning" | "error";

const ICON: Record<NoticeTone, LucideIcon> = { info: Info, success: CircleCheck, warning: TriangleAlert, error: CircleAlert };

export interface NoticeProps {
  tone?: NoticeTone;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  /** `alert` para erros que surgem após uma ação; `status` para confirmações. */
  role?: "alert" | "status";
  icon?: LucideIcon;
  className?: string;
}

/** Aviso em linha com faixa lateral colorida, ícone e texto (a cor nunca é o único sinal). */
export function Notice({ tone = "info", title, children, action, role, icon, className }: NoticeProps) {
  const Icon = icon ?? ICON[tone];
  return (
    <div className={cx(styles.notice, styles[tone], className)} role={role}>
      <Icon className={styles.icon} size={22} strokeWidth={2.25} aria-hidden="true" />
      <div className={styles.text}>
        {title ? <p className={styles.title}>{title}</p> : null}
        {children ? <div className={styles.body}>{children}</div> : null}
      </div>
      {action ? <div className={styles.action}>{action}</div> : null}
    </div>
  );
}
