"use client";

import { ChevronRight, Hourglass, TriangleAlert } from "lucide-react";
import { ROLE_ICON } from "@/components/lines/icons";
import { Pictogram } from "@/components/lines/pictogram";
import { StationList } from "@/components/lines/station-list";
import { Chip, type ChipTone } from "@/components/ui/chip";
import { cx } from "@/lib/cx";
import { plural, relativeTo } from "@/lib/format";
import type { ActivityDTO, JourneyDTO, JourneyStageDTO } from "@/shared/contracts";
import { ACTIVITY_STATUS_LABEL, ROLE_LABEL } from "@/shared/enums";
import { ACTIVITY_STATUS_TONE, activityTiming, SYNC_NOTE } from "../labels";
import styles from "./journey-stages.module.css";

/** Situação da atividade em chip: "Atrasada" vence o status quando o prazo passou. */
export function activityChip(activity: ActivityDTO): { tone: ChipTone; label: string } {
  if (activity.overdue && activity.status !== "done" && activity.status !== "cancelled") return { tone: "late", label: "Atrasada" };
  return { tone: ACTIVITY_STATUS_TONE[activity.status], label: ACTIVITY_STATUS_LABEL[activity.status] };
}

/** Aviso de sincronização ao lado da atividade (nunca só cor: ícone + texto). */
export function syncNote(activity: ActivityDTO): { text: string; error: boolean } | null {
  if (activity.bitrixMissing) return { text: "Tarefa apagada no Bitrix24", error: true };
  // Atividade ainda não liberada nunca foi ao Bitrix24: o chip "Ainda não liberada" já diz tudo.
  if (activity.status === "locked" && activity.syncState === "local") return null;
  const text = SYNC_NOTE[activity.syncState];
  return text ? { text, error: activity.syncState === "error" } : null;
}

function stageMeta(stage: JourneyStageDTO, today: string): string {
  const total = stage.activities.length;
  const done = stage.activities.filter((activity) => activity.status === "done").length;
  if (stage.state === "done") return `Etapa concluída · ${plural(total, "atividade", "atividades")}`;
  if (stage.state === "current") return `${done} de ${plural(total, "atividade feita", "atividades feitas")}`;
  if (stage.releasesAt) {
    return stage.releaseMode === "after_previous"
      ? `Libera quando a etapa anterior terminar ou ${relativeTo(stage.releasesAt, today)}, o que vier primeiro`
      : `Libera ${relativeTo(stage.releasesAt, today)}`;
  }
  return stage.releaseMode === "after_previous" ? "Libera quando a etapa anterior terminar" : "Libera no início da jornada";
}

function ActivityRow({ activity, today, onOpen }: { activity: ActivityDTO; today: string; onOpen: (id: string) => void }) {
  const chip = activityChip(activity);
  const note = syncNote(activity);
  const done = activity.status === "done" || activity.status === "cancelled";
  return (
    <button type="button" className={cx(styles.row, done && styles.rowDone)} onClick={() => onOpen(activity.id)}>
      <Pictogram icon={ROLE_ICON[activity.role]} tone={done ? "muted" : "forest"} />
      <span className={styles.text}>
        <span className={styles.title}>{activity.title}</span>
        <span className={styles.meta}>
          {ROLE_LABEL[activity.role]}
          {activity.assignee ? ` · ${activity.assignee.name}` : " · sem responsável"} · {activityTiming(activity, today)}
        </span>
        {note ? (
          <span className={cx(styles.sync, note.error && styles.syncError)}>
            {note.error ? <TriangleAlert size={16} strokeWidth={2.25} aria-hidden="true" /> : <Hourglass size={16} strokeWidth={2.25} aria-hidden="true" />}
            {note.text}
          </span>
        ) : null}
      </span>
      <Chip tone={chip.tone} className={styles.chip}>
        {chip.label}
      </Chip>
      <ChevronRight className={styles.chevron} size={20} strokeWidth={2.25} aria-hidden="true" />
    </button>
  );
}

/** A linha da jornada por etapas, com as atividades de cada estação. Clicar abre a gaveta da atividade. */
export function JourneyStages({ journey, today, onOpen }: { journey: JourneyDTO; today: string; onOpen: (activityId: string) => void }) {
  const { summary } = journey;
  if (!journey.stages.length) {
    return <p className={styles.empty}>Esta jornada ainda não tem etapas.</p>;
  }
  return (
    <StationList
      kind={summary.kind}
      label={`Etapas da jornada de ${summary.person.name}`}
      items={journey.stages.map((stage) => ({
        key: String(stage.position),
        title: stage.name,
        state: stage.state,
        meta: stageMeta(stage, today),
        children: stage.activities.length ? (
          <ul className={styles.list}>
            {stage.activities.map((activity) => (
              <li key={activity.id}>
                <ActivityRow activity={activity} today={today} onOpen={onOpen} />
              </li>
            ))}
          </ul>
        ) : null,
      }))}
    />
  );
}
