import type { CSSProperties, ReactNode } from "react";
import { cx } from "@/lib/cx";
import styles from "./skeleton.module.css";

export interface SkeletonProps {
  width?: CSSProperties["width"];
  height?: CSSProperties["height"];
  radius?: CSSProperties["borderRadius"];
  /** Variante para o painel verde-floresta. */
  onDark?: boolean;
  className?: string;
}

/** Bloco de espera (decorativo). Use dentro de `LoadingArea`, que anuncia o carregamento. */
export function Skeleton({ width = "100%", height = 16, radius, onDark = false, className }: SkeletonProps) {
  return <span className={cx(styles.skeleton, onDark && styles.onDark, className)} style={{ width, height, borderRadius: radius }} aria-hidden="true" />;
}

/** Área em carregamento: `aria-busy` e um texto só para leitores de tela. */
export function LoadingArea({ label = "Carregando…", className, children }: { label?: string; className?: string; children: ReactNode }) {
  return (
    <div className={cx(styles.area, className)} aria-busy="true">
      <span className="sr-only" role="status">
        {label}
      </span>
      {children}
    </div>
  );
}
