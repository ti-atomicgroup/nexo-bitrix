"use client";

import { ArrowDown, ArrowUp, ChevronDown, Link2, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { ROLE_ICON } from "@/components/lines/icons";
import { Pictogram } from "@/components/lines/pictogram";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cx } from "@/lib/cx";
import { plural } from "@/lib/format";
import {
  ACTIVITY_KIND_LABEL,
  ACTIVITY_KINDS,
  ACTIVITY_ROLES,
  ROLE_LABEL,
  VISIBILITIES,
  VISIBILITY_LABEL,
  type ActivityKind,
  type ActivityRole,
  type JourneyKind,
  type LedgerKind,
  type Visibility,
} from "@/shared/enums";
import styles from "./activity-editor.module.css";
import { OffsetInput } from "./offset-input";
import { uid, type ActivityDraft } from "./template-draft";

export interface ActivityEditorProps {
  activity: ActivityDraft;
  journeyKind: JourneyKind;
  /** Caminho do erro no esquema (ex.: "stages.0.activities.2"). */
  path: string;
  errors: Record<string, string>;
  onChange: (next: ActivityDraft) => void;
  onMove: (delta: -1 | 1) => void;
  onRemove: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  canRemove: boolean;
  startOpen?: boolean;
}

function offsetText(days: number, unit: ActivityDraft["dueOffsetUnit"], anchor: string): string {
  if (days === 0) return `no ${anchor}`;
  const amount = plural(Math.abs(days), unit === "business" ? "dia útil" : "dia corrido", unit === "business" ? "dias úteis" : "dias corridos");
  return `${amount} ${days < 0 ? "antes" : "depois"} do ${anchor}`;
}

/** Uma atividade da trilha: resumo dobrável e o formulário completo (prazo, quem faz, checklist e links). */
export function ActivityEditor({ activity, journeyKind, path, errors, onChange, onMove, onRemove, canMoveUp, canMoveDown, canRemove, startOpen = false }: ActivityEditorProps) {
  const [open, setOpen] = useState(startOpen);
  const err = (field: string) => errors[`${path}.${field}`];
  const hasErrors = Object.keys(errors).some((key) => key === path || key.startsWith(`${path}.`));
  const expanded = open || hasErrors;
  const anchor = journeyKind === "onboarding" ? "1º dia" : "último dia";
  const set = (patch: Partial<ActivityDraft>) => onChange({ ...activity, ...patch });
  const bodyId = `atividade-${activity.uid}`;

  return (
    <div className={cx(styles.activity, hasErrors && styles.invalid)}>
      <div className={styles.summary}>
        <Pictogram icon={ROLE_ICON[activity.role]} size="s" />
        <div className={styles.summaryText}>
          <p className={styles.summaryTitle}>{activity.title.trim() || "Atividade sem título"}</p>
          <p className={styles.summaryMeta}>
            {ROLE_LABEL[activity.role]} · {offsetText(activity.dueOffsetDays, activity.dueOffsetUnit, anchor)}
            {activity.checklist.length ? ` · ${plural(activity.checklist.length, "item", "itens")} no checklist` : ""}
            {hasErrors ? " · tem campos para corrigir" : ""}
          </p>
        </div>
        <Button size="s" variant="ghost" iconAfter={ChevronDown} aria-expanded={expanded} aria-controls={bodyId} onClick={() => setOpen(!expanded)} className={cx(styles.toggle, expanded && styles.toggleOpen)}>
          {expanded ? "Fechar" : "Editar"}
          <span className="sr-only"> {activity.title || "atividade"}</span>
        </Button>
      </div>

      {expanded ? (
        <div id={bodyId} className={styles.body}>
          <div className={styles.grid}>
            <Field label="Título" value={activity.title} onChange={(event) => set({ title: event.target.value })} error={err("title")} className={styles.wide} />
            <Select
              label="Quem faz"
              value={activity.role}
              onChange={(event) => set({ role: event.target.value as ActivityRole })}
              options={ACTIVITY_ROLES.map((role) => ({ value: role, label: ROLE_LABEL[role] }))}
            />
            <Select
              label="Tipo"
              value={activity.kind}
              onChange={(event) => set({ kind: event.target.value as ActivityKind })}
              options={ACTIVITY_KINDS.map((kind) => ({ value: kind, label: ACTIVITY_KIND_LABEL[kind] }))}
            />
            <div className={styles.wide}>
              <OffsetInput
                legend="Prazo"
                days={activity.dueOffsetDays}
                unit={activity.dueOffsetUnit}
                anchorWord={`do ${anchor}`}
                onChange={(dueOffsetDays, dueOffsetUnit) => set({ dueOffsetDays, dueOffsetUnit })}
                error={err("dueOffsetDays")}
              />
            </div>
            <Field label="Horário do prazo" type="time" value={activity.dueTime} onChange={(event) => set({ dueTime: event.target.value })} error={err("dueTime")} />
            <Select
              label="Quem vê"
              value={activity.visibility}
              onChange={(event) => set({ visibility: event.target.value as Visibility })}
              options={VISIBILITIES.map((visibility) => ({ value: visibility, label: VISIBILITY_LABEL[visibility] }))}
            />
          </div>

          <div className={styles.flags}>
            <Checkbox label="Obrigatória" description="Precisa estar feita para concluir a jornada." checked={activity.required} onChange={(event) => set({ required: event.target.checked })} />
            <Checkbox
              label="Exige aprovação do RH"
              description="No Bitrix24 a tarefa fica aguardando aprovação antes de concluir."
              checked={activity.requiresApproval}
              onChange={(event) => set({ requiresApproval: event.target.checked })}
            />
            {journeyKind === "offboarding" ? (
              <Checkbox
                label="Recebe a lista Revogar e recolher"
                description="O checklist desta tarefa vira tudo o que a pessoa ainda tem de acessos e equipamentos."
                checked={activity.ledgerRole === "revoke_and_collect"}
                onChange={(event) => set({ ledgerRole: event.target.checked ? "revoke_and_collect" : null })}
              />
            ) : null}
          </div>

          <Textarea
            label="Instruções"
            optional
            rows={3}
            hint="Vão para a descrição da tarefa no Bitrix24."
            value={activity.instructions}
            onChange={(event) => set({ instructions: event.target.value })}
            error={err("instructions")}
          />

          <fieldset className={styles.list}>
            <legend className={styles.listLegend}>Checklist</legend>
            {activity.checklist.length ? null : <p className={styles.quiet}>Sem itens. Itens marcados como acesso ou equipamento entram no inventário da pessoa.</p>}
            {err("checklist") ? <p className={styles.error}>{err("checklist")}</p> : null}
            {activity.checklist.map((item, index) => {
              const itemPath = `checklist.${index}`;
              const update = (patch: Partial<typeof item>) => set({ checklist: activity.checklist.map((entry) => (entry.uid === item.uid ? { ...entry, ...patch } : entry)) });
              return (
                <div key={item.uid} className={styles.item}>
                  <Field label={`Item ${index + 1}`} value={item.text} onChange={(event) => update({ text: event.target.value })} error={err(`${itemPath}.text`)} className={styles.itemText} />
                  <Select
                    label="Inventário"
                    value={item.ledger?.kind ?? ""}
                    onChange={(event) => {
                      const kind = event.target.value as LedgerKind | "";
                      update({ ledger: kind ? { kind, name: item.ledger?.name || item.text } : null });
                    }}
                    options={[
                      { value: "", label: "Não entra" },
                      { value: "access", label: "Acesso" },
                      { value: "equipment", label: "Equipamento" },
                    ]}
                  />
                  {item.ledger ? (
                    <Field
                      label="Nome no inventário"
                      value={item.ledger.name}
                      onChange={(event) => update({ ledger: item.ledger ? { ...item.ledger, name: event.target.value } : null })}
                      error={err(`${itemPath}.ledger.name`)}
                    />
                  ) : null}
                  <Button
                    variant="ghost"
                    icon={Trash2}
                    aria-label={`Remover o item ${index + 1} do checklist`}
                    onClick={() => set({ checklist: activity.checklist.filter((entry) => entry.uid !== item.uid) })}
                    className={styles.remove}
                  />
                </div>
              );
            })}
            <div>
              <Button size="s" icon={Plus} onClick={() => set({ checklist: [...activity.checklist, { uid: uid(), key: "", text: "", ledger: null }] })}>
                Adicionar item
              </Button>
            </div>
          </fieldset>

          <fieldset className={styles.list}>
            <legend className={styles.listLegend}>Links</legend>
            {activity.links.map((link, index) => {
              const update = (patch: Partial<typeof link>) => set({ links: activity.links.map((entry) => (entry.uid === link.uid ? { ...entry, ...patch } : entry)) });
              return (
                <div key={link.uid} className={styles.item}>
                  <Field label={`Nome do link ${index + 1}`} value={link.label} onChange={(event) => update({ label: event.target.value })} error={err(`links.${index}.label`)} />
                  <Field
                    label="Endereço"
                    type="url"
                    placeholder="https://"
                    value={link.url}
                    onChange={(event) => update({ url: event.target.value })}
                    error={err(`links.${index}.url`)}
                    className={styles.itemText}
                  />
                  <Button variant="ghost" icon={Trash2} aria-label={`Remover o link ${index + 1}`} onClick={() => set({ links: activity.links.filter((entry) => entry.uid !== link.uid) })} className={styles.remove} />
                </div>
              );
            })}
            <div>
              <Button size="s" icon={Link2} onClick={() => set({ links: [...activity.links, { uid: uid(), label: "", url: "" }] })}>
                Adicionar link
              </Button>
            </div>
          </fieldset>

          <div className={styles.actions}>
            <Button size="s" variant="ghost" icon={ArrowUp} disabled={!canMoveUp} onClick={() => onMove(-1)}>
              Subir
            </Button>
            <Button size="s" variant="ghost" icon={ArrowDown} disabled={!canMoveDown} onClick={() => onMove(1)}>
              Descer
            </Button>
            <Button size="s" variant="danger" icon={Trash2} disabled={!canRemove} onClick={onRemove}>
              Remover atividade
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
