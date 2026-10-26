import { Check } from "lucide-react";
import type { CSSProperties } from "react";
import { cx } from "@/lib/cx";
import type { LineStationDTO } from "@/shared/contracts";
import type { JourneyKind } from "@/shared/enums";
import styles from "./line-track.module.css";

const STATE_TEXT: Record<LineStationDTO["state"], string> = {
  done: "concluída",
  current: "está aqui agora",
  upcoming: "ainda não chegou",
};

export interface LineTrackProps {
  stations: LineStationDTO[];
  /** Verde-sinal para entrada, laranja para saída. */
  kind: JourneyKind;
  /** Nome acessível da linha (ex.: "Linha de Ana Souza"). */
  label: string;
  /** `compact` esconde os nomes das estações (listas); `full` mostra nomes e o marcador amarelo. */
  size?: "full" | "compact";
  hereLabel?: string;
  className?: string;
}

/** Linha horizontal: estações por etapa e o marcador amarelo "você está aqui". */
export function LineTrack({ stations, kind, label, size = "full", hereLabel = "Você está aqui", className }: LineTrackProps) {
  const count = Math.max(stations.length, 1);
  const currentIndex = stations.findIndex((station) => station.state === "current");
  const lastDone = stations.reduce((last, station, index) => (station.state === "done" ? index : last), -1);
  const reached = currentIndex >= 0 ? currentIndex : Math.max(lastDone, 0);
  const align = currentIndex <= 0 ? "Start" : currentIndex === count - 1 ? "End" : "Center";
  const showHere = size === "full" && currentIndex >= 0;
  const style = { "--count": count, "--reached": reached } as CSSProperties;

  return (
    <div className={cx(styles.line, styles[kind], styles[size], showHere && styles.withHere, className)} style={style}>
      <ol className={styles.stations} aria-label={label}>
        {stations.map((station, index) => (
          <li key={station.position} className={cx(styles.station, styles[station.state], index <= reached && styles.reached)}>
            <span className={styles.dot} aria-hidden="true">
              {station.state === "done" ? <Check size={10} strokeWidth={4} /> : null}
            </span>
            {showHere && station.state === "current" ? (
              <span className={cx(styles.here, styles[`here${align}`])} aria-hidden="true">
                {hereLabel}
              </span>
            ) : null}
            <span className={cx(styles.name, size === "compact" && "sr-only")}>
              {station.name}
              <span className="sr-only">{`: ${STATE_TEXT[station.state]}`}</span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
