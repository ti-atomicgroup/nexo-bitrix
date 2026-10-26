import Link from "next/link";
import { cx } from "@/lib/cx";
import { dayOfMonth, formatDateMedium, formatWeekdayShort, relativeDays } from "@/lib/format";
import type { TodayDTO } from "@/shared/contracts";
import styles from "./upcoming-list.module.css";

type Upcoming = TodayDTO["upcoming"][number];

/** Próximas chegadas e saídas, como um quadro de horários: dia, quem e quando. */
export function UpcomingList({ items }: { items: Upcoming[] }) {
  return (
    <ol className={styles.list}>
      {items.map((item) => (
        <li key={`${item.journeyId}-${item.anchorDate}`} className={cx(styles.item, styles[item.kind])}>
          <span className={styles.date} aria-hidden="true">
            <span className={styles.day}>{dayOfMonth(item.anchorDate)}</span>
            <span className={styles.weekday}>{formatWeekdayShort(item.anchorDate)}</span>
          </span>
          <span className={styles.text}>
            <Link href={`/pessoas/${encodeURIComponent(item.journeyId)}`} className={styles.name}>
              {item.personName}
            </Link>
            <span className={styles.when}>
              <span className={styles.dash} aria-hidden="true" />
              {item.kind === "onboarding" ? "Chega" : "Último dia"} {relativeDays(item.daysUntil)}, {formatDateMedium(item.anchorDate)}
            </span>
          </span>
        </li>
      ))}
    </ol>
  );
}
