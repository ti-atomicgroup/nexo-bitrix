"use client";

import { useState, type FormEvent } from "react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  CheckCheck,
  Copy,
  FileText,
  Layers3,
  Pencil,
  Plus,
  ShieldCheck,
  Trash2,
  Users,
} from "lucide-react";
import type {
  ActivityDefinition,
  AssigneeRole,
  JourneyTemplate,
  JourneyType,
  StageDefinition,
  Visibility,
  Workspace,
} from "@/shared/contracts";
import { roleLabels, shortDate } from "@/lib/format";
import { Button, EmptyState, Modal, TypeBadge } from "./ui";

function newActivity(): ActivityDefinition {
  return {
    id: crypto.randomUUID(),
    title: "",
    description: "",
    assigneeRole: "rh",
    offsetDays: 0,
    offsetUnit: "calendar_days",
    required: true,
    critical: false,
    visibility: "team",
    checklist: [],
    documents: [],
    competencies: [],
  };
}
function newStage(): StageDefinition {
  return {
    id: crypto.randomUUID(),
    title: "Nova etapa",
    release: { mode: "immediate", offsetDays: 0, offsetUnit: "calendar_days" },
    activities: [newActivity()],
  };
}
export function emptyTemplate(type: JourneyType): JourneyTemplate {
  return {
    id: crypto.randomUUID(),
    name: "",
    description: "",
    type,
    profile: "Geral",
    version: 1,
    stages: [newStage()],
    updatedAt: new Date().toISOString(),
  };
}

export function TemplatesView({
  workspace,
  query,
  onEdit,
  onCreate,
  onDuplicate,
}: {
  workspace: Workspace;
  query: string;
  onEdit: (template: JourneyTemplate) => void;
  onCreate: () => void;
  onDuplicate: (template: JourneyTemplate) => void;
}) {
  const [filter, setFilter] = useState<"all" | JourneyType>("all");
  const [profileFilter, setProfileFilter] = useState("all");
  const profiles = [...new Set(workspace.templates.map((t) => t.profile))].sort();
  const templates = workspace.templates.filter(
    (t) =>
      (filter === "all" || t.type === filter) &&
      (profileFilter === "all" || t.profile === profileFilter) &&
      `${t.name} ${t.description} ${t.profile}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Modelos de jornada</h1>
          <p>Configure uma vez. Cuide de cada pessoa com o mesmo padrão.</p>
        </div>
        {workspace.session.canManage && (
          <Button onClick={onCreate}>
            <Plus size={16} />
            Novo modelo
          </Button>
        )}
      </div>
      <label className="field template-profile-filter"><span>Perfil</span><select aria-label="Filtrar modelos por perfil" value={profileFilter} onChange={(event) => setProfileFilter(event.target.value)}><option value="all">Todos os perfis</option>{profiles.map((profile) => <option key={profile} value={profile}>{profile}</option>)}</select></label>
      <div className="filter-bar">
        <div className="segmented">
          <button
            className={filter === "all" ? "selected" : ""}
            onClick={() => setFilter("all")}
          >
            Todos os modelos
          </button>
          <button
            className={filter === "onboarding" ? "selected" : ""}
            onClick={() => setFilter("onboarding")}
          >
            Onboarding
          </button>
          <button
            className={filter === "offboarding" ? "selected" : ""}
            onClick={() => setFilter("offboarding")}
          >
            Offboarding
          </button>
        </div>
        <span className="count-label">{templates.length} modelos</span>
      </div>
      {templates.length ? (
        <div className="template-grid">
          {templates.map((template) => {
            const activities = template.stages.flatMap((s) => s.activities);
            return (
              <article className="template-card" key={template.id}>
                <div className="template-card-heading">
                  <span className={`template-icon ${template.type}`}>
                    <Layers3 size={24} />
                  </span>
                  <TypeBadge type={template.type} />
                  <span className="template-profile-tag">{template.profile}</span>
                  <span className="version-label">v{template.version}</span>
                </div>
                <h2>{template.name}</h2>
                <p>
                  {template.description ||
                    "Etapas e atividades para uma jornada organizada."}
                </p>
                <div className="template-counts">
                  <span>
                    <Layers3 size={15} />
                    {template.stages.length} etapas
                  </span>
                  <span>
                    <CheckCheck size={15} />
                    {activities.length} atividades
                  </span>
                  <span>
                    <Users size={15} />
                    {new Set(activities.map((a) => a.assigneeRole)).size} áreas
                  </span>
                </div>
                <ol className="template-stage-list">
                  {template.stages.slice(0, 4).map((stage, index) => (
                    <li key={stage.id}>
                      <span>{index + 1}</span>
                      {stage.title}
                    </li>
                  ))}
                  {template.stages.length > 4 && (
                    <li className="muted">
                      + {template.stages.length - 4} etapas
                    </li>
                  )}
                </ol>
                <div className="template-card-footer">
                  <small>Atualizado em {shortDate(template.updatedAt)}</small>
                  <div>
                    {workspace.session.canManage && (
                      <button
                        className="icon-button"
                        onClick={() => onDuplicate(template)}
                        aria-label={`Duplicar ${template.name}`}
                      >
                        <Copy size={16} />
                      </button>
                    )}
                    <Button variant="ghost" onClick={() => onEdit(template)}>
                      {workspace.session.canManage
                        ? "Editar modelo"
                        : "Ver modelo"}
                      <ArrowRight size={15} />
                    </Button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <section className="workspace-section">
          <EmptyState
            icon={<Layers3 size={29} />}
            title="Nenhum modelo nesta seleção"
            description="Crie etapas e checklists para padronizar as próximas jornadas."
            action={
              workspace.session.canManage ? (
                <Button onClick={onCreate}>
                  Criar modelo
                  <Plus size={16} />
                </Button>
              ) : undefined
            }
          />
        </section>
      )}
      <div className="info-strip">
        <ShieldCheck size={18} />
        <p>
          As jornadas em andamento mantêm sua versão original. Alterações nos
          modelos serão aplicadas às próximas jornadas.
        </p>
      </div>
    </>
  );
}

export function TemplateEditor({
  template,
  isNew,
  readOnly,
  onClose,
  onSave,
}: {
  template: JourneyTemplate;
  isNew: boolean;
  readOnly: boolean;
  onClose: () => void;
  onSave: (template: JourneyTemplate, isNew: boolean) => Promise<void>;
}) {
  const [draft, setDraft] = useState(() => structuredClone(template));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [step, setStep] = useState<1 | 2>(1);
  function updateStage(
    id: string,
    updater: (stage: StageDefinition) => StageDefinition,
  ) {
    setDraft((old) => ({
      ...old,
      stages: old.stages.map((s) => (s.id === id ? updater(s) : s)),
    }));
  }
  function updateActivity(
    stageId: string,
    activityId: string,
    patch: Partial<ActivityDefinition>,
  ) {
    updateStage(stageId, (stage) => ({
      ...stage,
      activities: stage.activities.map((a) =>
        a.id === activityId ? { ...a, ...patch } : a,
      ),
    }));
  }
  function moveStage(index: number, direction: number) {
    setDraft((old) => {
      const stages = [...old.stages];
      const other = stages[index + direction];
      if (!other) return old;
      [stages[index], stages[index + direction]] = [other, stages[index]];
      return { ...old, stages };
    });
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (
      !draft.stages.length ||
      draft.stages.some((s) => !s.activities.length)
    ) {
      setError(
        "Cada modelo precisa de pelo menos uma etapa, e cada etapa precisa de uma atividade.",
      );
      return;
    }
    if (step === 1) { setStep(2); return; }
    setBusy(true);
    try {
      await onSave(draft, isNew);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Não foi possível salvar o modelo.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={isNew ? "Novo modelo de jornada" : `Modelo · ${template.name}`}
      description="Etapas claras, responsáveis definidos e um padrão para toda a equipe."
      onClose={onClose}
      wide
    >
      <form onSubmit={submit}>
        <fieldset disabled={readOnly || busy} className="editor-fieldset">
          <div className="modal-body">
            {step === 1 ? <>
            <div className="form-grid">
              <label className="field">
                <span>
                  Nome do modelo <i>*</i>
                </span>
                <input
                  required
                  minLength={3}
                  maxLength={120}
                  value={draft.name}
                  onChange={(e) =>
                    setDraft((old) => ({ ...old, name: e.target.value }))
                  }
                  placeholder="Ex.: Integração de novos colaboradores"
                />
              </label>
              <label className="field">
                <span>Tipo de jornada</span>
                <select
                  value={draft.type}
                  onChange={(e) => {
                    const result = e.target.value;
                    if (result === "onboarding" || result === "offboarding")
                      setDraft((old) => ({ ...old, type: result }));
                  }}
                >
                  <option value="onboarding">Onboarding</option>
                  <option value="offboarding">Offboarding</option>
                </select>
              </label>
              <label className="field">
                <span>Perfil do colaborador <i>*</i></span>
                <input required minLength={2} maxLength={100} value={draft.profile} onChange={(event) => setDraft((old) => ({ ...old, profile: event.target.value }))} placeholder="Ex.: Vendedor, RH, Liderança" />
                <small>Ajuda o RH a escolher o roteiro certo para cada pessoa.</small>
              </label>
            </div>
            <label className="field">
              <span>Descrição</span>
              <textarea
                rows={2}
                maxLength={1000}
                value={draft.description}
                onChange={(e) =>
                  setDraft((old) => ({ ...old, description: e.target.value }))
                }
                placeholder="Qual experiência este modelo organiza?"
              />
            </label>
            <div className="editor-heading">
              <h3>Etapas e atividades</h3>
              <span className="subtle-label">
                {draft.stages.length} etapas ·{" "}
                {draft.stages.flatMap((s) => s.activities).length} atividades
              </span>
            </div>
            <div className="stage-editor-list">
              {draft.stages.map((stage, index) => (
                <section className="stage-editor" key={stage.id}>
                  <div className="stage-editor-heading">
                    <span className="stage-number">{index + 1}</span>
                    <label className="sr-only" htmlFor={`stage-${stage.id}`}>
                      Nome da etapa {index + 1}
                    </label>
                    <input
                      id={`stage-${stage.id}`}
                      required
                      value={stage.title}
                      onChange={(e) =>
                        updateStage(stage.id, (old) => ({
                          ...old,
                          title: e.target.value,
                        }))
                      }
                    />
                    <div>
                      <button
                        className="icon-button"
                        type="button"
                        disabled={index === 0}
                        aria-label="Mover etapa para cima"
                        onClick={() => moveStage(index, -1)}
                      >
                        <ArrowUp size={15} />
                      </button>
                      <button
                        className="icon-button"
                        type="button"
                        disabled={index === draft.stages.length - 1}
                        aria-label="Mover etapa para baixo"
                        onClick={() => moveStage(index, 1)}
                      >
                        <ArrowDown size={15} />
                      </button>
                      <button
                        className="icon-button destructive"
                        type="button"
                        aria-label={`Remover etapa ${stage.title}`}
                        onClick={() =>
                          setDraft((old) => ({
                            ...old,
                            stages: old.stages.filter((s) => s.id !== stage.id),
                          }))
                        }
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                  <div className="form-grid stage-release-controls">
                    <label className="field">
                      <span>Quando liberar esta etapa</span>
                      <select value={(stage.release ?? { mode: "immediate" }).mode} onChange={(event) => updateStage(stage.id, (old) => ({ ...old, release: { ...(old.release ?? { mode: "immediate" as const, offsetDays: 0, offsetUnit: "calendar_days" as const }), mode: event.target.value as "immediate" | "date" | "previous_stage_completed" } }))}>
                        <option value="immediate">Assim que a jornada começar</option>
                        <option value="date">Na data relativa à entrada/saída</option>
                        <option value="previous_stage_completed">Após concluir a etapa anterior</option>
                      </select>
                      <small>As tarefas desta etapa só aparecem no Kanban do Bitrix quando ela for liberada.</small>
                    </label>
                    {stage.release?.mode === "date" && <label className="field"><span>Diferença da data principal</span><div className="form-grid"><input aria-label="Dias até liberar a etapa" type="number" min={-365} max={365} value={stage.release.offsetDays} onChange={(event) => updateStage(stage.id, (old) => ({ ...old, release: { ...(old.release ?? { mode: "date" as const, offsetDays: 0, offsetUnit: "calendar_days" as const }), offsetDays: Number(event.target.value) } }))} /><select aria-label="Unidade do prazo da etapa" value={stage.release.offsetUnit} onChange={(event) => updateStage(stage.id, (old) => ({ ...old, release: { ...(old.release ?? { mode: "date" as const, offsetDays: 0, offsetUnit: "calendar_days" as const }), offsetUnit: event.target.value as "calendar_days" | "business_days" } }))}><option value="calendar_days">Dias corridos</option><option value="business_days">Dias úteis</option></select></div></label>}
                  </div>
                  {stage.activities.map((activity) => (
                    <details
                      className="activity-editor"
                      key={activity.id}
                    >
                      <summary>
                        <Pencil size={14} />
                        <strong>{activity.title || "Nova atividade"}</strong>
                        <span>
                          {roleLabels[activity.assigneeRole]} · D
                          {activity.offsetDays >= 0 ? "+" : ""}
                          {activity.offsetDays}
                          {activity.offsetUnit === "business_days" ? " úteis" : " corridos"}
                        </span>
                      </summary>
                      <div className="activity-editor-body">
                        <div className="form-grid">
                          <label className="field">
                            <span>
                              Nome da atividade <i>*</i>
                            </span>
                            <input
                              required
                              minLength={3}
                              maxLength={200}
                              value={activity.title}
                              onChange={(e) =>
                                updateActivity(stage.id, activity.id, {
                                  title: e.target.value,
                                })
                              }
                            />
                          </label>
                          <label className="field">
                            <span>Área responsável</span>
                            <select
                              value={activity.assigneeRole}
                              onChange={(e) =>
                                updateActivity(stage.id, activity.id, {
                                  assigneeRole: e.target.value as AssigneeRole,
                                })
                              }
                            >
                              {Object.entries(roleLabels).map(
                                ([key, label]) => (
                                  <option key={key} value={key}>
                                    {label}
                                  </option>
                                ),
                              )}
                            </select>
                          </label>
                        </div>
                        <label className="field">
                          <span>Orientações para execução</span>
                          <textarea
                            rows={2}
                            value={activity.description}
                            onChange={(e) =>
                              updateActivity(stage.id, activity.id, {
                                description: e.target.value,
                              })
                            }
                          />
                        </label>
                        <label className="field">
                          <span>Competências desenvolvidas</span>
                          <input value={(activity.competencies ?? []).join(", ")} maxLength={1200} placeholder="Ex.: CRM, comunicação com clientes, processo comercial" onChange={(e) => updateActivity(stage.id, activity.id, { competencies: [...new Set(e.target.value.split(",").map((value) => value.trim()).filter(Boolean).slice(0, 40))] })} />
                          <small>Separe por vírgula. A IA usa estas etiquetas para relacionar habilidades às atividades do modelo.</small>
                        </label>
                        <div className="form-grid">
                          <label className="field">
                            <span>Prazo relativo à data principal</span>
                            <div className="input-with-suffix">
                              <input
                                type="number"
                                required
                                min={-365}
                                max={365}
                                value={activity.offsetDays}
                                onChange={(e) =>
                                  updateActivity(stage.id, activity.id, {
                                    offsetDays: Number(e.target.value),
                                  })
                                }
                              />
                              <select
                                aria-label="Tipo de dias do prazo"
                                value={activity.offsetUnit ?? "calendar_days"}
                                onChange={(e) =>
                                  updateActivity(stage.id, activity.id, {
                                    offsetUnit: e.target.value as "calendar_days" | "business_days",
                                  })
                                }
                              >
                                <option value="calendar_days">dias corridos</option>
                                <option value="business_days">dias úteis</option>
                              </select>
                            </div>
                            <small>
                              Negativo = antes da data. Zero = no próprio dia. Dias úteis ignoram sábados e domingos; feriados ainda não são descontados.
                            </small>
                          </label>
                          <label className="field">
                            <span>Visibilidade no Nexo</span>
                            <select
                              value={activity.visibility}
                              onChange={(e) =>
                                updateActivity(stage.id, activity.id, {
                                  visibility: e.target.value as Visibility,
                                })
                              }
                            >
                              <option value="team">Equipe responsável</option>
                              <option value="employee">
                                Colaborador e equipe
                              </option>
                              <option value="hr">Somente RH</option>
                            </select>
                          </label>
                        </div>
                        <div className="checkbox-row">
                          <label>
                            <input
                              type="checkbox"
                              checked={activity.required}
                              disabled={activity.critical}
                              onChange={(e) =>
                                updateActivity(stage.id, activity.id, {
                                  required: e.target.checked,
                                })
                              }
                            />
                            Obrigatória para concluir a jornada
                          </label>
                          <label>
                            <input
                              type="checkbox"
                              checked={activity.critical}
                              onChange={(e) =>
                                updateActivity(stage.id, activity.id, {
                                  critical: e.target.checked,
                                  ...(e.target.checked
                                    ? { required: true }
                                    : {}),
                                })
                              }
                            />
                            Atividade crítica para o radar
                          </label>
                        </div>
                        <div className="mini-editor-heading">
                          <h4>Checklist</h4>
                          <Button
                            variant="ghost"
                            onClick={() =>
                              updateActivity(stage.id, activity.id, {
                                checklist: [
                                  ...activity.checklist,
                                  {
                                    id: crypto.randomUUID(),
                                    title: "",
                                    required: true,
                                  },
                                ],
                              })
                            }
                          >
                            <Plus size={14} />
                            Adicionar item
                          </Button>
                        </div>
                        {activity.checklist.map((item, itemIndex) => (
                          <div className="checklist-editor-row" key={item.id}>
                            <CheckCheck size={15} />
                            <input
                              aria-label={`Item ${itemIndex + 1} do checklist de ${activity.title}`}
                              required
                              value={item.title}
                              onChange={(e) =>
                                updateActivity(stage.id, activity.id, {
                                  checklist: activity.checklist.map((c) =>
                                    c.id === item.id
                                      ? { ...c, title: e.target.value }
                                      : c,
                                  ),
                                })
                              }
                              placeholder="O que precisa ser feito?"
                            />
                            <label>
                              <input
                                type="checkbox"
                                checked={item.required}
                                onChange={(e) =>
                                  updateActivity(stage.id, activity.id, {
                                    checklist: activity.checklist.map((c) =>
                                      c.id === item.id
                                        ? { ...c, required: e.target.checked }
                                        : c,
                                    ),
                                  })
                                }
                              />
                              Obrigatório
                            </label>
                            <button
                              type="button"
                              className="icon-button destructive"
                              aria-label="Remover item do checklist"
                              onClick={() =>
                                updateActivity(stage.id, activity.id, {
                                  checklist: activity.checklist.filter(
                                    (c) => c.id !== item.id,
                                  ),
                                })
                              }
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        ))}
                        <div className="mini-editor-heading">
                          <h4>Materiais e documentos</h4>
                          <Button
                            variant="ghost"
                            onClick={() =>
                              updateActivity(stage.id, activity.id, {
                                documents: [
                                  ...activity.documents,
                                  {
                                    id: crypto.randomUUID(),
                                    title: "",
                                    url: "",
                                  },
                                ],
                              })
                            }
                          >
                            <Plus size={14} />
                            Adicionar link
                          </Button>
                        </div>
                        {activity.documents.map((document, documentIndex) => (
                          <div
                            className="document-editor-row"
                            key={document.id}
                          >
                            <FileText size={16} />
                            <input
                              aria-label={`Nome do documento ${documentIndex + 1}`}
                              required
                              placeholder="Nome do material"
                              value={document.title}
                              onChange={(e) =>
                                updateActivity(stage.id, activity.id, {
                                  documents: activity.documents.map((d) =>
                                    d.id === document.id
                                      ? { ...d, title: e.target.value }
                                      : d,
                                  ),
                                })
                              }
                            />
                            <input
                              type="url"
                              pattern="https://.*"
                              aria-label={`Link do documento ${documentIndex + 1}`}
                              required
                              placeholder="https://seu-portal.bitrix24.com/..."
                              value={document.url}
                              onChange={(e) =>
                                updateActivity(stage.id, activity.id, {
                                  documents: activity.documents.map((d) =>
                                    d.id === document.id
                                      ? { ...d, url: e.target.value }
                                      : d,
                                  ),
                                })
                              }
                            />
                            <button
                              type="button"
                              className="icon-button destructive"
                              aria-label="Remover documento"
                              onClick={() =>
                                updateActivity(stage.id, activity.id, {
                                  documents: activity.documents.filter(
                                    (d) => d.id !== document.id,
                                  ),
                                })
                              }
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        ))}
                        <div className="activity-editor-footer">
                          <Button
                            variant="ghost"
                            onClick={() =>
                              updateStage(stage.id, (old) => ({
                                ...old,
                                activities: old.activities.filter(
                                  (a) => a.id !== activity.id,
                                ),
                              }))
                            }
                          >
                            <Trash2 size={14} />
                            Remover atividade
                          </Button>
                        </div>
                      </div>
                    </details>
                  ))}
                  <Button
                    variant="ghost"
                    className="add-activity"
                    onClick={() =>
                      updateStage(stage.id, (old) => ({
                        ...old,
                        activities: [...old.activities, newActivity()],
                      }))
                    }
                  >
                    <Plus size={15} />
                    Adicionar atividade
                  </Button>
                </section>
              ))}
            </div>
            <Button
              variant="secondary"
              onClick={() =>
                setDraft((old) => ({
                  ...old,
                  stages: [...old.stages, newStage()],
                }))
              }
            >
              <Plus size={16} />
              Adicionar etapa
            </Button>
            </> : <div className="template-review">
              <span className="eyebrow">Revisão final</span>
              <h3>{draft.name}</h3>
              <p>{draft.type === "onboarding" ? "Onboarding" : "Offboarding"} · perfil {draft.profile}</p>
              <div className="template-review-summary">{draft.stages.length} etapas · {draft.stages.flatMap((stage) => stage.activities).length} atividades · {draft.stages.flatMap((stage) => stage.activities).filter((activity) => activity.required).length} obrigatórias</div>
              <ol>{draft.stages.map((stage) => <li key={stage.id}><strong>{stage.title}</strong><ul>{stage.activities.map((activity) => <li key={activity.id}>{activity.title} <small>· {roleLabels[activity.assigneeRole]} · {activity.offsetDays >= 0 ? "+" : ""}{activity.offsetDays} dias {activity.offsetUnit === "business_days" ? "úteis" : "corridos"}</small></li>)}</ul></li>)}</ol>
            </div>}
            {error && (
              <div role="alert" className="form-error">
                {error}
              </div>
            )}
          </div>
        </fieldset>
        <div className="modal-footer">
          <span>
            <ShieldCheck size={15} />
            {step === 1 ? "Configure o essencial; detalhes avançados ficam dentro de cada atividade." : "Jornadas em andamento serão preservadas"}
          </span>
          <div>
            {step === 2 && !readOnly && <Button variant="ghost" onClick={() => { setError(""); setStep(1); }}>Voltar para editar</Button>}
            <Button variant="secondary" onClick={onClose}>
              Fechar
            </Button>
            {!readOnly && (
              <Button type="submit" loading={busy}>
                {step === 1 ? "Revisar modelo" : "Salvar modelo"}
                <CheckCheck size={16} />
              </Button>
            )}
          </div>
        </div>
      </form>
    </Modal>
  );
}
