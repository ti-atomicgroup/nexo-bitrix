import { CircleCheck, Info, OctagonAlert, TriangleAlert, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cx } from "@/lib/cx";
import styles from "./chip.module.css";

/** ok/attention/late/info seguem o painel; arrival/departure marcam a linha (entrada/saída). */
export type ChipTone = "neutral" | "ok" | "attention" | "late" | "info" | "arrival" | "departure" | "forest";

/** Ícone padrão de cada situação: o estado nunca depende só da cor. */
export const TONE_ICON: Partial<Record<ChipTone, LucideIcon>> = {
  ok: CircleCheck,
  attention: TriangleAlert,
  late: OctagonAlert,
  info: Info,
};

export interface ChipProps {
  tone?: ChipTone;
  /** Ícone explícito; `null` remove o ícone padrão do tom. */
  icon?: LucideIcon | null;
  /** Versão para o fundo verde-floresta (painel de partidas). */
  onDark?: boolean;
  className?: string;
  children: ReactNode;
}

export function Chip({ tone = "neutral", icon, onDark = false, className, children }: ChipProps) {
  const Icon = icon === null ? null : (icon ?? TONE_ICON[tone] ?? null);
  return (
    <span className={cx(styles.chip, styles[tone], onDark && styles.onDark, className)}>
      {tone === "arrival" || tone === "departure" ? <span className={styles.track} aria-hidden="true" /> : null}
      {Icon ? <Icon className={styles.icon} size={16} strokeWidth={2.25} aria-hidden="true" /> : null}
      <span>{children}</span>
    </span>
  );
}
