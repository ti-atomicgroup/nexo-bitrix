"use client";

import { useState, type FormEvent } from "react";
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
  Workspace,
} from "@/shared/contracts";
import {
  discoverySchema,
  processSchema,
  settingsSchema,
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

export function SettingsView({
  workspace,
  api,
  onUpdated,
  notify,
}: {
  workspace: Workspace;
  api: ApiClient;
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
  const [provisionOpen, setProvisionOpen] = useState(false);
  const [capabilities, setCapabilities] = useState(false);
  const process = draft.process;
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
  function prepareRules(): AutomationRule[] {
    const mapping = draft.process;
    if (!mapping) return rules;
    return (["onboarding", "offboarding"] as const).map((type) => {
      const existing = rules.find((r) => r.type === type);
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
        enabled: existing?.enabled ?? true,
      };
    });
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
  async function finish() {
    await perform(async () => {
      await save();
      const saved = await api.request("/api/setup", settingsSchema, {
        action: "finish",
      });
      setDraft(saved);
      await onUpdated();
      if (window.BX24) {
        window.BX24.installFinish();
        notify(
          "Instalação concluída. O Nexo está pronto para as primeiras jornadas.",
        );
      } else {
        notify(
          "Configuração salva. Abra o app dentro do Bitrix para finalizar a instalação no portal.",
        );
      }
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
          <div className="eyebrow">Seu ambiente Nexo</div>
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
                description="A conta e as permissões vêm do seu portal."
              />
              <div className="connection-summary">
                <span className="integration-logo large">
                  b<span>24</span>
                </span>
                <div>
                  <h3>{workspace.session.portalDomain}</h3>
                  <p>
                    <span className="dot dot-onboarding" />
                    Identidade de {workspace.session.user.name}
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
                  As credenciais são configuradas na instalação. Após alterar a
                  chave da aplicação no Bitrix, reinstale o Nexo para atualizar
                  a autorização.
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
                              rules.find((r) => r.type === item.type)
                                ?.templateId ||
                              workspace.templates.find(
                                (t) => t.type === item.type,
                              )?.id ||
                              ""
                            }
                            onChange={(e) =>
                              setRules((old) => {
                                const existing = old.find(
                                  (r) => r.type === item.type,
                                );
                                const value = {
                                  id: existing?.id || crypto.randomUUID(),
                                  name: item.label,
                                  type: item.type,
                                  templateId: e.target.value,
                                  stageId: process[item.key],
                                  enabled: existing?.enabled ?? true,
                                };
                                return [
                                  ...old.filter((r) => r.type !== item.type),
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
                <h3>Identidade das automações</h3>
              </div>
              <label className="authorization-checkbox">
                <input
                  type="checkbox"
                  checked={draft.automationUserId === workspace.session.user.id}
                  onChange={(e) =>
                    setDraft((old) => ({
                      ...old,
                      automationUserId: e.target.checked
                        ? workspace.session.user.id
                        : null,
                    }))
                  }
                />
                <span>
                  <strong>Usar minha identidade para as automações</strong>
                  <small>
                    As tarefas automáticas serão executadas como{" "}
                    {workspace.session.user.name}, respeitando as permissões
                    dessa conta.
                  </small>
                </span>
              </label>
              {draft.automationUserId &&
                draft.automationUserId !== workspace.session.user.id && (
                  <p className="field-help">
                    Identidade atualmente autorizada:{" "}
                    {workspace.users.find(
                      (u) => u.id === draft.automationUserId,
                    )?.name || "usuário do portal"}
                    .
                  </p>
                )}
              <SectionHeader
                title="Papéis no Nexo"
                description="O acesso continua limitado às permissões de cada usuário no Bitrix24."
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
