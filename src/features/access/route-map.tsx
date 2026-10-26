import styles from "./route-map.module.css";

/** Mapa decorativo: a linha verde (chegadas) e a laranja (saídas), com o marcador amarelo. */
export function RouteMap({ className }: { className?: string }) {
  return (
    <svg className={`${styles.map} ${className ?? ""}`} viewBox="0 0 420 240" aria-hidden="true" focusable="false">
      <path className={styles.arrival} d="M10 196 H120 C150 196 160 186 176 166 L232 92 C246 74 258 68 284 68 H410" />
      <path className={styles.departure} d="M10 40 H96 C124 40 136 52 150 72 L206 152 C220 172 234 180 262 180 H410" />
      <circle className={styles.stationArrival} cx="62" cy="196" r="9" />
      <circle className={styles.stationArrival} cx="204" cy="128" r="9" />
      <circle className={styles.stationArrival} cx="350" cy="68" r="9" />
      <circle className={styles.stationDeparture} cx="52" cy="40" r="9" />
      <circle className={styles.stationDeparture} cx="330" cy="180" r="9" />
      <circle className={styles.here} cx="204" cy="128" r="14" />
    </svg>
  );
}
