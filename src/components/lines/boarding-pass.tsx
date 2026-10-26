import { RotaNMark } from "@/components/brand/logo";
import { cx } from "@/lib/cx";
import type { JourneyKind } from "@/shared/enums";
import styles from "./boarding-pass.module.css";

export interface BoardingPassField {
  label: string;
  value: string;
}

export interface BoardingPassProps {
  kind: JourneyKind;
  /** Texto da faixa superior (ex.: "Cartão de embarque"). */
  title: string;
  /** Linha acima do nome (ex.: "Boas-vindas,"). */
  greeting?: string;
  name: string;
  /** Campos em duas colunas: Embarque, Destino, Com você, Seu buddy… */
  fields: BoardingPassField[];
  /** Contagem regressiva grande no canhoto (ex.: { value: "7 dias", caption: "para o seu primeiro dia" }). */
  countdown: { value: string; caption: string };
  className?: string;
}

/** Cartão de embarque: faixa verde-floresta, nome grande, campos, picote tracejado e canhoto com a contagem. */
export function BoardingPass({ kind, title, greeting, name, fields, countdown, className }: BoardingPassProps) {
  return (
    <article className={cx(styles.pass, styles[kind], className)} aria-label={`${title}: ${name}`}>
      <div className={styles.card}>
        <header className={styles.strip}>
          <RotaNMark size={24} />
          <span className={styles.brand}>nexo</span>
          <span className={styles.stripLabel}>{title}</span>
        </header>
        <div className={styles.lineBar} aria-hidden="true" />
        <div className={styles.main}>
          <div className={styles.passenger}>
            {greeting ? <p className={styles.greeting}>{greeting}</p> : null}
            <p className={styles.name}>{name}</p>
          </div>
          <dl className={styles.fields}>
            {fields.map((field) => (
              <div key={field.label} className={styles.field}>
                <dt>{field.label}</dt>
                <dd>{field.value}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className={styles.stub}>
          <p className={styles.count}>{countdown.value}</p>
          <p className={styles.caption}>{countdown.caption}</p>
        </div>
      </div>
    </article>
  );
}
