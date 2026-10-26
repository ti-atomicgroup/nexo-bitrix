import { cx } from "@/lib/cx";
import styles from "./progress-bar.module.css";

export interface ProgressBarProps {
  /** 0 a 100. */
  value: number;
  /** Nome acessível (ex.: "Progresso da jornada de Ana Souza"). */
  label: string;
  tone?: "arrival" | "departure" | "forest";
  className?: string;
}

/** Barra de progresso no traço de 6 px das linhas. O número em texto deve aparecer ao lado. */
export function ProgressBar({ value, label, tone = "forest", className }: ProgressBarProps) {
  const percent = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div
      className={cx(styles.track, styles[tone], className)}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      aria-valuetext={`${percent}%`}
    >
      <span className={styles.fill} style={{ width: `${percent}%` }} />
    </div>
  );
}
