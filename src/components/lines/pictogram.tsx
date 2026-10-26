import type { LucideIcon } from "lucide-react";
import { cx } from "@/lib/cx";
import styles from "./pictogram.module.css";

export interface PictogramProps {
  icon: LucideIcon;
  tone?: "forest" | "arrival" | "departure" | "attention" | "muted";
  size?: "s" | "m" | "l";
  /** Com rótulo vira imagem acessível; sem rótulo é decorativo. */
  label?: string;
  className?: string;
}

const ICON_SIZE = { s: 16, m: 20, l: 28 } as const;

/** Ladrilho quadrado com ícone branco, como a sinalização das estações. */
export function Pictogram({ icon: Icon, tone = "forest", size = "m", label, className }: PictogramProps) {
  return (
    <span className={cx(styles.tile, styles[tone], styles[size], className)} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <Icon size={ICON_SIZE[size]} strokeWidth={2.25} aria-hidden="true" />
    </span>
  );
}
