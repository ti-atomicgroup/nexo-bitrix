import { initials } from "@/lib/format";
import { cx } from "@/lib/cx";
import styles from "./avatar.module.css";

export type AvatarTone = "forest" | "arrival" | "departure" | "light";

/** Avatar por iniciais (a CSP bloqueia fotos externas). Decorativo: o nome sempre aparece ao lado. */
export function Avatar({ name, size = "m", tone = "forest", className }: { name: string; size?: "s" | "m" | "l"; tone?: AvatarTone; className?: string }) {
  return (
    <span className={cx(styles.avatar, styles[size], styles[tone], className)} aria-hidden="true">
      {initials(name)}
    </span>
  );
}
