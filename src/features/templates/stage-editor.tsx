"use client";

import { ArrowDown, ArrowUp, BookOpen, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cx } from "@/lib/cx";
import type { JourneyKind, ReleaseMode } from "@/shared/enums";
import { ActivityEditor } from "./activity-editor";
import { OffsetInput } from "./offset-input";
import styles from "./stage-editor.module.css";
import { emptyActivity, type ActivityDraft, type StageDraft } from "./template-draft";

export interface StageEditorProps {
  stage: StageDraft;
  index: number;
  count: number;
  journeyKind: JourneyKind;
  errors: Record<string, string>;
  onChange: (next: StageDraft) => void;
  onMove: (delta: -1 | 1) => void;
  onRemove: () => void;
  onOpenLibrary: () => void;
  /** Atividades criadas nesta sessão começam abertas. */
  freshIds: Set<string>;
  onFresh: (uid: string) => void;
}

function move<T>(list: T[], index: number, delta: number): T[] {
  const target = index + delta;
  if (target < 0 || target >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(index, 1);
  if (item !== undefined) next.splice(target, 0, item);
  return next;
}

/** Uma etapa (estação) da trilha: nome, quando libera e as atividades. */
export function StageEditor({ stage, index, count, journeyKind, errors, onChange, onMove, onRemove, onOpenLibrary, freshIds, onFresh }: StageEditorProps) {
  const path = `stages.${index}`;
  const err = (field: string) => errors[`${path}.${field}`];
  const set = (patch: Partial<StageDraft>) => onChange({ ...stage, ...patch });
  const anchor = journeyKind === "onboarding" ? "do 1º dia" : "do último dia";
  const setActivity = (activity: ActivityDraft) => set({ activities: stage.activities.map((item) => (item.uid === activity.uid ? activity : item)) });

  return (
    <section className={cx(styles.stage, styles[journeyKind])} aria-labelledby={`etapa-${stage.uid}`}>
      <header className={styles.head}>
        <span className={styles.station} aria-hidden="true">
          {index + 1}
        </span>
        <h3 id={`etapa-${stage.uid}`} className={styles.title}>
          {stage.name.trim() || `Etapa ${index + 1}`}
        </h3>
        <div className={styles.headActions}>
          <Button size="s" variant="ghost" icon={ArrowUp} aria-label={`Subir a etapa ${index + 1}`} disabled={index === 0} onClick={() => onMove(-1)} />
          <Button size="s" variant="ghost" icon={ArrowDown} aria-label={`Descer a etapa ${index + 1}`} disabled={index === count - 1} onClick={() => onMove(1)} />
          <Button size="s" variant="ghost" icon={Trash2} aria-label={`Remover a etapa ${index + 1}`} disabled={count === 1} onClick={onRemove} />
        </div>
      </header>

      <div className={styles.fields}>
        <Field label="Nome da etapa" placeholder="Ex.: Primeira semana" value={stage.name} onChange={(event) => set({ name: event.target.value })} error={err("name")} />
        <Select
          label="Quando libera"
          value={stage.releaseMode}
          onChange={(event) => {
            const releaseMode = event.target.value as ReleaseMode;
            set({ releaseMode, releaseOffsetDays: releaseMode === "offset" ? stage.releaseOffsetDays || -5 : 0, releaseLatestOffsetDays: null });
          }}
          error={err("releaseMode")}
          options={[
            { value: "start", label: "No início da jornada" },
            { value: "offset", label: `Alguns dias antes ou depois ${anchor}` },
            { value: "after_previous", label: "Quando a etapa anterior terminar", disabled: index === 0 },
          ]}
        />
        {stage.releaseMode === "offset" ? (
          <div className={styles.wide}>
            <OffsetInput
              legend="Libera"
              days={stage.releaseOffsetDays}
              unit={stage.releaseOffsetUnit}
              anchorWord={anchor}
              onChange={(releaseOffsetDays, releaseOffsetUnit) => set({ releaseOffsetDays, releaseOffsetUnit })}
              error={err("releaseOffsetDays")}
            />
          </div>
        ) : null}
        {stage.releaseMode === "after_previous" ? (
          <div className={styles.wide}>
            <Checkbox
              label="Liberar numa data-limite mesmo que a etapa anterior não termine"
              description="Assim uma tarefa esquecida não segura o resto da jornada."
              checked={stage.releaseLatestOffsetDays !== null}
              onChange={(event) => set({ releaseLatestOffsetDays: event.target.checked ? 7 : null })}
            />
            {stage.releaseLatestOffsetDays !== null ? (
              <OffsetInput
                legend="No máximo em"
                days={stage.releaseLatestOffsetDays}
                unit={stage.releaseOffsetUnit}
                anchorWord={anchor}
                onChange={(releaseLatestOffsetDays, releaseOffsetUnit) => set({ releaseLatestOffsetDays, releaseOffsetUnit })}
                error={err("releaseLatestOffsetDays")}
              />
            ) : null}
          </div>
        ) : null}
        <Textarea label="Descrição" optional rows={2} value={stage.description} onChange={(event) => set({ description: event.target.value })} className={styles.wide} />
      </div>

      <div className={styles.activities}>
        <h4 className={styles.subtitle}>Atividades</h4>
        {err("activities") ? <p className={styles.error}>{err("activities")}</p> : null}
        {stage.activities.map((activity, activityIndex) => (
          <ActivityEditor
            key={activity.uid}
            activity={activity}
            journeyKind={journeyKind}
            path={`${path}.activities.${activityIndex}`}
            errors={errors}
            startOpen={freshIds.has(activity.uid)}
            onChange={setActivity}
            onMove={(delta) => set({ activities: move(stage.activities, activityIndex, delta) })}
            onRemove={() => set({ activities: stage.activities.filter((item) => item.uid !== activity.uid) })}
            canMoveUp={activityIndex > 0}
            canMoveDown={activityIndex < stage.activities.length - 1}
            canRemove={stage.activities.length > 1}
          />
        ))}
        <div className={styles.addRow}>
          <Button
            size="s"
            icon={Plus}
            onClick={() => {
              const activity = emptyActivity();
              onFresh(activity.uid);
              set({ activities: [...stage.activities, activity] });
            }}
          >
            Adicionar atividade
          </Button>
          <Button size="s" variant="ghost" icon={BookOpen} onClick={onOpenLibrary}>
            Inserir da biblioteca
          </Button>
        </div>
      </div>
    </section>
  );
}

export { move };
