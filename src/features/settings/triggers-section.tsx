"use client";

import { Plus, Radar, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Chip } from "@/components/ui/chip";
import { Field } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { Panel } from "@/components/ui/panel";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import { LoadingArea, Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { api, toApiError, type TriggerBody } from "@/lib/api-client";
import { formatSince } from "@/lib/format";
import { fieldErrors } from "@/lib/form-errors";
import { useApi } from "@/lib/use-api";
import { useNow } from "@/lib/use-session";
import type { TemplateSummaryDTO, TriggerDTO } from "@/shared/contracts";
import { JOURNEY_KIND_LABEL, type JourneyKind } from "@/shared/enums";
import { triggerInput } from "@/shared/schemas";
import styles from "./settings-section.module.css";

function bodyFrom(trigger: TriggerDTO, enabled: boolean): TriggerBody {
  return {
    name: trigger.name,
    journeyKind: trigger.journeyKind,
    entityTypeId: trigger.entityTypeId,
    categoryId: trigger.categoryId,
    stageId: trigger.stageId,
    templateId: trigger.templateId,
    fieldMap: trigger.fieldMap,
    enabled,
  };
}

function TriggerForm({ templates, onCreated, onCancel }: { templates: TemplateSummaryDTO[]; onCreated: () => void; onCancel: () => void }) {
  const toast = useToast();
  const sources = useApi((signal) => api.crmSources({ signal }), [], { revalidateOnFocus: false });
  const [name, setName] = useState("");
  const [kind, setKind] = useState<JourneyKind>("onboarding");
  const [entity, setEntity] = useState("");
  const [category, setCategory] = useState("");
  const [stage, setStage] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [fields, setFields] = useState({ date: "", name: "", email: "", bitrixUser: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);

  const source = sources.data?.find((item) => String(item.entityTypeId) === entity);
  const categories = source?.categories ?? [];
  const chosenCategory = categories.length === 1 ? categories[0] : categories.find((item) => String(item.id) === category);
  const stages = chosenCategory?.stages ?? [];
  const kindTemplates = templates.filter((template) => template.kind === kind && !template.archived);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const body: TriggerBody = {
      name,
      journeyKind: kind,
      entityTypeId: Number(entity) || 0,
      categoryId: chosenCategory?.id ?? null,
      stageId: stage,
      templateId,
      fieldMap: Object.fromEntries(Object.entries(fields).filter(([, value]) => value)),
      enabled: true,
    };
    const parsed = triggerInput.safeParse(body);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setPending(true);
    try {
      await api.triggerCreate(body);
      toast.show({ tone: "success", title: "Automação criada", description: "Em até 1 minuto o Nexo começa a observar a etapa escolhida." });
      onCreated();
    } catch (caught) {
      setErrors({ form: toApiError(caught).message });
      setPending(false);
    }
  };

  if (sources.loading) {
    return (
      <LoadingArea label="Lendo os funis do CRM…">
        <Skeleton height={160} radius={6} />
      </LoadingArea>
    );
  }
  if (sources.error) {
    return (
      <Notice tone="error" title="Não foi possível ler o CRM" action={<Button size="s" onClick={sources.reload}>Tentar de novo</Button>}>
        {sources.error.message}
      </Notice>
    );
  }
  const fieldOptions = (source?.fields ?? []).map((field) => ({ value: field.id, label: field.name }));

  return (
    <form className={styles.box} onSubmit={submit} noValidate>
      <h3 className={styles.subtitle}>Nova automação</h3>
      <div className={styles.fields}>
        <Field label="Nome" placeholder="Ex.: Contratados no recrutamento" value={name} onChange={(event) => setName(event.target.value)} error={errors.name} />
        <Segmented
          legend="Inicia"
          value={kind}
          onChange={(value) => {
            setKind(value);
            setTemplateId("");
          }}
          options={[
            { value: "onboarding", label: "Uma entrada" },
            { value: "offboarding", label: "Uma saída" },
          ]}
        />
        <Select
          label="Onde observar"
          placeholder="Escolha lead, negócio ou processo"
          value={entity}
          onChange={(event) => {
            setEntity(event.target.value);
            setCategory("");
            setStage("");
          }}
          error={errors.entityTypeId}
          options={(sources.data ?? []).map((item) => ({ value: String(item.entityTypeId), label: item.name }))}
        />
        {categories.length > 1 ? (
          <Select
            label="Funil"
            placeholder="Escolha o funil"
            value={category}
            onChange={(event) => {
              setCategory(event.target.value);
              setStage("");
            }}
            options={categories.map((item) => ({ value: String(item.id), label: item.name }))}
          />
        ) : null}
        <Select
          label="Etapa que dispara"
          placeholder={chosenCategory ? "Escolha a etapa" : "Escolha primeiro onde observar"}
          value={stage}
          onChange={(event) => setStage(event.target.value)}
          error={errors.stageId}
          disabled={!chosenCategory}
          options={stages.map((item) => ({ value: item.id, label: item.name }))}
        />
        <Select
          label="Trilha sugerida"
          placeholder="Escolha a trilha"
          value={templateId}
          onChange={(event) => setTemplateId(event.target.value)}
          error={errors.templateId}
          options={kindTemplates.map((template) => ({ value: template.id, label: template.name }))}
        />
      </div>
      {source ? (
        <fieldset className={styles.box}>
          <legend className={styles.subtitle}>Campos que pré-preenchem a jornada (opcional)</legend>
          <div className={styles.fields}>
            {(
              [
                ["date", kind === "onboarding" ? "Data do 1º dia" : "Data do último dia"],
                ["name", "Nome da pessoa"],
                ["email", "E-mail"],
                ["bitrixUser", "Usuário do Bitrix24"],
              ] as const
            ).map(([key, label]) => (
              <Select key={key} label={label} placeholder="Não usar" value={fields[key]} onChange={(event) => setFields({ ...fields, [key]: event.target.value })} options={fieldOptions} />
            ))}
          </div>
        </fieldset>
      ) : null}
      {errors.form ? (
        <p className={styles.error} role="alert">
          {errors.form}
        </p>
      ) : null}
      <div className={styles.actions}>
        <Button type="submit" variant="forest" icon={Plus} loading={pending}>
          Criar automação
        </Button>
        <Button variant="ghost" onClick={onCancel} disabled={pending}>
          Voltar
        </Button>
      </div>
    </form>
  );
}

/** Automações "Detectado no Bitrix24": gatilhos de CRM que viram linhas em Hoje com o assistente pronto. */
export function TriggersSection({ isAdmin }: { isAdmin: boolean }) {
  const toast = useToast();
  const now = useNow(60_000);
  const triggers = useApi((signal) => api.triggers({ signal }), []);
  const templates = useApi((signal) => api.templates({ signal }), [], { revalidateOnFocus: false });
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const templateName = (id: string) => templates.data?.find((template) => template.id === id)?.name ?? "Trilha removida";

  const toggle = async (trigger: TriggerDTO, enabled: boolean) => {
    setBusy(trigger.id);
    try {
      await api.triggerUpdate(trigger.id, bodyFrom(trigger, enabled));
      triggers.reload();
    } catch (error) {
      toast.show({ tone: "error", title: "Não foi possível salvar", description: toApiError(error).message });
    } finally {
      setBusy(null);
    }
  };

  const remove = async (trigger: TriggerDTO) => {
    setBusy(trigger.id);
    try {
      await api.triggerDelete(trigger.id);
      toast.show({ tone: "success", title: "Automação removida" });
      triggers.reload();
    } catch (error) {
      toast.show({ tone: "error", title: "Não foi possível remover", description: toApiError(error).message });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Panel
      id="automacoes"
      title="Automações do CRM"
      description="Quando um registro chega à etapa escolhida, aparece em Hoje como “Detectado no Bitrix24”, com a nova jornada já preenchida."
    >
      <div className={styles.stack}>
        {triggers.loading ? (
          <LoadingArea label="Carregando as automações…">
            <Skeleton height={64} radius={6} />
          </LoadingArea>
        ) : triggers.error ? (
          <Notice tone="error" title="Não foi possível carregar as automações">
            {triggers.error.message}
          </Notice>
        ) : triggers.data?.length ? (
          <ul className={styles.list}>
            {triggers.data.map((trigger) => (
              <li key={trigger.id} className={styles.listItem}>
                <div className={styles.itemText}>
                  <p className={styles.itemTitle}>{trigger.name}</p>
                  <p className={styles.itemMeta}>
                    {[trigger.sourceName, trigger.stageName].filter(Boolean).join(" › ")} · trilha {templateName(trigger.templateId)}
                    {trigger.lastRunAt && now !== null ? ` · conferido ${formatSince(trigger.lastRunAt, now)}` : ""}
                  </p>
                  {trigger.lastError ? <p className={styles.error}>Último erro: {trigger.lastError}</p> : null}
                </div>
                <Chip tone={trigger.journeyKind === "onboarding" ? "arrival" : "departure"}>{JOURNEY_KIND_LABEL[trigger.journeyKind]}</Chip>
                <Checkbox
                  label="Ligada"
                  checked={trigger.enabled}
                  disabled={!isAdmin || busy === trigger.id}
                  onChange={(event) => toggle(trigger, event.target.checked)}
                />
                {isAdmin ? (
                  <Button variant="ghost" size="s" icon={Trash2} disabled={busy === trigger.id} onClick={() => remove(trigger)}>
                    Remover
                    <span className="sr-only"> {trigger.name}</span>
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.quiet}>Nenhuma automação ainda. Sem elas, as jornadas começam só pelo botão Nova jornada.</p>
        )}

        {isAdmin ? (
          creating ? (
            <TriggerForm
              templates={templates.data ?? []}
              onCancel={() => setCreating(false)}
              onCreated={() => {
                setCreating(false);
                triggers.reload();
              }}
            />
          ) : (
            <div className={styles.actions}>
              <Button icon={Radar} onClick={() => setCreating(true)}>
                Nova automação
              </Button>
            </div>
          )
        ) : (
          <p className={styles.quiet}>Só a administração cria ou muda automações.</p>
        )}
      </div>
    </Panel>
  );
}
