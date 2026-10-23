"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  ArrowRight,
  Check,
  CheckCheck,
  ChevronDown,
  Cloud,
  ExternalLink,
  KeyRound,
  Layers3,
  Link2,
  LockKeyhole,
  Plus,
  RefreshCw,
  ShieldCheck,
  Users,
  Zap,
} from "lucide-react";
import { z } from "zod";
import type {
  AppRole,
  AssigneeRole,
  AutomationRule,
  DiscoveryOption,
  ProcessMapping,
  Settings,
  TriggerSourceDiscovery,
  Workspace,
} from "@/shared/contracts";
import {
  discoverySchema,
  processSchema,
  settingsSchema,
  triggerSourceDiscoverySchema,
} from "@/shared/validation";
import { ApiClient, errorMessage } from "@/lib/client";
import { appRoleLabels, roleLabels, timeAgo } from "@/lib/format";
import { Button, CheckRow, Modal, SectionHeader } from "./ui";

const roles: AppRole[] = ["admin", "rh", "gestor", "executor", "colaborador"];
const assigneeRoles: AssigneeRole[] = [
  "rh",
  "gestor",
  "ti",
  "colaborador",
  "outros",
];
const blankProcess = (): ProcessMapping => ({
  entityTypeId: 0,
  categoryId: 0,
  employeeField: "",
  dateField: "",
  onboardingStageId: "",
  offboardingStageId: "",
  inProgressStageId: "",
  completedStageId: "",
  cancelledStageId: "",
});
const localAccountSchema = z.object({ id: z.string(), bitrixUserId: z.string(), user: z.object({ id: z.string(), name: z.string(), position: z.string(), department: z.string(), avatar: z.string().optional(), active: z.boolean() }), email: z.string(), role: z.enum(["admin", "rh", "gestor", "executor", "colaborador"]), active: z.boolean(), createdAt: z.string() });

export function SettingsView({
  workspace,
  api,
  outgoingWebhookConfigured = false,
  onUpdated,
  notify,
}: {
  workspace: Workspace;
  api: ApiClient;
  outgoingWebhookConfigured?: boolean;
  onUpdated: () => Promise<void>;
  notify: (message: string) => void;
}) {
  const [tab, setTab] = useState("connection");
  const [draft, setDraft] = useState<Settings>(() =>
    structuredClone(workspace.settings),
  );
  const [rules, setRules] = useState(() => structuredClone(workspace.rules));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [processes, setProcesses] = useState<DiscoveryOption[]>([]);
  const [categories, setCategories] = useState<DiscoveryOption[]>([]);
  const [fields, setFields] = useState<DiscoveryOption[]>([]);
  const [stages, setStages] = useState<DiscoveryOption[]>([]);
  const [triggerSources, setTriggerSources] = useState<TriggerSourceDiscovery[]>([]);
  const [provisionOpen, setProvisionOpen] = useState(false);
  const [capabilities, setCapabilities] = useState(false);
  const [outgoingToken, setOutgoingToken] = useState("");
  const [outgoingConfigured, setOutgoingConfigured] = useState(outgoingWebhookConfigured);
  const [localAccounts, setLocalAccounts] = useState<z.infer<typeof localAccountSchema>[]>([]);
  const [newAccount, setNewAccount] = useState({ email: "", password: "", bitrixUserId: "", role: "rh" as Exclude<AppRole, "admin"> });
  const process = draft.process;
  useEffect(() => {
    api.request("/api/users", z.array(localAccountSchema)).then(setLocalAccounts).catch((cause) => setError(errorMessage(cause)));
  }, [api]);
  function setProcess(patch: Partial<ProcessMapping>) {
    setDraft((old) => ({
      ...old,
      process: { ...(old.process || blankProcess()), ...patch },
    }));
  }
  async function perform(operation: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await operation();
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  async function loadProcesses() {
    await perform(async () => {
      const options = await api.request(
        "/api/discovery?kind=processes",
        discoverySchema,
      );
      setProcesses(options);
      if (process) await loadMetadata(process.entityTypeId, process.categoryId);
    });
  }
  async function loadMetadata(entityTypeId: number, categoryId: number) {
    const [nextFields, nextStages, nextCategories] = await Promise.all([
      api.request(
        `/api/discovery?kind=fields&entityTypeId=${entityTypeId}`,
        discoverySchema,
      ),
      api.request(
        `/api/discovery?kind=stages&entityTypeId=${entityTypeId}&categoryId=${categoryId}`,
        discoverySchema,
      ),
      api.request(
        `/api/discovery?kind=categories&entityTypeId=${entityTypeId}`,
        discoverySchema,
      ),
    ]);
    setFields(nextFields);
    setStages(nextStages);
    setCategories(nextCategories);
  }
  async function loadTriggerSources() {
    await perform(async () => {
      const sources = await api.request("/api/discovery?kind=trigger-sources", triggerSourceDiscoverySchema);
      setTriggerSources(sources);
    });
  }
  function updateTriggerRule(ruleId: string, patch: Partial<AutomationRule>) {
    setRules((current) => current.map((rule) => rule.id === ruleId ? { ...rule, ...patch } : rule));
  }
  function addTriggerRule(type: "onboarding" | "offboarding") {
    const template = workspace.templates.find((item) => item.type === type);
    setRules((current) => [...current, { id: crypto.randomUUID(), name: type === "onboarding" ? "Contratação pelo Kanban" : "Desligamento pelo Kanban", type, templateId: template?.id ?? "", stageId: "", source: null, fieldMapping: null, enabled: true }]);
  }
  function selectTriggerSource(ruleId: string, sourceId: string) {
    const [, rawEntityId] = sourceId.split(":");
    const source = triggerSources.find((item) => `${item.kind}:${item.entityTypeId}` === sourceId);
    const category = source?.categories[0];
    const stage = category?.stages[0];
    if (!source || !category || !stage) return;
    const name = source.fields.find((field) => ["string", "text"].includes(field.type ?? ""));
    const date = source.fields.find((field) => ["date", "datetime"].includes(field.type ?? ""));
    const person = source.fields.find((field) => ["employee", "user"].includes(field.type ?? ""));
    updateTriggerRule(ruleId, { stageId: stage.id, source: { kind: source.kind, entityTypeId: Number(rawEntityId), categoryId: category.id === null ? null : Number(category.id), stageId: stage.id }, fieldMapping: name && date ? { nameField: name.id, dateField: date.id, bitrixUserField: person?.id ?? null, positionField: null, departmentField: null } : null });
  }
  function prepareRules(): AutomationRule[] {
    const mapping = draft.process;
    if (!mapping) return rules;
    const defaults = (["onboarding", "offboarding"] as const).map((type) => {
      const existing = rules.find((r) => r.type === type && r.source === null);
      return {
        id: existing?.id || crypto.randomUUID(),
        name:
          type === "onboarding" ? "Admissão aprovada" : "Desligamento aprovado",
        type,
        templateId:
          existing?.templateId ||
          workspace.templates.find((t) => t.type === type)?.id ||
          "",
        stageId:
          type === "onboarding"
            ? mapping.onboardingStageId
            : mapping.offboardingStageId,
        source: existing?.source ?? null,
        fieldMapping: existing?.fieldMapping ?? null,
        enabled: existing?.enabled ?? true,
      };
    });
    return [...rules.filter((rule) => rule.source !== null), ...defaults];
  }
  async function save() {
    const nextRules = prepareRules();
    const saved = await api.request("/api/setup", settingsSchema, {
      action: "configure",
      settings: draft,
      rules: nextRules,
    });
    setDraft(saved);
    setRules(nextRules);
    await onUpdated();
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    await perform(async () => {
      await save();
      notify("Configurações salvas.");
    });
  }
  async function provision() {
    await perform(async () => {
      const mapping = await api.request("/api/setup", processSchema, {
        action: "provision",
      });
      setDraft((old) => ({ ...old, process: mapping }));
      await loadMetadata(mapping.entityTypeId, mapping.categoryId);
      setProvisionOpen(false);
      setTab("process");
      notify(
        "Processo de RH criado. Revise os responsáveis e os modelos antes de concluir.",
      );
    });
  }
  async function saveOutgoingWebhook() {
    await perform(async () => {
      const result = await api.request("/api/setup", z.object({ configured: z.boolean(), handlerUrl: z.string() }), { action: "set-outgoing-token", token: outgoingToken });
      setOutgoingToken(""); setOutgoingConfigured(true);
      await onUpdated();
      try { await navigator.clipboard.writeText(result.handlerUrl); notify("Token salvo. URL do handler copiada; o Nexo validará o token no primeiro evento recebido."); }
      catch { notify("Token salvo. Copie a URL do handler exibida acima para cadastrar no Bitrix24."); }
    });
  }
  async function createAccount() {
    await perform(async () => {
      const account = await api.request("/api/users", localAccountSchema, newAccount);
      setLocalAccounts((items) => [...items.filter((item) => item.id !== account.id), account]);
      setNewAccount({ email: "", password: "", bitrixUserId: "", role: "rh" });
      await onUpdated(); notify("Acesso Nexo criado para " + account.user.name + ".");
    });
  }
  async function deactivateAccount(account: z.infer<typeof localAccountSchema>) {
    await perform(async () => {
      await api.request(`/api/users/${encodeURIComponent(account.id)}`, z.object({ deactivated: z.boolean() }), undefined, "DELETE");
      setLocalAccounts((items) => items.map((item) => item.id === account.id ? { ...item, active: false } : item));
      notify("Acesso desativado.");
    });
  }
  async function finish() {
    await perform(async () => {
      await save();
      const saved = await api.request("/api/setup", settingsSchema, {
        action: "finish",
      });
      setDraft(saved);
      await onUpdated();
      notify("Configuração salva. O Nexo está pronto para as primeiras jornadas.");
    });
  }
  const tabs = [
    { id: "connection", title: "Conexão", icon: Link2 },
    { id: "process", title: "Processo de RH", icon: Layers3 },
    { id: "team", title: "Equipe e permissões", icon: Users },
    { id: "audit", title: "Histórico", icon: CheckCheck },
  ];
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>
            {draft.setupComplete ? "Configurações" : "Vamos preparar seu Nexo"}
          </h1>
          <p>
            {draft.setupComplete
              ? "Conexão, processos e permissões da sua empresa."
              : "Defina o processo de RH e quem cuida de cada etapa."}
          </p>
        </div>
        {!draft.setupComplete && (
          <span className="setup-step-label">Configuração inicial</span>
        )}
      </div>
      {!draft.setupComplete && (
        <div className="setup-progress">
          <span className="complete">
            <Check size={15} />
            Portal conectado
          </span>
          <span className={process ? "complete" : "current"}>
            {process ? <Check size={15} /> : "2"}Processo de RH
          </span>
          <span className={draft.automationUserId ? "complete" : ""}>
            {draft.automationUserId ? <Check size={15} /> : "3"}Responsáveis
          </span>
          <span>4 Pronto para começar</span>
        </div>
      )}
      <div className="settings-tabs" role="tablist" aria-label="Configurações">
        {tabs.map((item) => (
          <button
            role="tab"
            aria-selected={tab === item.id}
            id={`tab-${item.id}`}
            aria-controls={`panel-${item.id}`}
            key={item.id}
            className={tab === item.id ? "selected" : ""}
            onClick={() => setTab(item.id)}
          >
            <item.icon size={16} />
            {item.title}
          </button>
        ))}
      </div>
      <form onSubmit={submit}>
        <section
          role="tabpanel"
          id={`panel-${tab}`}
          aria-labelledby={`tab-${tab}`}
          className="settings-content"
        >
          {tab === "connection" && (
            <>
                <SectionHeader
                  title="Conexão com o Bitrix24"
                  description="O Nexo executa as operações com a conta RH que criou o webhook."
                />
              <div className="connection-summary">
                <span className="integration-logo large">
                  b<span>24</span>
                </span>
                <div>
                  <h3>{workspace.session.portalDomain}</h3>
                  <p>
                    <span className="dot dot-onboarding" />
                    Webhook ativo · conta operacional {workspace.settings.automationUserId || "não definida"}
                  </p>
                </div>
                <a
                  className="button button-secondary"
                  href={`https://${workspace.session.portalDomain}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Abrir portal
                  <ExternalLink size={14} />
                </a>
              </div>
              <div className="rh-project-summary">
                <div><span className="rh-project-mark"><Layers3 size={17} /></span><div><strong>Projeto privado do RH</strong><p>{workspace.settings.rhProject ? workspace.settings.rhProject.name : "Ainda não configurado"}</p></div></div>
                {workspace.settings.rhProject ? <a href={workspace.settings.rhProject.url} target="_blank" rel="noreferrer">Abrir Kanban <ExternalLink size={14} /></a> : <p>Será criado durante a preparação do processo. Adicione os usuários de RH como participantes no Bitrix para liberar o quadro.</p>}
              </div>
              <div className="form-section-heading"><Link2 size={17} /><h3>Eventos automáticos</h3></div>
              <p className="field-help">No Bitrix24, cadastre webhooks de saída para ONCRMDYNAMICITEMUPDATE e ONTASKUPDATE. Use a URL abaixo como endereço do handler e cole aqui o token recebido nos eventos.</p>
              <label className="field"><span>URL do handler</span><input readOnly value={typeof window === "undefined" ? "" : `${window.location.origin}/api/bitrix/events`} onFocus={(event) => event.currentTarget.select()} /></label>
              <div className="form-grid">
                <label className="field"><span>Token do webhook de saída</span><input type="password" autoComplete="off" value={outgoingToken} onChange={(event) => setOutgoingToken(event.target.value)} placeholder={outgoingConfigured ? "Token salvo · informe novo para substituir" : "Cole o token gerado pelo Bitrix24"} /></label>
                <div className="field"><span>Status</span><p className="field-help">{outgoingConfigured ? "Webhook de eventos configurado" : "Aguardando configuração"}</p></div>
              </div>
              <Button type="button" variant="secondary" loading={busy} disabled={!outgoingToken} onClick={saveOutgoingWebhook}><ShieldCheck size={15} />Salvar token do webhook</Button>
              <div className="form-grid">
                <label className="field">
                  <span>Nome da empresa</span>
                  <input
                    required
                    maxLength={120}
                    value={draft.companyName}
                    onChange={(e) =>
                      setDraft((old) => ({
                        ...old,
                        companyName: e.target.value,
                      }))
                    }
                  />
                </label>
                <label className="field">
                  <span>Fuso horário</span>
                  <select
                    value={draft.timezone}
                    onChange={(e) =>
                      setDraft((old) => ({ ...old, timezone: e.target.value }))
                    }
                  >
                    <option value="America/Sao_Paulo">
                      Brasília · São Paulo
                    </option>
                    <option value="America/Manaus">Manaus</option>
                    <option value="America/Belem">Belém</option>
                    <option value="America/Rio_Branco">Rio Branco</option>
                    <option value="America/Noronha">Fernando de Noronha</option>
                    <option value="Europe/Lisbon">Lisboa</option>
                    <option value="UTC">UTC</option>
                  </select>
                </label>
              </div>
              <div className="settings-checks">
                <CheckRow checked>Tokens protegidos no servidor</CheckRow>
                <CheckRow checked>
                  Usuários identificados pelo Bitrix24
                </CheckRow>
                <CheckRow checked>
                  Sincronização com cache e histórico de operações
                </CheckRow>
              </div>
              <div className="connection-actions">
                <Button
                  variant="secondary"
                  loading={busy}
                  onClick={() =>
                    perform(async () => {
                      await api.request("/api/setup", z.unknown(), {
                        action: "discover",
                      });
                      setCapabilities(true);
                      notify("Acesso à API verificado.");
                    })
                  }
                >
                  <RefreshCw size={15} />
                  Verificar conexão
                </Button>
                <span className="field-help">
                  {capabilities
                    ? "API verificada nesta sessão."
                    : "Verifica os recursos necessários para o Nexo."}
                </span>
              </div>
              <div className="info-strip">
                <KeyRound size={18} />
                <p>
                  A conexão é protegida no servidor. Se o webhook de entrada
                  for rotacionado, valide a nova URL no assistente de conexão.
                </p>
              </div>
            </>
          )}
          {tab === "process" && (
            <>
              <SectionHeader
                title="Movimentações de Pessoas"
                description="Uma aprovação inicia a jornada e gera as tarefas no Bitrix."
                action={
                  <Button
                    variant="secondary"
                    loading={busy}
                    onClick={loadProcesses}
                  >
                    <RefreshCw size={15} />
                    Carregar processos
                  </Button>
                }
              />
              <div className="process-options">
                <div>
                  <span>
                    <Plus size={20} />
                  </span>
                  <div>
                    <h3>Preparar um processo para o Nexo</h3>
                    <p>
                      Cria campos e etapas de aprovação, execução e conclusão.
                    </p>
                  </div>
                  <Button
                    variant="secondary"
                    disabled={busy}
                    onClick={() => setProvisionOpen(true)}
                  >
                    Criar processo
                    <ArrowRight size={15} />
                  </Button>
                </div>
              </div>
              <div className="form-divider">
                <span>ou associe um processo existente</span>
              </div>
              <div className="form-grid">
                <label className="field">
                  <span>Processo de RH</span>
                  <select
                    value={process?.entityTypeId || ""}
                    onChange={(e) => {
                      const id = Number(e.target.value);
                      if (!id) return;
                      setProcess({ ...blankProcess(), entityTypeId: id });
                      perform(async () => {
                        const cats = await api.request(
                          `/api/discovery?kind=categories&entityTypeId=${id}`,
                          discoverySchema,
                        );
                        setCategories(cats);
                        const first = cats[0];
                        const categoryId = first ? Number(first.id) : 0;
                        setProcess({ entityTypeId: id, categoryId });
                        await loadMetadata(id, categoryId);
                      });
                    }}
                  >
                    <option value="">Selecione um processo</option>
                    {process &&
                      !processes.some(
                        (p) => Number(p.id) === process.entityTypeId,
                      ) && (
                        <option value={process.entityTypeId}>
                          Processo associado ao Nexo
                        </option>
                      )}
                    {processes.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Funil do processo</span>
                  <select
                    disabled={!process}
                    value={process?.categoryId ?? ""}
                    onChange={(e) => {
                      const categoryId = Number(e.target.value);
                      setProcess({ categoryId });
                      if (process)
                        perform(() =>
                          loadMetadata(process.entityTypeId, categoryId),
                        );
                    }}
                  >
                    <option value="">Selecione um funil</option>
                    {process &&
                      !categories.some(
                        (c) => Number(c.id) === process.categoryId,
                      ) && (
                        <option value={process.categoryId}>
                          Funil associado
                        </option>
                      )}
                    {categories.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {process && (
                <>
                  <div className="form-grid">
                    <label className="field">
                      <span>Campo do colaborador</span>
                      <select
                        value={process.employeeField}
                        onChange={(e) =>
                          setProcess({ employeeField: e.target.value })
                        }
                      >
                        <option value="">Selecione o campo</option>
                        {process.employeeField &&
                          !fields.some(
                            (f) => f.id === process.employeeField,
                          ) && (
                            <option value={process.employeeField}>
                              Colaborador associado
                            </option>
                          )}
                        {fields.map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      <span>Campo da data principal</span>
                      <select
                        value={process.dateField}
                        onChange={(e) =>
                          setProcess({ dateField: e.target.value })
                        }
                      >
                        <option value="">Selecione o campo</option>
                        {process.dateField &&
                          !fields.some((f) => f.id === process.dateField) && (
                            <option value={process.dateField}>
                              Data principal associada
                            </option>
                          )}
                        {fields.map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="form-section-heading">
                    <Zap size={17} />
                    <h3>Etapas que iniciam as jornadas</h3>
                  </div>
                  <div className="form-grid">
                    {(
                      [
                        {
                          key: "onboardingStageId",
                          label: "Admissão aprovada",
                          type: "onboarding",
                        },
                        {
                          key: "offboardingStageId",
                          label: "Desligamento aprovado",
                          type: "offboarding",
                        },
                      ] as const
                    ).map((item) => (
                      <div key={item.key}>
                        <label className="field">
                          <span>{item.label}</span>
                          <select
                            value={process[item.key]}
                            onChange={(e) =>
                              setProcess({ [item.key]: e.target.value })
                            }
                          >
                            <option value="">Selecione a etapa</option>
                            {process[item.key] &&
                              !stages.some(
                                (s) => s.id === process[item.key],
                              ) && (
                                <option value={process[item.key]}>
                                  Etapa associada
                                </option>
                              )}
                            {stages.map((option) => (
                              <option key={option.id} value={option.id}>
                                {option.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="field">
                          <span>Modelo a aplicar</span>
                          <select
                            value={
                              rules.find((r) => r.type === item.type && r.source === null)
                                ?.templateId ||
                              workspace.templates.find(
                                (t) => t.type === item.type,
                              )?.id ||
                              ""
                            }
                            onChange={(e) =>
                              setRules((old) => {
                                const existing = old.find(
                                  (r) => r.type === item.type && r.source === null,
                                );
                                const value = {
                                  id: existing?.id || crypto.randomUUID(),
                                  name: item.label,
                                  type: item.type,
                                  templateId: e.target.value,
                                  stageId: process[item.key],
                                  source: existing?.source ?? null,
                                  fieldMapping: existing?.fieldMapping ?? null,
                                  enabled: existing?.enabled ?? true,
                                };
                                return [
                                  ...old.filter((r) => !(r.type === item.type && r.source === null)),
                                  value,
                                ];
                              })
                            }
                          >
                            {workspace.templates
                              .filter((t) => t.type === item.type)
                              .map((t) => (
                                <option key={t.id} value={t.id}>
                                  {t.name}
                                </option>
                              ))}
                          </select>
                        </label>
                      </div>
                    ))}
                  </div>
                  <div className="form-section-heading">
                    <CheckCheck size={17} />
                    <h3>Retorno de acompanhamento ao Bitrix</h3>
                  </div>
                  <div className="form-grid">
                    {(
                      [
                        { key: "inProgressStageId", label: "Em execução" },
                        { key: "completedStageId", label: "Concluído" },
                        { key: "cancelledStageId", label: "Cancelado" },
                      ] as const
                    ).map((item) => (
                      <label className="field" key={item.key}>
                        <span>{item.label}</span>
                        <select
                          value={process[item.key]}
                          onChange={(e) =>
                            setProcess({ [item.key]: e.target.value })
                          }
                        >
                          <option value="">Selecione a etapa</option>
                          {process[item.key] &&
                            !stages.some((s) => s.id === process[item.key]) && (
                              <option value={process[item.key]}>
                                Etapa associada
                              </option>
                            )}
                          {stages.map((option) => (
                            <option key={option.id} value={option.id}>
                              {option.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    ))}
                  </div>
                </>
              )}
              <div className="form-section-heading"><Zap size={17} /><h3>Gatilhos de outros Kanbans</h3></div>
              <p className="field-help">Conecte uma etapa de Leads, Negócios ou Processo Inteligente. Ao chegar nela, o Nexo inicia a jornada e libera cada tarefa conforme o modelo.</p>
              <div className="button-row"><Button type="button" variant="secondary" loading={busy} onClick={loadTriggerSources}><RefreshCw size={15} />Descobrir Kanbans do Bitrix</Button><Button type="button" variant="secondary" onClick={() => addTriggerRule("onboarding")}><Plus size={15} />Novo gatilho de onboarding</Button><Button type="button" variant="secondary" onClick={() => addTriggerRule("offboarding")}><Plus size={15} />Novo gatilho de offboarding</Button></div>
              {rules.filter((rule) => rule.source !== null || rule.fieldMapping === null && rule.stageId === "").map((rule) => {
                const source = rule.source ? triggerSources.find((item) => item.kind === rule.source?.kind && item.entityTypeId === rule.source.entityTypeId) : undefined;
                const selectedCategory = source?.categories.find((item) => item.id === (rule.source?.categoryId === null ? null : String(rule.source?.categoryId)));
                const fieldsForSource = source?.fields ?? [];
                const updateMapping = (patch: Partial<NonNullable<AutomationRule["fieldMapping"]>>) => updateTriggerRule(rule.id, { fieldMapping: { nameField: rule.fieldMapping?.nameField ?? "", dateField: rule.fieldMapping?.dateField ?? "", bitrixUserField: rule.fieldMapping?.bitrixUserField ?? null, positionField: rule.fieldMapping?.positionField ?? null, departmentField: rule.fieldMapping?.departmentField ?? null, ...patch } });
                return <div className="trigger-rule-card" key={rule.id}>
                  <div className="form-grid"><label className="field"><span>Tipo de jornada</span><select value={rule.type} onChange={(event) => updateTriggerRule(rule.id, { type: event.target.value as "onboarding" | "offboarding" })}><option value="onboarding">Onboarding</option><option value="offboarding">Offboarding</option></select></label><label className="field"><span>Modelo de jornada</span><select value={rule.templateId} onChange={(event) => updateTriggerRule(rule.id, { templateId: event.target.value })}><option value="">Selecione um modelo</option>{workspace.templates.filter((template) => template.type === rule.type).map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</select></label></div>
                  <label className="field"><span>Quadro de origem</span><select value={source ? `${source.kind}:${source.entityTypeId}` : ""} onChange={(event) => selectTriggerSource(rule.id, event.target.value)}><option value="">Selecione o Kanban</option>{triggerSources.map((item) => <option key={`${item.kind}:${item.entityTypeId}`} value={`${item.kind}:${item.entityTypeId}`}>{item.name}</option>)}</select></label>
                  {source && <div className="form-grid"><label className="field"><span>Funil / categoria</span><select value={rule.source?.categoryId === null ? "" : String(rule.source?.categoryId ?? "")} onChange={(event) => { const category = source.categories.find((item) => item.id === (event.target.value || null)); const stage = category?.stages[0]; if (category && stage) updateTriggerRule(rule.id, { stageId: stage.id, source: { ...rule.source!, categoryId: category.id === null ? null : Number(category.id), stageId: stage.id } }); }}><option value="">Padrão</option>{source.categories.map((category) => <option key={category.id ?? "default"} value={category.id ?? ""}>{category.name}</option>)}</select></label><label className="field"><span>Etapa que inicia</span><select value={rule.source?.stageId ?? ""} onChange={(event) => updateTriggerRule(rule.id, { stageId: event.target.value, source: { ...rule.source!, stageId: event.target.value } })}><option value="">Selecione a etapa</option>{(selectedCategory?.stages ?? source.categories.flatMap((item) => item.stages)).map((stage) => <option key={stage.id} value={stage.id}>{stage.name}</option>)}</select></label></div>}
                  {source && <div className="form-grid"><label className="field"><span>Campo com nome da pessoa</span><select value={rule.fieldMapping?.nameField ?? ""} onChange={(event) => updateMapping({ nameField: event.target.value })}><option value="">Selecione</option>{fieldsForSource.map((field) => <option key={field.id} value={field.id}>{field.name}</option>)}</select></label><label className="field"><span>Campo da data principal</span><select value={rule.fieldMapping?.dateField ?? ""} onChange={(event) => updateMapping({ dateField: event.target.value })}><option value="">Selecione</option>{fieldsForSource.filter((field) => ["date", "datetime"].includes(field.type ?? "")).map((field) => <option key={field.id} value={field.id}>{field.name}</option>)}</select></label><label className="field"><span>Usuário Bitrix (se já existir)</span><select value={rule.fieldMapping?.bitrixUserField ?? ""} onChange={(event) => updateMapping({ bitrixUserField: event.target.value || null })}><option value="">Vincular depois no Nexo</option>{fieldsForSource.filter((field) => ["employee", "user"].includes(field.type ?? "")).map((field) => <option key={field.id} value={field.id}>{field.name}</option>)}</select></label></div>}
                  <div className="button-row"><label className="settings-check"><input type="checkbox" checked={rule.enabled} onChange={(event) => updateTriggerRule(rule.id, { enabled: event.target.checked })} />Ativo</label><Button type="button" variant="ghost" onClick={() => setRules((old) => old.filter((item) => item.id !== rule.id))}>Remover gatilho</Button></div>
                </div>;
              })}
            </>
          )}
          {tab === "team" && (
            <>
              <SectionHeader
                title="Quem cuida de cada etapa"
                description="Defina os responsáveis padrão. Você pode ajustá-los ao iniciar uma jornada."
              />
              <div className="form-grid">
                {assigneeRoles.map((role) => (
                  <label className="field" key={role}>
                    <span>{roleLabels[role]}</span>
                    <select
                      value={draft.defaultAssignees[role] || ""}
                      onChange={(e) =>
                        setDraft((old) => ({
                          ...old,
                          defaultAssignees: {
                            ...old.defaultAssignees,
                            [role]: e.target.value,
                          },
                        }))
                      }
                    >
                      <option value="">Selecionar ao iniciar a jornada</option>
                      {workspace.users
                        .filter((u) => u.active)
                        .map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name}
                          </option>
                        ))}
                    </select>
                  </label>
                ))}
              </div>
              <div className="form-section-heading">
                <ShieldCheck size={17} />
                <h3>Conta de execução Bitrix24</h3>
              </div>
              <p className="field-help">Todas as ações no Bitrix são realizadas pela conta vinculada ao webhook. Para trocar essa identidade, recrie o webhook com a conta de serviço desejada e reconecte o Nexo.</p>
              <SectionHeader
                title="Papéis no Nexo"
                description="O acesso ao Nexo usa contas locais vinculadas a usuários Bitrix24."
              />
              <div className="role-assignments">
                {roles.map((role) => (
                  <details key={role}>
                    <summary>
                      <span>
                        <Users size={16} />
                        {appRoleLabels[role]}
                      </span>
                      <small>
                        {draft.roleAssignments[role].length} usuários
                        <ChevronDown size={14} />
                      </small>
                    </summary>
                    <div>
                      {workspace.users
                        .filter((u) => u.active)
                        .map((user) => (
                          <label key={user.id}>
                            <input
                              type="checkbox"
                              checked={draft.roleAssignments[role].includes(
                                user.id,
                              )}
                              onChange={(e) =>
                                setDraft((old) => ({
                                  ...old,
                                  roleAssignments: {
                                    ...old.roleAssignments,
                                    [role]: e.target.checked
                                      ? [...old.roleAssignments[role], user.id]
                                      : old.roleAssignments[role].filter(
                                          (id) => id !== user.id,
                                        ),
                                  },
                                }))
                              }
                            />
                            <span>{user.name}</span>
                            <small>{user.position}</small>
                          </label>
                        ))}
                    </div>
                  </details>
                ))}
              </div>
              <SectionHeader title="Acessos ao Nexo" description="Crie contas individuais para RH, gestores, executores e colaboradores, vinculadas a usuários ativos do Bitrix24." />
              <div className="form-grid">
                <label className="field"><span>Usuário Bitrix24</span><select value={newAccount.bitrixUserId} onChange={(event) => setNewAccount((old) => ({ ...old, bitrixUserId: event.target.value }))}><option value="">Selecione uma pessoa</option>{workspace.users.filter((user) => user.active).map((user) => <option key={user.id} value={user.id}>{user.name} · {user.id}</option>)}</select></label>
                <label className="field"><span>Papel</span><select value={newAccount.role} onChange={(event) => setNewAccount((old) => ({ ...old, role: event.target.value as Exclude<AppRole, "admin"> }))}>{roles.filter((role) => role !== "admin").map((role) => <option key={role} value={role}>{appRoleLabels[role]}</option>)}</select></label>
                <label className="field"><span>E-mail de acesso</span><input type="email" value={newAccount.email} onChange={(event) => setNewAccount((old) => ({ ...old, email: event.target.value }))} /></label>
                <label className="field"><span>Senha inicial (mínimo 12 caracteres)</span><input type="password" autoComplete="new-password" minLength={12} value={newAccount.password} onChange={(event) => setNewAccount((old) => ({ ...old, password: event.target.value }))} /></label>
              </div>
              <Button type="button" variant="secondary" loading={busy} disabled={!newAccount.bitrixUserId || !newAccount.email || newAccount.password.length < 12} onClick={createAccount}><Plus size={15} />Criar acesso</Button>
              <div className="audit-list">{localAccounts.map((account) => <div key={account.id}><span className="audit-icon"><Users size={16} /></span><div><strong>{account.user.name} · {appRoleLabels[account.role]}</strong><small>{account.email} · {account.active ? "Ativo" : "Desativado"}</small></div>{account.active && account.role !== "admin" && <Button type="button" variant="ghost" onClick={() => deactivateAccount(account)}>Desativar</Button>}</div>)}</div>
            </>
          )}
          {tab === "audit" && (
            <>
              <SectionHeader
                title="Histórico de operações"
                description="Rastreabilidade das alterações e execuções do Nexo."
              />
              {workspace.audit.length ? (
                <div className="audit-list">
                  {workspace.audit.map((entry) => (
                    <div key={entry.id}>
                      <span className="audit-icon">
                        <CheckCheck size={16} />
                      </span>
                      <div>
                        <strong>{entry.message}</strong>
                        <small>
                          {entry.actorName} · {timeAgo(entry.createdAt)}
                        </small>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="muted">
                  As operações serão registradas aqui conforme o Nexo for
                  utilizado.
                </p>
              )}
              <div className="info-strip">
                <LockKeyhole size={17} />
                <p>
                  O histórico registra ações e resultados. Tokens e senhas não
                  são incluídos nos registros.
                </p>
              </div>
            </>
          )}
          {error && (
            <div className="form-error" role="alert">
              {error}
            </div>
          )}
        </section>
        {tab !== "audit" && (
          <div className="settings-footer">
            <span>
              <Cloud size={15} />
              Dados na sua instalação Onnira
            </span>
            <div>
              <Button type="submit" variant="secondary" loading={busy}>
                Salvar configurações
              </Button>
              {!draft.setupComplete && (
                <Button
                  disabled={busy || !process || !draft.automationUserId}
                  loading={busy}
                  onClick={finish}
                >
                  Concluir instalação
                  <ArrowRight size={16} />
                </Button>
              )}
            </div>
          </div>
        )}
      </form>
      {provisionOpen && (
        <Modal
          title="Criar processo de RH no Bitrix24"
          description="Revise o que será preparado no seu portal."
          onClose={() => {
            if (!busy) setProvisionOpen(false);
          }}
        >
          <div className="modal-body">
            <div className="settings-checks">
              <CheckRow checked>Processo Movimentações de Pessoas</CheckRow>
              <CheckRow checked>
                Campos de colaborador e data principal
              </CheckRow>
              <CheckRow checked>
                Etapas de aprovação de admissão e desligamento
              </CheckRow>
              <CheckRow checked>
                Etapas de execução, conclusão e cancelamento
              </CheckRow>
            </div>
            <p className="field-help">
              A criação usa sua autorização administrativa no Bitrix. Depois,
              revise os acessos ao processo para a equipe de RH.
            </p>
            {error && (
              <div className="form-error" role="alert">
                {error}
              </div>
            )}
          </div>
          <div className="modal-footer">
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => setProvisionOpen(false)}
            >
              Cancelar
            </Button>
            <Button loading={busy} onClick={provision}>
              Criar no Bitrix24
              <ArrowRight size={15} />
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}
