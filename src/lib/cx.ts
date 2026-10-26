/** Junta classes CSS ignorando valores vazios: `cx(styles.a, active && styles.b)`. */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
