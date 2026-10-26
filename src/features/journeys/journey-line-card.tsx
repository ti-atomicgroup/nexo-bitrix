import { CircleDot } from "lucide-react";
import Link from "next/link";
import { LineTrack } from "@/components/lines/line-track";
import { Avatar } from "@/components/ui/avatar";
import { Chip } from "@/components/ui/chip";
import { cx } from "@/lib/cx";
import { anchorPhrase, formatMoment } from "@/lib/format";
import type { JourneySummaryDTO } from "@/shared/contracts";
import { JOURNEY_STATUS_LABEL } from "@/shared/enums";
import styles from "./journey-line-card.module.css";
import { JOURNEY_STATUS_TONE, kindTone, RISK_CHIP } from "./labels";

/** Uma pessoa, uma linha: estações, "você está aqui", próxima parada e risco. O cartão inteiro abre a jornada. */
export function JourneyLineCard({ journey, today, headingLevel = 3 }: { journey: JourneySummaryDTO; today: string; headingLevel?: 2 | 3 }) {
  const { person, kind } = journey;
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const risk = RISK_CHIP[journey.risk];
  return (
    <article className={cx(styles.card, styles[kind])}>
      <div className={styles.head}>
        <Avatar name={person.name} tone={kindTone(kind)} />
        <div className={styles.who}>
          <Heading className={styles.name}>
            <Link href={`/pessoas/${encodeURIComponent(journey.id)}`} className={styles.link}>
              {person.name}
            </Link>
          </Heading>
          <p className={styles.meta}>
            {journey.templateName}
            {journey.profile ? ` · ${journey.profile}` : ""}
          </p>
        </div>
        <div className={styles.badges}>
          <Chip tone={kindTone(kind)}>{anchorPhrase(kind, journey.anchorDate, today)}</Chip>
          {journey.status !== "active" ? <Chip tone={JOURNEY_STATUS_TONE[journey.status]}>{JOURNEY_STATUS_LABEL[journey.status]}</Chip> : null}
          {journey.status === "active" ? <Chip tone={risk.tone}>{risk.label}</Chip> : null}
        </div>
      </div>
      {journey.line.length ? <LineTrack stations={journey.line} kind={kind} label={`Linha de ${person.name}`} /> : null}
      <div className={styles.foot}>
        <p className={styles.next}>
          <CircleDot className={styles.nextIcon} size={16} strokeWidth={2.25} aria-hidden="true" />
          {journey.nextStop ? (
            <span>
              Próxima parada: <strong>{journey.nextStop.label}</strong>, {formatMoment(journey.nextStop.at, today)}
            </span>
          ) : (
            <span>Sem próximas paradas</span>
          )}
        </p>
        <p className={styles.progress}>
          <strong>{journey.progress.done}</strong> de {journey.progress.total} atividades
        </p>
      </div>
    </article>
  );
}
