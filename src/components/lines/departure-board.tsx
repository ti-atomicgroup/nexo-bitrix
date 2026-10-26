import { TriangleAlert } from "lucide-react";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { Chip } from "@/components/ui/chip";
import { cx } from "@/lib/cx";
import type { BoardRowDTO } from "@/shared/contracts";
import { JOURNEY_KIND_LABEL } from "@/shared/enums";
import styles from "./departure-board.module.css";

export interface DepartureBoardProps {
  rows: BoardRowDTO[];
  /** Legenda da tabela (lida pelo leitor de tela). */
  caption: string;
  /** Botões da coluna "Ação" de cada linha. */
  renderAction: (row: BoardRowDTO) => ReactNode;
  /** `false` quando o painel já está dentro de um bloco verde-floresta (sem fundo nem margem próprios). */
  framed?: boolean;
  className?: string;
}

/**
 * Painel de partidas: tabela acessível (com papéis explícitos, que sobrevivem ao layout empilhado do
 * celular) em fundo verde-floresta, horários em amarelo condensado.
 */
export function DepartureBoard({ rows, caption, renderAction, framed = true, className }: DepartureBoardProps) {
  return (
    <div className={cx(styles.board, framed && styles.framed, className)}>
      <table className={styles.table} role="table">
        <caption className="sr-only">{caption}</caption>
        <thead className={styles.head} role="rowgroup">
          <tr role="row">
            <th role="columnheader" scope="col">
              Quando
            </th>
            <th role="columnheader" scope="col">
              Quem
            </th>
            <th role="columnheader" scope="col">
              O quê
            </th>
            <th role="columnheader" scope="col">
              Situação
            </th>
            <th role="columnheader" scope="col">
              Ação
            </th>
          </tr>
        </thead>
        <tbody role="rowgroup">
          {rows.map((row, index) => (
            <tr key={row.id} role="row" className={styles.row} style={{ "--i": Math.min(index, 12) } as CSSProperties}>
              <td role="cell" className={styles.when}>
                <span className={styles.time}>
                  {row.when.overdue ? <TriangleAlert className={styles.alert} size={20} strokeWidth={2.5} role="img" aria-label="Atrasada:" /> : null}
                  {row.when.label}
                </span>
              </td>
              <td role="cell" className={styles.who}>
                {row.who.journeyId ? (
                  <Link href={`/pessoas/${encodeURIComponent(row.who.journeyId)}`} className={styles.name}>
                    {row.who.name}
                  </Link>
                ) : (
                  <span className={styles.name}>{row.who.name}</span>
                )}
                {row.who.kind ? (
                  <span className={cx(styles.kind, styles[row.who.kind])}>
                    <span className={styles.dash} aria-hidden="true" />
                    {JOURNEY_KIND_LABEL[row.who.kind]}
                  </span>
                ) : null}
              </td>
              <td role="cell" className={styles.what}>
                <span className={styles.whatText}>{row.what}</span>
                {row.reason ? <span className={styles.reason}>{row.reason}</span> : null}
              </td>
              <td role="cell" className={styles.status}>
                <Chip tone={row.status.tone} onDark>
                  {row.status.label}
                </Chip>
              </td>
              <td role="cell" className={styles.action}>
                {renderAction(row)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
