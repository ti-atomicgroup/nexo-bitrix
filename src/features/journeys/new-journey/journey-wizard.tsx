"use client";

import { ArrowLeft, ArrowRight, ExternalLink, LogIn, LogOut, Radar, TrainFront } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { BoardingPass } from "@/components/lines/boarding-pass";
import { Button, ButtonLink } from "@/components/ui/button";
import { ChoiceCards } from "@/components/ui/choice-cards";
import { Field } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { Panel } from "@/components/ui/panel";
import { Segmented } from "@/components/ui/segmented";
import { LoadingArea, Skeleton } from "@/components/ui/skeleton";
import { Stepper } from "@/components/ui/stepper";
import { useToast } from "@/components/ui/toast";
import { countdownFor } from "@/features/collaborator/countdown";
import { PersonPicker } from "@/features/people/person-picker";
import { api, toApiError } from "@/lib/api-client";
import { daysBetween, firstName, formatDateMedium, formatSince, plural, todayIn } from "@/lib/format";
import { newRequestId } from "@/lib/request-id";
import { useApi, type ApiState } from "@/lib/use-api";
import { useNow } from "@/lib/use-session";
import type { DetectionDTO, TemplateSummaryDTO, UserRef } from "@/shared/contracts";
import { JOURNEY_KIND_LABEL, type ParticipantRole } from "@/shared/enums";
import { createJourneyInput } from "@/shared/schemas";
import { spanText } from "../labels";
import { JourneyPreview } from "./journey-preview";
import styles from "./journey-wizard.module.css";
import { buildInput, personName, validateStep, type WizardErrors, type WizardState } from "./wizard-state";

const STEPS = ["Quem", "Trilha e data", "Participantes"];

const PARTICIPANTS: Array<{ role: ParticipantRole; label: string; hint: string; onboardingOnly?: boolean }> = [
  { role: "gestor", label: "Gestor", hint: "Entra como observador em todas as tarefas da jornada." },
  { role: "buddy", label: "Buddy", hint: "Acompanha a pessoa nas primeiras semanas.", onboardingOnly: true },
  { role: "ti", label: "TI", hint: "Cuida de acessos e equipamentos." },
  { role: "rh", label: "RH", hint: "Recebe as tarefas do RH e acompanha a jornada." },
];

export interface JourneyWizardProps {
  initial: WizardState;
  templates: ApiState<TemplateSummaryDTO[]>;
  detection: DetectionDTO | null;
  companyName: string | null;
}

/** Assistente de nova jornada: quem → trilha e data → participantes e resumo. */
export function JourneyWizard({ initial, templates, detection, companyName }: JourneyWizardProps) {
  const router = useRouter();
  const toast = useToast();
  const now = useNow(60_000);
  const today = todayIn(undefined, now === null ? undefined : new Date(now));
  const [requestId] = useState(newRequestId);
  const [state, setState] = useState<WizardState>(initial);
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<WizardErrors>({});
  const [pending, setPending] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);

  // Ao trocar de passo, o foco vai para o título do passo (leitores de tela anunciam onde se está).
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [step]);

  const update = (patch: Partial<WizardState>) => setState((current) => ({ ...current, ...patch }));
  const input = buildInput(state, requestId);
  const previewKey = step === 2 && input ? JSON.stringify(input) : "";
  const preview = useApi((signal) => (input ? api.journeyPreview(input, { signal }) : Promise.reject(new Error("Faltam dados."))), [previewKey], {
    enabled: previewKey !== "",
    revalidateOnFocus: false,
  });

  const kindTemplates = (templates.data ?? []).filter((template) => !template.archived && template.kind === state.kind);
  const name = personName(state);
  const excludeIds = state.bitrixPerson ? [state.bitrixPerson.bitrixUserId] : [];

  const next = () => {
    const found = validateStep(step, state);
    setErrors(found);
    if (Object.keys(found).length) {
      window.requestAnimationFrame(() => document.querySelector<HTMLElement>("[aria-invalid='true'], [data-invalid='true'] input")?.focus());
      return;
    }
    setStep((value) => Math.min(value + 1, STEPS.length - 1));
  };

  const submit = async () => {
    for (const index of [0, 1]) {
      const found = validateStep(index, state);
      if (Object.keys(found).length) {
        setErrors(found);
        setStep(index);
        return;
      }
    }
    const body = buildInput(state, requestId);
    const parsed = body ? createJourneyInput.safeParse(body) : null;
    if (!body || !parsed || !parsed.success) {
      const message = parsed && !parsed.success ? parsed.error.issues[0]?.message : undefined;
      setErrors({ form: message ?? "Confira os dados da jornada." });
      return;
    }
    setErrors({});
    setPending(true);
    try {
      const { id } = await api.journeyCreate(body);
      toast.show({ tone: "success", title: "Jornada iniciada", description: "As atividades liberadas vão para o Bitrix24 em instantes." });
      router.push(`/pessoas/${encodeURIComponent(id)}`);
    } catch (error) {
      setErrors({ form: toApiError(error).message });
      setPending(false);
    }
  };

  const anchorLabel = state.kind === "offboarding" ? "Último dia" : "1º dia";
  const daysUntil = state.anchorDate ? daysBetween(today, state.anchorDate) : null;

  return (
    <div className={styles.layout}>
      <div className={styles.main}>
        {detection ? (
          <Notice
            tone="info"
            icon={Radar}
            title={`Detectado no Bitrix24: ${detection.title}`}
            action={
              detection.crmUrl ? (
                <ButtonLink href={detection.crmUrl} external size="s" variant="secondary" icon={ExternalLink}>
                  Abrir no CRM
                </ButtonLink>
              ) : undefined
            }
          >
            {detection.triggerName}
            {now !== null ? `, ${formatSince(detection.detectedAt, now)}` : ""}. Os dados abaixo vieram do CRM; confira antes de iniciar.
          </Notice>
        ) : null}

        <Stepper steps={STEPS} current={step} label="Passos da nova jornada" />

        <form
          className={styles.form}
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            if (step < STEPS.length - 1) next();
            else void submit();
          }}
        >
          {step === 0 ? (
            <section className={styles.step} aria-labelledby="passo-titulo">
              <h2 id="passo-titulo" ref={headingRef} tabIndex={-1} className={styles.stepTitle}>
                Quem vai percorrer esta linha?
              </h2>
              <ChoiceCards
                legend="Tipo de jornada"
                value={state.kind}
                onChange={(kind) => update({ kind, personMode: kind === "offboarding" ? "bitrix" : state.personMode, templateId: null, reason: null })}
                error={errors.kind}
                options={[
                  { value: "onboarding", title: "Entrada", description: "Alguém vai chegar à empresa.", icon: LogIn, tone: "arrival" },
                  { value: "offboarding", title: "Saída", description: "Alguém vai deixar a empresa.", icon: LogOut, tone: "departure" },
                ]}
              />
              {state.kind === "onboarding" ? (
                <Segmented
                  legend="A pessoa já tem conta no Bitrix24?"
                  value={state.personMode}
                  onChange={(personMode) => update({ personMode })}
                  options={[
                    { value: "bitrix", label: "Já tem conta" },
                    { value: "manual", label: "Ainda não tem" },
                  ]}
                />
              ) : null}
              {state.kind && (state.personMode === "bitrix" || state.kind === "offboarding") ? (
                <div data-invalid={errors.person ? "true" : undefined}>
                  <PersonPicker
                    label={state.kind === "offboarding" ? "Quem vai sair" : "Quem vai chegar"}
                    value={state.bitrixPerson}
                    onChange={(bitrixPerson) => update({ bitrixPerson })}
                    error={errors.person}
                  />
                </div>
              ) : null}
              {state.kind === "onboarding" && state.personMode === "manual" ? (
                <div className={styles.columns}>
                  <Field
                    label="Nome completo"
                    autoComplete="off"
                    value={state.manualName}
                    onChange={(event) => update({ manualName: event.target.value })}
                    error={errors.manualName}
                  />
                  <Field
                    label="E-mail pessoal"
                    type="email"
                    optional
                    autoComplete="off"
                    hint="Para enviar o link de boas-vindas antes do primeiro dia."
                    value={state.manualEmail}
                    onChange={(event) => update({ manualEmail: event.target.value })}
                    error={errors.manualEmail}
                  />
                  <p className={styles.note}>Quando a conta no Bitrix24 existir, vincule-a na página da jornada para as tarefas da pessoa serem criadas.</p>
                </div>
              ) : null}
            </section>
          ) : null}

          {step === 1 ? (
            <section className={styles.step} aria-labelledby="passo-titulo">
              <h2 id="passo-titulo" ref={headingRef} tabIndex={-1} className={styles.stepTitle}>
                Qual trilha e quando?
              </h2>
              {templates.loading ? (
                <LoadingArea label="Carregando as trilhas…">
                  <Skeleton height={120} radius={6} />
                </LoadingArea>
              ) : templates.error ? (
                <Notice tone="error" title="Não foi possível carregar as trilhas" action={<Button size="s" onClick={templates.reload}>Tentar de novo</Button>}>
                  {templates.error.message}
                </Notice>
              ) : kindTemplates.length === 0 ? (
                <Notice tone="warning" title={`Nenhuma trilha de ${state.kind === "offboarding" ? "saída" : "entrada"} ainda`} action={<ButtonLink href="/trilhas/nova" size="s">Criar trilha</ButtonLink>}>
                  Crie uma trilha em Trilhas e volte para iniciar a jornada.
                </Notice>
              ) : (
                <div data-invalid={errors.templateId ? "true" : undefined}>
                  <ChoiceCards
                    legend="Trilha"
                    value={state.templateId}
                    onChange={(templateId) => update({ templateId })}
                    error={errors.templateId}
                    minWidth={260}
                    options={kindTemplates.map((template) => ({
                      value: template.id,
                      title: template.name,
                      description: [template.profile, template.description].filter(Boolean).join(" · ") || undefined,
                      tone: template.kind === "onboarding" ? "arrival" : "departure",
                      meta: `${plural(template.activityCount, "atividade", "atividades")} em ${plural(template.stageCount, "etapa", "etapas")}, ${spanText(template.span)}`,
                    }))}
                  />
                </div>
              )}
              <div className={styles.columns}>
                <Field
                  label={anchorLabel}
                  type="date"
                  value={state.anchorDate}
                  onChange={(event) => update({ anchorDate: event.target.value })}
                  error={errors.anchorDate}
                  hint={
                    daysUntil !== null && daysUntil < 0
                      ? "Essa data já passou. Confira antes de continuar."
                      : state.kind === "offboarding"
                        ? "O último dia de trabalho na empresa."
                        : "O dia em que a pessoa começa."
                  }
                />
              </div>
              {state.kind === "offboarding" ? (
                <div data-invalid={errors.reason ? "true" : undefined}>
                  <ChoiceCards
                    legend="Motivo da saída"
                    hint="Fica só com o RH. Nunca aparece para o colaborador."
                    value={state.reason}
                    onChange={(reason) => update({ reason })}
                    error={errors.reason}
                    options={[
                      { value: "voluntary", title: "Voluntária", description: "A pessoa pediu para sair." },
                      { value: "involuntary", title: "Involuntária", description: "A empresa encerrou o contrato." },
                    ]}
                  />
                </div>
              ) : null}
            </section>
          ) : null}

          {step === 2 ? (
            <section className={styles.step} aria-labelledby="passo-titulo">
              <h2 id="passo-titulo" ref={headingRef} tabIndex={-1} className={styles.stepTitle}>
                Quem participa?
              </h2>
              <p className={styles.lead}>Os padrões vêm de Ajustes. Troque aqui só para esta jornada.</p>
              <div className={styles.columns}>
                {PARTICIPANTS.filter((item) => !item.onboardingOnly || state.kind === "onboarding").map((item) => (
                  <PersonPicker
                    key={item.role}
                    label={item.label}
                    hint={item.hint}
                    optional
                    value={state.participants[item.role] ?? null}
                    excludeIds={excludeIds}
                    onChange={(ref: UserRef | null) => update({ participants: { ...state.participants, [item.role]: ref } })}
                  />
                ))}
              </div>
              <div className={styles.summaryBox}>
                <h3 className={styles.summaryTitle}>Resumo</h3>
                <JourneyPreview preview={preview.data} loading={preview.loading} error={preview.error} />
              </div>
            </section>
          ) : null}

          {errors.form ? (
            <Notice tone="error" role="alert" title="Não foi possível iniciar a jornada">
              {errors.form}
            </Notice>
          ) : null}

          <div className={styles.nav}>
            {step > 0 ? (
              <Button variant="secondary" icon={ArrowLeft} onClick={() => setStep((value) => value - 1)} disabled={pending}>
                Voltar
              </Button>
            ) : (
              <ButtonLink href="/pessoas" variant="ghost">
                Cancelar
              </ButtonLink>
            )}
            {step < STEPS.length - 1 ? (
              <Button type="submit" variant="primary" iconAfter={ArrowRight}>
                Continuar
              </Button>
            ) : (
              <Button type="submit" variant="primary" icon={TrainFront} loading={pending}>
                Iniciar jornada
              </Button>
            )}
          </div>
        </form>
      </div>

      <aside className={styles.aside} aria-label="Resumo da jornada">
        <Panel title="Resumo" headingLevel={2}>
          <dl className={styles.facts}>
            <div>
              <dt>Tipo</dt>
              <dd>{state.kind ? JOURNEY_KIND_LABEL[state.kind] : "A escolher"}</dd>
            </div>
            <div>
              <dt>Pessoa</dt>
              <dd>{name ?? "A escolher"}</dd>
            </div>
            <div>
              <dt>Trilha</dt>
              <dd>{kindTemplates.find((template) => template.id === state.templateId)?.name ?? "A escolher"}</dd>
            </div>
            <div>
              <dt>{anchorLabel}</dt>
              <dd>{state.anchorDate ? formatDateMedium(state.anchorDate, today) : "A escolher"}</dd>
            </div>
          </dl>
        </Panel>
        {state.kind && name && state.anchorDate && daysUntil !== null ? (
          <div className={styles.passPreview}>
            <p className={styles.passLabel}>Como {firstName(name)} vai ver no link pessoal</p>
            <BoardingPass
              kind={state.kind}
              title={state.kind === "onboarding" ? "Cartão de embarque" : "Cartão de saída"}
              greeting={state.kind === "onboarding" ? "Boas-vindas," : "Até breve,"}
              name={firstName(name)}
              fields={
                state.kind === "onboarding"
                  ? [
                      { label: "Embarque", value: formatDateMedium(state.anchorDate, today) },
                      { label: "Destino", value: companyName ?? "Sua empresa" },
                      { label: "Com você", value: state.participants.gestor?.name ?? "A definir" },
                      { label: "Seu buddy", value: state.participants.buddy?.name ?? "A definir" },
                    ]
                  : [
                      { label: "Último dia", value: formatDateMedium(state.anchorDate, today) },
                      { label: "Empresa", value: companyName ?? "Sua empresa" },
                      { label: "Seu gestor", value: state.participants.gestor?.name ?? "A definir" },
                      { label: "Contato no RH", value: state.participants.rh?.name ?? "A definir" },
                    ]
              }
              countdown={countdownFor(state.kind, daysUntil)}
            />
          </div>
        ) : null}
      </aside>
    </div>
  );
}
