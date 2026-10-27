"use client";

import { ArrowLeft, Ban, CircleCheckBig, ExternalLink, Pause, Play } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Button, ButtonLink } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Dialog } from "@/components/ui/dialog";
import { Notice } from "@/components/ui/notice";
import { ProgressBar } from "@/components/ui/progress-bar";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { api, toApiError, type JourneyActionBody } from "@/lib/api-client";
import { anchorLabel, anchorPhrase, firstName, formatDateMedium, formatMoment } from "@/lib/format";
import type { JourneyDTO } from "@/shared/contracts";
import { JOURNEY_KIND_LABEL, JOURNEY_STATUS_LABEL } from "@/shared/enums";
import { JOURNEY_STATUS_TONE, kindTone, profileSuffix, RISK_CHIP } from "../labels";
import styles from "./journey-header.module.css";

const REASON_LABEL = { voluntary: "Voluntária", involuntary: "Involuntária" } as const;

const DONE_TOAST: Record<JourneyActionBody["action"], { title: string; description: string }> = {
  pause: { title: "Jornada pausada", description: "Nenhuma etapa nova é liberada até você retomar." },
  resume: { title: "Jornada retomada", description: "As etapas voltam a ser liberadas no próximo ciclo." },
  cancel: { title: "Jornada cancelada", description: "O histórico continua guardado." },
  complete: { title: "Jornada concluída", description: "Boa! Tudo o que entrou, saiu." },
};

/** Cabeçalho da jornada: pessoa, tipo, data com contagem, progresso e as ações Pausar, Cancelar e Concluir. */
export function JourneyHeader({ journey, today, onChanged }: { journey: JourneyDTO; today: string; onChanged: (next: JourneyDTO) => void }) {
  const toast = useToast();
  const { summary } = journey;
  const { person, kind } = summary;
  const first = firstName(person.name);
  const [dialog, setDialog] = useState<"cancel" | "complete" | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<JourneyActionBody["action"] | null>(null);
  const open = summary.status === "active" || summary.status === "paused";
  const risk = RISK_CHIP[summary.risk];

  const run = async (body: JourneyActionBody) => {
    setBusy(body.action);
    try {
      onChanged(await api.journeyAction(summary.id, body));
      toast.show({ tone: "success", ...DONE_TOAST[body.action] });
      setDialog(null);
      setReason("");
    } catch (error) {
      toast.show({ tone: "error", title: "Não foi possível concluir a ação", description: toApiError(error).message });
    } finally {
      setBusy(null);
    }
  };

  return (
    <header className={styles.header}>
      <Link href="/pessoas" className={styles.back}>
        <ArrowLeft size={18} strokeWidth={2.25} aria-hidden="true" />
        Pessoas
      </Link>

      <div className={styles.identity}>
        <Avatar name={person.name} size="l" tone={kindTone(kind)} />
        <div className={styles.who}>
          <h1 className={styles.name}>{person.name}</h1>
          {person.position || person.department ? <p className={styles.role}>{[person.position, person.department].filter(Boolean).join(" · ")}</p> : null}
          <div className={styles.chips}>
            <Chip tone={kindTone(kind)}>{JOURNEY_KIND_LABEL[kind]}</Chip>
            <Chip tone={JOURNEY_STATUS_TONE[summary.status]}>{JOURNEY_STATUS_LABEL[summary.status]}</Chip>
            {summary.status === "active" ? <Chip tone={risk.tone}>{risk.label}</Chip> : null}
          </div>
          {summary.status === "active" && summary.risk !== "ok" && summary.riskReason ? <p className={styles.riskReason}>{summary.riskReason}</p> : null}
        </div>
        {open ? (
          <div className={styles.actions}>
            {summary.status === "active" ? (
              <Button icon={Pause} loading={busy === "pause"} onClick={() => run({ action: "pause" })}>
                Pausar
              </Button>
            ) : (
              <Button icon={Play} loading={busy === "resume"} onClick={() => run({ action: "resume" })}>
                Retomar
              </Button>
            )}
            <Button variant="danger" icon={Ban} onClick={() => setDialog("cancel")}>
              Cancelar
            </Button>
            <Button variant="forest" icon={CircleCheckBig} onClick={() => setDialog("complete")}>
              Concluir
            </Button>
          </div>
        ) : null}
      </div>

      <dl className={styles.facts}>
        <div className={styles.fact}>
          <dt>{anchorLabel(kind)}</dt>
          <dd className={styles.value}>{formatDateMedium(summary.anchorDate, today)}</dd>
          <dd className={styles.sub}>{anchorPhrase(kind, summary.anchorDate, today)}</dd>
        </div>
        <div className={styles.fact}>
          <dt>Progresso</dt>
          <dd className={styles.value}>
            {summary.progress.done} de {summary.progress.total}
          </dd>
          <dd className={styles.bar}>
            <ProgressBar value={summary.progress.percent} tone={kindTone(kind)} label={`Progresso da jornada de ${person.name}`} />
          </dd>
        </div>
        <div className={styles.fact}>
          <dt>Trilha</dt>
          <dd className={styles.text}>{summary.templateName}</dd>
          {profileSuffix(summary.templateName, summary.profile) ? <dd className={styles.sub}>{summary.profile}</dd> : null}
        </div>
        <div className={styles.fact}>
          <dt>Próxima parada</dt>
          <dd className={styles.text}>{summary.nextStop ? summary.nextStop.label : "Nenhuma"}</dd>
          {summary.nextStop ? <dd className={styles.sub}>{formatMoment(summary.nextStop.at, today)}</dd> : null}
        </div>
        {journey.offboardingReason ? (
          <div className={styles.fact}>
            <dt>Motivo da saída</dt>
            <dd className={styles.text}>{REASON_LABEL[journey.offboardingReason]}</dd>
            <dd className={styles.sub}>Só o RH vê</dd>
          </div>
        ) : null}
      </dl>

      {journey.source.type === "trigger" || journey.projectUrl ? (
        <div className={styles.links}>
          {journey.source.type === "trigger" ? (
            <span className={styles.source}>
              Iniciada pelo CRM{journey.source.label ? `: ${journey.source.label}` : ""}
              {journey.source.crmUrl ? (
                <ButtonLink href={journey.source.crmUrl} external variant="ghost" size="s" icon={ExternalLink}>
                  Abrir no CRM
                </ButtonLink>
              ) : null}
            </span>
          ) : null}
          {journey.projectUrl ? (
            <ButtonLink href={journey.projectUrl} external variant="ghost" size="s" icon={ExternalLink}>
              Abrir o projeto no Bitrix24
            </ButtonLink>
          ) : null}
        </div>
      ) : null}

      <Dialog
        open={dialog === "cancel"}
        onClose={() => setDialog(null)}
        tone="danger"
        title={`Cancelar a jornada de ${first}?`}
        description="A jornada sai das listas de acompanhamento e nenhuma etapa nova é liberada. O histórico continua guardado."
        actions={
          <>
            <Button variant="secondary" onClick={() => setDialog(null)}>
              Voltar
            </Button>
            <Button variant="danger" icon={Ban} loading={busy === "cancel"} onClick={() => run({ action: "cancel", reason: reason.trim() || undefined })}>
              Cancelar jornada
            </Button>
          </>
        }
      >
        <Textarea
          label="Motivo"
          optional
          hint="Fica no histórico. Nunca aparece para o colaborador."
          rows={3}
          maxLength={500}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </Dialog>

      <Dialog
        open={dialog === "complete"}
        onClose={() => setDialog(null)}
        title={`Concluir a jornada de ${first}?`}
        description={
          journey.completion.ok
            ? "As atividades obrigatórias e o inventário estão em ordem."
            : "Ainda há pendências que impedem a conclusão."
        }
        actions={
          journey.completion.ok ? (
            <>
              <Button variant="secondary" onClick={() => setDialog(null)}>
                Voltar
              </Button>
              <Button variant="primary" icon={CircleCheckBig} loading={busy === "complete"} onClick={() => run({ action: "complete" })}>
                Concluir jornada
              </Button>
            </>
          ) : (
            <Button variant="forest" onClick={() => setDialog(null)}>
              Entendi
            </Button>
          )
        }
      >
        {journey.completion.ok ? null : (
          <Notice tone="warning" title="Resolva antes de concluir">
            <ul className={styles.blockers}>
              {journey.completion.blockers.map((blocker) => (
                <li key={blocker}>{blocker}</li>
              ))}
            </ul>
          </Notice>
        )}
      </Dialog>
    </header>
  );
}
