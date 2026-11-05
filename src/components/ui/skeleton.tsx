import type { ReactNode } from "react";
import { cx } from "@/lib/cx";
import styles from "./skeleton.module.css";

export interface SkeletonProps {
  width?: number | string;
  height?: number | string;
  /** Cantos de 6 px (blocos grandes). */
  radius?: 6;
  /** Variante para o painel verde-floresta. */
  onDark?: boolean;
  className?: string;
}

/** Bloco de espera (decorativo). Use dentro de `LoadingArea`, que anuncia o carregamento. */
export function Skeleton({ width = "100%", height = 16, radius, onDark = false, className }: SkeletonProps) {
  // Medidas em atributo de SVG: a CSP não aceita o atributo style no HTML vindo do servidor, e este bloco é o que chega dele.
  return <svg className={cx(styles.skeleton, onDark && styles.onDark, radius && styles.rounded, className)} width={width} height={height} aria-hidden="true" focusable="false" />;
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
