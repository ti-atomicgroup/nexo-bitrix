import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { cx } from "@/lib/cx";
import styles from "./page-header.module.css";

export interface PageHeaderProps {
  title: ReactNode;
  /** Linha de contexto logo abaixo do título (data, situação). */
  meta?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  back?: { href: string; label: string };
  className?: string;
  children?: ReactNode;
}

/** Cabeçalho de página: título grande em Barlow Condensed, contexto e ações. */
export function PageHeader({ title, meta, description, actions, back, className, children }: PageHeaderProps) {
  return (
    <header className={cx(styles.header, className)}>
      {back ? (
        <Link href={back.href} className={styles.back}>
          <ArrowLeft size={18} strokeWidth={2.25} aria-hidden="true" />
          {back.label}
        </Link>
      ) : null}
      <div className={styles.row}>
        <div className={styles.text}>
          <h1 className={styles.title}>{title}</h1>
          {meta ? <div className={styles.meta}>{meta}</div> : null}
          {description ? <p className={styles.description}>{description}</p> : null}
        </div>
        {actions ? <div className={styles.actions}>{actions}</div> : null}
      </div>
      {children}
    </header>
  );
}
