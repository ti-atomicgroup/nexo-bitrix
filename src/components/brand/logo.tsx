import styles from "./logo.module.css";

/** Marca "Rota N": o N desenhado como trajeto, da partida (círculo) ao destino (amarelo). */
export function RotaNMark({ size = 32, startColor = "#FFFFFF" }: { size?: number; startColor?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true" focusable="false">
      <polyline points="7,33 7,8 33,32 33,9" fill="none" stroke="#00A651" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="33" cy="9" r="6" fill="#FFD200" />
      <circle cx="7" cy="33" r="4.5" fill={startColor} />
    </svg>
  );
}

/** Logotipo completo. `onDark` para a barra verde-floresta; `onLight` para fundos claros. */
export function Logo({ tone = "onDark", size = 28 }: { tone?: "onDark" | "onLight"; size?: number }) {
  return (
    <span className={`${styles.logo} ${tone === "onDark" ? styles.onDark : styles.onLight}`} style={{ fontSize: size }}>
      <RotaNMark size={Math.round(size * 1.15)} startColor={tone === "onDark" ? "#FFFFFF" : "#0B3B2C"} />
      <span className={styles.word}>nexo</span>
    </span>
  );
}
