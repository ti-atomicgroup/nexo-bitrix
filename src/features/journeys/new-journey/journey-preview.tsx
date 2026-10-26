import { Pictogram } from "@/components/lines/pictogram";
import { ROLE_ICON } from "@/components/lines/icons";
import { Notice } from "@/components/ui/notice";
import { LoadingArea, Skeleton } from "@/components/ui/skeleton";
import type { ApiError } from "@/lib/api-client";
import { calendarDateOf, formatDateShort, listPtBr, plural } from "@/lib/format";
import type { JourneyPreviewDTO } from "@/shared/contracts";
import { ACTIVITY_ROLES, ROLE_LABEL } from "@/shared/enums";
import styles from "./journey-preview.module.css";

/** Resumo antes de iniciar: "14 atividades em 45 dias", divisão por papel, o que já libera e quem falta. */
export function JourneyPreview({ preview, loading, error }: { preview: JourneyPreviewDTO | undefined; loading: boolean; error: ApiError | null }) {
  if (loading && !preview) {
    return (
      <LoadingArea label="Calculando o resumo da jornada…">
        <Skeleton width="70%" height={36} />
        <Skeleton height={64} radius={6} />
      </LoadingArea>
    );
  }
  if (!preview) {
    return error ? (
      <Notice tone="warning" title="Não foi possível calcular o resumo agora">
        {error.message} Você ainda pode iniciar a jornada.
      </Notice>
    ) : null;
  }
  const first = preview.firstDueAt ? calendarDateOf(preview.firstDueAt) : null;
  const last = preview.lastDueAt ? calendarDateOf(preview.lastDueAt) : null;
  const roles = ACTIVITY_ROLES.filter((role) => (preview.byRole[role] ?? 0) > 0);
  return (
    <div className={styles.preview} aria-live="polite">
      <p className={styles.big}>
        <strong>{plural(preview.activityCount, "atividade", "atividades")}</strong> em {plural(preview.spanDays, "dia", "dias")}
      </p>
      {roles.length ? (
        <ul className={styles.roles} aria-label="Atividades por responsável">
          {roles.map((role) => (
            <li key={role} className={styles.role}>
              <Pictogram icon={ROLE_ICON[role]} size="s" />
              <span>{ROLE_LABEL[role]}</span>
              <strong className={styles.count}>{preview.byRole[role]}</strong>
            </li>
          ))}
        </ul>
      ) : null}
      <p className={styles.note}>
        {preview.releasedNow > 0
          ? `${plural(preview.releasedNow, "atividade vai", "atividades vão")} para o Bitrix24 assim que você iniciar.`
          : "Nada é liberado hoje: a primeira etapa começa mais perto da data."}
        {first && last ? ` Prazos de ${formatDateShort(first)} a ${formatDateShort(last)}.` : ""}
      </p>
      {preview.missingAssignees.length ? (
        <Notice tone="warning" title="Faltam responsáveis">
          {listPtBr(preview.missingAssignees.map((role) => ROLE_LABEL[role]))} ainda sem responsável. Escolha acima para que essas tarefas tenham dono.
        </Notice>
      ) : null}
    </div>
  );
}
