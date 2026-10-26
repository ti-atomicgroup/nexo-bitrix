"use client";

import { BadgeCheck, CircleCheckBig, ExternalLink, MessageSquareWarning, RotateCcw } from "lucide-react";
import { useState } from "react";
import { ROLE_ICON } from "@/components/lines/icons";
import { Pictogram } from "@/components/lines/pictogram";
import { Button, ButtonLink } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Chip } from "@/components/ui/chip";
import { Drawer } from "@/components/ui/drawer";
import { Notice } from "@/components/ui/notice";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { api, toApiError, type ActivityActionBody } from "@/lib/api-client";
import { formatMoment, relativeTo } from "@/lib/format";
import type { ActivityDTO, JourneyChecklistItem, JourneyDTO } from "@/shared/contracts";
import { ACTIVITY_KIND_LABEL, LEDGER_KIND_LABEL, ROLE_LABEL, VISIBILITY_LABEL } from "@/shared/enums";
import { activityTiming, kindTone } from "../labels";
import styles from "./activity-drawer.module.css";
import { activityChip } from "./journey-stages";

const DONE_SOURCE = { bitrix: "no Bitrix24", nexo: "no Nexo", link: "pelo link do colaborador" } as const;

type Busy = "complete" | "reopen" | "approve" | "nudge" | `item:${string}` | null;

export interface ActivityDrawerProps {
  journey: JourneyDTO;
  activity: ActivityDTO | null;
  today: string;
  onClose: () => void;
  onUpdated: (activity: ActivityDTO) => void;
}

/**
 * Gaveta da atividade: instruções, checklist (marca no Bitrix24), links, "Abrir no Bitrix24" e as ações
 * Marcar como feita, Reabrir, Aprovar (status 4) e Cobrar. Abre também por `?atividade=<id>`.
 */
export function ActivityDrawer({ journey, activity, today, onClose, onUpdated }: ActivityDrawerProps) {
  const toast = useToast();
  const [busy, setBusy] = useState<Busy>(null);
  // Estado local por atividade (zera sozinho quando outra atividade é aberta).
  const [nudge, setNudge] = useState({ id: "", text: "" });
  const [optimistic, setOptimistic] = useState<{ id: string; items: JourneyChecklistItem[] } | null>(null);

  const stage = activity ? journey.stages.find((item) => item.position === activity.stagePosition) : undefined;
  const checklist = activity ? (optimistic?.id === activity.id ? optimistic.items : activity.checklist) : [];
  const nudgeText = activity && nudge.id === activity.id ? nudge.text : "";
  const locked = activity?.status === "locked" || activity?.status === "cancelled";
  const canNudge = Boolean(activity?.assignee) && (activity?.status === "open" || activity?.status === "in_progress" || activity?.status === "awaiting_approval");

  const run = async (body: ActivityActionBody, busyKey: Exclude<Busy, null>, success: string) => {
    if (!activity) return;
    setBusy(busyKey);
    try {
      const updated = await api.activityAction(activity.id, body);
      setOptimistic(null);
      onUpdated(updated);
      if (body.action === "nudge") setNudge({ id: activity.id, text: "" });
      if (body.action !== "toggle_item") toast.show({ tone: "success", title: success });
    } catch (error) {
      setOptimistic(null);
      toast.show({ tone: "error", title: "Não foi possível concluir", description: toApiError(error).message });
    } finally {
      setBusy(null);
    }
  };

  const toggle = (item: JourneyChecklistItem, done: boolean) => {
    if (!activity) return;
    setOptimistic({ id: activity.id, items: checklist.map((entry) => (entry.key === item.key ? { ...entry, done } : entry)) });
    void run({ action: "toggle_item", itemKey: item.key, done }, `item:${item.key}`, "");
  };

  const doneCount = checklist.filter((item) => item.done).length;
  const chip = activity ? activityChip(activity) : null;

  return (
    <Drawer
      open={Boolean(activity)}
      onClose={onClose}
      title={activity?.title ?? "Atividade"}
      tone={kindTone(journey.summary.kind)}
      meta={
        activity ? (
          <>
            <Pictogram icon={ROLE_ICON[activity.role]} size="s" />
            {ROLE_LABEL[activity.role]}
            {activity.assignee ? ` · ${activity.assignee.name}` : " · sem responsável"}
            {stage ? ` · Etapa ${stage.name}` : ""}
          </>
        ) : null
      }
      footer={
        activity ? (
          <>
            {activity.bitrixUrl ? (
              <ButtonLink href={activity.bitrixUrl} external icon={ExternalLink}>
                Abrir no Bitrix24
              </ButtonLink>
            ) : null}
            {activity.status === "awaiting_approval" ? (
              <Button variant="primary" icon={BadgeCheck} loading={busy === "approve"} onClick={() => run({ action: "approve" }, "approve", "Atividade aprovada")}>
                Aprovar
              </Button>
            ) : null}
            {activity.status === "open" || activity.status === "in_progress" ? (
              <Button variant="primary" icon={CircleCheckBig} loading={busy === "complete"} onClick={() => run({ action: "complete" }, "complete", "Atividade marcada como feita")}>
                Marcar como feita
              </Button>
            ) : null}
            {activity.status === "done" ? (
              <Button icon={RotateCcw} loading={busy === "reopen"} onClick={() => run({ action: "reopen" }, "reopen", "Atividade reaberta")}>
                Reabrir
              </Button>
            ) : null}
          </>
        ) : null
      }
    >
      {activity && chip ? (
        <>
          <div className={styles.status}>
            <Chip tone={chip.tone}>{chip.label}</Chip>
            <span className={styles.timing}>{activityTiming(activity, today)}</span>
          </div>

          {activity.bitrixMissing ? (
            <Notice tone="warning" title="A tarefa foi apagada no Bitrix24">
              O Nexo não recria tarefas apagadas. Se ela já foi resolvida, marque como feita aqui.
            </Notice>
          ) : activity.syncState === "error" ? (
            <Notice tone="error" title="Não foi possível enviar ao Bitrix24">
              {activity.syncError ?? "O Nexo tenta de novo no próximo ciclo."}
            </Notice>
          ) : activity.syncState === "queued" || activity.syncState === "uncertain" ? (
            <Notice tone="info" title="Indo para o Bitrix24">
              A tarefa aparece no Bitrix24 no próximo ciclo, em até 1 minuto.
            </Notice>
          ) : null}

          <section className={styles.section} aria-labelledby="atividade-instrucoes">
            <h3 id="atividade-instrucoes" className={styles.heading}>
              O que fazer
            </h3>
            {activity.instructions.trim() ? <p className={styles.instructions}>{activity.instructions}</p> : <p className={styles.quiet}>Sem instruções para esta atividade.</p>}
          </section>

          {checklist.length ? (
            <section className={styles.section} aria-labelledby="atividade-checklist">
              <h3 id="atividade-checklist" className={styles.heading}>
                Checklist <span className={styles.count}>{doneCount} de {checklist.length}</span>
              </h3>
              <ul className={styles.checklist}>
                {checklist.map((item) => (
                  <li key={item.key}>
                    <Checkbox
                      label={item.text}
                      description={item.ledger ? `${LEDGER_KIND_LABEL[item.ledger.kind]}: ${item.ledger.name}. Entra no inventário da pessoa.` : undefined}
                      checked={item.done}
                      disabled={locked || busy === `item:${item.key}`}
                      onChange={(event) => toggle(item, event.target.checked)}
                    />
                  </li>
                ))}
              </ul>
              {locked ? <p className={styles.quiet}>O checklist abre quando a etapa for liberada.</p> : null}
            </section>
          ) : null}

          {activity.links.length ? (
            <section className={styles.section} aria-labelledby="atividade-links">
              <h3 id="atividade-links" className={styles.heading}>
                Links
              </h3>
              <ul className={styles.links}>
                {activity.links.map((link) => (
                  <li key={link.url}>
                    <a href={link.url} target="_blank" rel="noopener noreferrer">
                      <ExternalLink size={16} strokeWidth={2.25} aria-hidden="true" />
                      {link.label}
                      <span className="sr-only"> (abre em nova aba)</span>
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className={styles.section} aria-labelledby="atividade-detalhes">
            <h3 id="atividade-detalhes" className={styles.heading}>
              Detalhes
            </h3>
            <dl className={styles.details}>
              <div>
                <dt>Tipo</dt>
                <dd>{ACTIVITY_KIND_LABEL[activity.kind]}</dd>
              </div>
              <div>
                <dt>Prazo</dt>
                <dd>{formatMoment(activity.dueAt, today)}</dd>
              </div>
              <div>
                <dt>Quem vê</dt>
                <dd>{VISIBILITY_LABEL[activity.visibility]}</dd>
              </div>
              <div>
                <dt>Obrigatória</dt>
                <dd>{activity.required ? "Sim" : "Não"}</dd>
              </div>
              {activity.requiresApproval ? (
                <div>
                  <dt>Aprovação</dt>
                  <dd>O RH aprova antes de concluir</dd>
                </div>
              ) : null}
              {activity.doneAt ? (
                <div>
                  <dt>Feita</dt>
                  <dd>
                    {relativeTo(activity.doneAt, today)}
                    {activity.doneSource ? `, ${DONE_SOURCE[activity.doneSource]}` : ""}
                  </dd>
                </div>
              ) : null}
            </dl>
          </section>

          {canNudge && activity.assignee ? (
            <section className={styles.section} aria-labelledby="atividade-cobrar">
              <h3 id="atividade-cobrar" className={styles.heading}>
                Cobrar {activity.assignee.name}
              </h3>
              <Textarea
                label="Mensagem"
                optional
                rows={3}
                maxLength={500}
                hint="Vai como comentário na tarefa do Bitrix24, citando a pessoa."
                value={nudgeText}
                onChange={(event) => setNudge({ id: activity.id, text: event.target.value })}
              />
              <div>
                <Button
                  variant="secondary"
                  icon={MessageSquareWarning}
                  loading={busy === "nudge"}
                  onClick={() => run({ action: "nudge", message: nudgeText.trim() || undefined }, "nudge", "Cobrança enviada")}
                >
                  Cobrar
                </Button>
              </div>
            </section>
          ) : null}
        </>
      ) : null}
    </Drawer>
  );
}
