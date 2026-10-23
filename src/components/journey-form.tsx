"use client";

import { useState, type FormEvent } from "react";
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Layers3,
  ShieldCheck,
  Users,
  Sparkles,
  ArrowUp,
  ArrowDown,
  LoaderCircle,
  X,
} from "lucide-react";
import type {
  AssigneeRole,
  CreateJourneyInput,
  JourneyType,
  TrailSuggestion,
  Workspace,
} from "@/shared/contracts";
import { roleLabels } from "@/lib/format";
import { Button, Modal } from "./ui";

export function JourneyForm({
  workspace,
  onClose,
  onSubmit,
  aiConfigured,
  onSuggestTrail,
}: {
  workspace: Workspace;
  onClose: () => void;
  onSubmit: (value: CreateJourneyInput) => Promise<void>;
  aiConfigured: boolean;
  onSuggestTrail: (
    description: string,
    templateId: string,
  ) => Promise<TrailSuggestion>;
}) {
  const [type, setType] = useState<JourneyType>("onboarding");
  const [step, setStep] = useState<1 | 2>(1);
  const [templateId, setTemplateId] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [referenceDate, setReferenceDate] = useState("");
  const [assignees, setAssignees] = useState<
    Partial<Record<AssigneeRole, string>>
  >({ ...workspace.settings.defaultAssignees });
  const [requestId] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [description, setDescription] = useState("");
  const [suggestion, setSuggestion] = useState<TrailSuggestion | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const template = workspace.templates.find((t) => t.id === templateId);
  const selectedEmployee = workspace.users.find(
    (user) => user.id === employeeId,
  );
  const activities = template?.stages.flatMap((s) => s.activities) || [];
  const selectedRecommendations = suggestion?.activities ?? [];
  const plannedActivities =
    suggestion && template
      ? selectedRecommendations
          .map((rec) => ({
            rec,
            activity: activities.find((a) => a.id === rec.activityId),
            stage: template.stages.find((stage) => stage.id === rec.stageId),
          }))
          .filter(
            (
              entry,
            ): entry is {
              rec: (typeof selectedRecommendations)[number];
              activity: NonNullable<typeof entry.activity>;
              stage: NonNullable<typeof entry.stage>;
            } => Boolean(entry.activity && entry.stage),
          )
          .sort((a, b) => a.rec.order - b.rec.order)
      : [];
  const roles = [
    ...new Set(
      (suggestion
        ? plannedActivities.map((entry) => entry.activity)
        : activities
      ).map((a) => a.assigneeRole),
    ),
  ];
  async function buildSuggestion() {
    setError("");
    if (!template || !description.trim()) {
      setError(
        "Selecione um modelo de onboarding e informe a descrição da vaga.",
      );
      return;
    }
    setSuggesting(true);
    try {
      setSuggestion(await onSuggestTrail(description, template.id));
      setDescription("");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Não foi possível montar a trilha. Você pode continuar manualmente.",
      );
    } finally {
      setSuggesting(false);
    }
  }
  function chooseType(value: JourneyType) {
    setType(value);
    setTemplateId("");
    setSuggestion(null);
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (!template || !employeeId || !referenceDate) {
      setError("Selecione pessoa, modelo e data para continuar.");
      return;
    }
    if (step === 1) {
      setStep(2);
      return;
    }
    if (roles.some((role) => !assignees[role])) {
      setError("Defina os responsáveis por área antes de iniciar.");
      return;
    }
    setBusy(true);
    try {
      await onSubmit({
        requestId,
        type,
        templateId,
        employeeId,
        referenceDate,
        assignees,
        ...(suggestion
          ? {
              approvedTrail: {
                ...suggestion,
                activities: suggestion.activities.filter(
                  (item) =>
                    activities.find(
                      (activity) => activity.id === item.activityId,
                    )?.required ||
                    selectedRecommendations.some(
                      (selected) => selected.activityId === item.activityId,
                    ),
                ),
                competencies: suggestion.competencies.map((competency) => ({
                  ...competency,
                  activityIds: competency.activityIds.filter((id) =>
                    suggestion.activities.some(
                      (item) => item.activityId === id,
                    ),
                  ),
                })),
              },
            }
          : {}),
      });
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Não foi possível iniciar a jornada.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Nova jornada"
      description="Você define o começo. O Nexo organiza as próximas etapas."
      onClose={() => {
        if (!busy) onClose();
      }}
      wide
    >
      <form onSubmit={submit}>
        <div className="modal-body">
          <div className="journey-type-picker">
            <button
              type="button"
              className={type === "onboarding" ? "selected" : ""}
              onClick={() => chooseType("onboarding")}
            >
              <ArrowDownLeft size={22} />
              <span>
                <strong>Onboarding</strong>
                <small>Uma chegada bem preparada</small>
              </span>
              <span className="radio-indicator" />
            </button>
            <button
              type="button"
              className={type === "offboarding" ? "selected" : ""}
              onClick={() => chooseType("offboarding")}
            >
              <ArrowUpRight size={22} />
              <span>
                <strong>Offboarding</strong>
                <small>Uma transição organizada</small>
              </span>
              <span className="radio-indicator" />
            </button>
          </div>
          {step === 1 && (
            <>
              <div className="form-grid">
                <label className="field">
                  <span>
                    Colaborador <i>*</i>
                  </span>
                  <select
                    required
                    value={employeeId}
                    onChange={(e) => {
                      setEmployeeId(e.target.value);
                      setAssignees((old) => ({
                        ...old,
                        colaborador: e.target.value,
                      }));
                    }}
                  >
                    <option value="">Selecione no Bitrix24</option>
                    {workspace.users
                      .filter((u) => u.active)
                      .map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name}
                          {u.position ? ` · ${u.position}` : ""}
                        </option>
                      ))}
                  </select>
                </label>
                <label className="field">
                  <span>
                    {type === "onboarding"
                      ? "Data de admissão"
                      : "Data de desligamento"}{" "}
                    <i>*</i>
                  </span>
                  <input
                    type="date"
                    required
                    value={referenceDate}
                    onChange={(e) => setReferenceDate(e.target.value)}
                  />
                </label>
              </div>
              {selectedEmployee && (
                <div className="employee-context">
                  <Users size={16} />
                  <span>
                    <strong>
                      {selectedEmployee.position || "Cargo não informado"}
                    </strong>
                    <small>
                      {selectedEmployee.department ||
                        "Departamento não informado"}{" "}
                      · dados do Bitrix24
                    </small>
                  </span>
                </div>
              )}
              <label className="field">
                <span>
                  Modelo da jornada <i>*</i>
                </span>
                <select
                  required
                  value={templateId}
                  onChange={(e) => setTemplateId(e.target.value)}
                >
                  <option value="">Selecione um modelo</option>
                  {workspace.templates
                    .filter((t) => t.type === type)
                    .map((t) => (
                      <option value={t.id} key={t.id}>
                        {t.name} · {t.profile} · versão {t.version}
                      </option>
                    ))}
                </select>
              </label>
              {template && (
                <div className="template-preview">
                  <Layers3 size={19} />
                  <div>
                    <strong>{template.name}</strong>
                    <p>
                      {template.stages.length} etapas · {activities.length}{" "}
                      atividades · {activities.filter((a) => a.critical).length}{" "}
                      críticas
                    </p>
                  </div>
                  <span className="subtle-label">v{template.version}</span>
                </div>
              )}
              {type === "onboarding" && (
                <section
                  className="ai-trail-prompt"
                  aria-label="Trilha guiada por IA"
                >
                  <div>
                    <span className="ai-trail-icon">
                      <Sparkles size={17} />
                    </span>
                    <div>
                      <strong>Trilha guiada por competências</strong>
                      <p>
                        {aiConfigured
                          ? "Use a descrição da vaga para sugerir atividades do modelo. Você revisa tudo antes de criar tarefas."
                          : "A sugestão por IA ainda não foi configurada. O fluxo manual está disponível."}
                      </p>
                    </div>
                  </div>
                  {aiConfigured && (
                    <>
                      <label className="field">
                        <span>
                          Descrição da vaga{" "}
                          <small>
                            até 12.000 caracteres · não será salva pelo Nexo
                          </small>
                        </span>
                        <textarea
                          value={description}
                          onChange={(event) =>
                            setDescription(event.target.value)
                          }
                          maxLength={12000}
                          rows={4}
                          placeholder="Cole aqui responsabilidades, habilidades e resultados esperados para o cargo."
                        />
                      </label>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => void buildSuggestion()}
                        loading={suggesting}
                        disabled={
                          !template ||
                          suggesting ||
                          description.trim().length < 30
                        }
                      >
                        <Sparkles size={15} />
                        {suggestion
                          ? "Gerar nova sugestão"
                          : "Montar trilha com IA"}
                      </Button>
                    </>
                  )}
                </section>
              )}
            </>
          )}
          {step === 2 && template && (
            <>
              <div className="journey-review-heading">
                <span>Passo 2 de 2</span>
                <h3>Revise o plano de trabalho</h3>
                <p>
                  {template.name} · perfil {template.profile} ·{" "}
                  {selectedEmployee?.name}
                </p>
              </div>
              {suggestion ? (
                <div className="ai-trail-review">
                  <div className="ai-trail-review-head">
                    <Sparkles size={17} />
                    <div>
                      <strong>Proposta pronta para revisão</strong>
                      <small>
                        Baseada em {template.profile}; confirme atividades,
                        prazos e responsáveis antes de iniciar.
                      </small>
                    </div>
                  </div>
                  <div className="ai-competencies">
                    {suggestion.competencies.map((item) => (
                      <span key={item.name}>
                        {item.name}
                        <small>
                          {item.importance === "essential"
                            ? "essencial"
                            : item.importance === "important"
                              ? "importante"
                              : "adicional"}
                        </small>
                      </span>
                    ))}
                  </div>
                  {suggestion.gaps.length > 0 && (
                    <div className="ai-gaps">
                      <strong>O modelo não cobre</strong>
                      <p>
                        {suggestion.gaps.join(" · ")} — avalie incluir
                        atividades ao modelo antes de iniciar.
                      </p>
                    </div>
                  )}
                  <div className="journey-review-list">
                    {template.stages.map((stage, index) => {
                      const rows = plannedActivities.filter(
                        (entry) => entry.stage.id === stage.id,
                      );
                      return rows.length ? (
                        <section key={stage.id}>
                          <h4>
                            <span>{index + 1}</span>
                            {stage.title}
                          </h4>
                          {rows.map(({ activity, rec }, rowIndex) => (
                            <div className="ai-activity-row" key={activity.id}>
                              <div>
                                <strong>{activity.title}</strong>
                                <small>{rec.reason}</small>
                                {activity.documents.length > 0 && (
                                  <small>
                                    Materiais:{" "}
                                    {activity.documents
                                      .map((document) => document.title)
                                      .join(" · ")}
                                  </small>
                                )}
                                <label className="ai-offset">
                                  Prazo relativo{" "}
                                  <input
                                    type="number"
                                    min={-365}
                                    max={365}
                                    value={rec.offsetDays}
                                    onChange={(event) =>
                                      setSuggestion(
                                        (current) =>
                                          current && {
                                            ...current,
                                            activities: current.activities.map(
                                              (item) =>
                                                item.activityId ===
                                                rec.activityId
                                                  ? {
                                                      ...item,
                                                      offsetDays: Number(
                                                        event.target.value,
                                                      ),
                                                    }
                                                  : item,
                                            ),
                                          },
                                      )
                                    }
                                  />
                                  <select
                                    aria-label={`Unidade do prazo de ${activity.title}`}
                                    value={rec.offsetUnit ?? "calendar_days"}
                                    onChange={(event) =>
                                      setSuggestion(
                                        (current) =>
                                          current && {
                                            ...current,
                                            activities: current.activities.map(
                                              (item) =>
                                                item.activityId ===
                                                rec.activityId
                                                  ? {
                                                      ...item,
                                                      offsetUnit: event.target
                                                        .value as
                                                        | "calendar_days"
                                                        | "business_days",
                                                    }
                                                  : item,
                                            ),
                                          },
                                      )
                                    }
                                  >
                                    <option value="calendar_days">
                                      dias corridos
                                    </option>
                                    <option value="business_days">
                                      dias úteis
                                    </option>
                                  </select>
                                </label>
                              </div>
                              <div className="ai-row-actions">
                                {!activity.required && (
                                  <button
                                    type="button"
                                    className="icon-button destructive"
                                    aria-label={`Remover ${activity.title} da trilha`}
                                    onClick={() =>
                                      setSuggestion(
                                        (current) =>
                                          current && {
                                            ...current,
                                            activities:
                                              current.activities.filter(
                                                (item) =>
                                                  item.activityId !==
                                                  activity.id,
                                              ),
                                            competencies:
                                              current.competencies.map(
                                                (item) => ({
                                                  ...item,
                                                  activityIds:
                                                    item.activityIds.filter(
                                                      (id) =>
                                                        id !== activity.id,
                                                    ),
                                                }),
                                              ),
                                          },
                                      )
                                    }
                                  >
                                    <X size={15} />
                                  </button>
                                )}
                                <button
                                  type="button"
                                  className="icon-button"
                                  aria-label={`Mover ${activity.title} para cima`}
                                  disabled={rowIndex === 0}
                                  onClick={() =>
                                    setSuggestion((current) => {
                                      if (!current) return current;
                                      const stageRows = current.activities
                                        .filter(
                                          (item) => item.stageId === stage.id,
                                        )
                                        .sort((a, b) => a.order - b.order);
                                      const currentIndex = stageRows.findIndex(
                                        (item) =>
                                          item.activityId === activity.id,
                                      );
                                      if (currentIndex <= 0) return current;
                                      [
                                        stageRows[currentIndex - 1],
                                        stageRows[currentIndex],
                                      ] = [
                                        stageRows[currentIndex]!,
                                        stageRows[currentIndex - 1]!,
                                      ];
                                      const order = new Map(
                                        stageRows.map((item, i) => [
                                          item.activityId,
                                          i,
                                        ]),
                                      );
                                      return {
                                        ...current,
                                        activities: current.activities.map(
                                          (item) =>
                                            order.has(item.activityId)
                                              ? {
                                                  ...item,
                                                  order: order.get(
                                                    item.activityId,
                                                  )!,
                                                }
                                              : item,
                                        ),
                                      };
                                    })
                                  }
                                >
                                  <ArrowUp size={15} />
                                </button>
                                <button
                                  type="button"
                                  className="icon-button"
                                  aria-label={`Mover ${activity.title} para baixo`}
                                  disabled={rowIndex === rows.length - 1}
                                  onClick={() =>
                                    setSuggestion((current) => {
                                      if (!current) return current;
                                      const stageRows = current.activities
                                        .filter(
                                          (item) => item.stageId === stage.id,
                                        )
                                        .sort((a, b) => a.order - b.order);
                                      const currentIndex = stageRows.findIndex(
                                        (item) =>
                                          item.activityId === activity.id,
                                      );
                                      if (
                                        currentIndex < 0 ||
                                        currentIndex >= stageRows.length - 1
                                      )
                                        return current;
                                      [
                                        stageRows[currentIndex + 1],
                                        stageRows[currentIndex],
                                      ] = [
                                        stageRows[currentIndex]!,
                                        stageRows[currentIndex + 1]!,
                                      ];
                                      const order = new Map(
                                        stageRows.map((item, i) => [
                                          item.activityId,
                                          i,
                                        ]),
                                      );
                                      return {
                                        ...current,
                                        activities: current.activities.map(
                                          (item) =>
                                            order.has(item.activityId)
                                              ? {
                                                  ...item,
                                                  order: order.get(
                                                    item.activityId,
                                                  )!,
                                                }
                                              : item,
                                        ),
                                      };
                                    })
                                  }
                                >
                                  <ArrowDown size={15} />
                                </button>
                              </div>
                            </div>
                          ))}
                        </section>
                      ) : null;
                    })}
                  </div>
                </div>
              ) : (
                <div className="journey-review-list">
                  {template.stages.map((stage, index) => (
                    <section key={stage.id}>
                      <h4>
                        <span>{index + 1}</span>
                        {stage.title}
                      </h4>
                      {stage.activities.map((activity) => (
                        <div key={activity.id}>
                          <strong>{activity.title}</strong>
                          <small>
                            {roleLabels[activity.assigneeRole]} ·{" "}
                            {activity.offsetDays >= 0 ? "+" : ""}
                            {activity.offsetDays} dias{" "}
                            {activity.offsetUnit === "business_days"
                              ? "úteis"
                              : "corridos"}
                            {activity.required
                              ? " · obrigatória"
                              : " · opcional"}
                          </small>
                        </div>
                      ))}
                    </section>
                  ))}
                </div>
              )}
            </>
          )}
          {step === 2 && (
            <>
              <div className="form-section-heading">
                <Users size={17} />
                <h3>Responsáveis por área</h3>
              </div>
              <p className="field-help">
                Cada atividade será atribuída a um usuário real do seu portal.
              </p>
              <div className="form-grid">
                {roles.map((role) => (
                  <label className="field" key={role}>
                    <span>
                      {roleLabels[role]} <i>*</i>
                    </span>
                    <select
                      required
                      value={assignees[role] || ""}
                      onChange={(e) =>
                        setAssignees((old) => ({
                          ...old,
                          [role]: e.target.value,
                        }))
                      }
                    >
                      <option value="">Selecione o responsável</option>
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
              <div className="info-strip">
                <ShieldCheck size={18} />
                <p>
                  As tarefas serão criadas no Bitrix24 com os prazos calculados
                  a partir da data principal. Você poderá acompanhar toda a
                  execução aqui.
                </p>
              </div>
            </>
          )}
          {error && (
            <div className="form-error" role="alert">
              {error}
            </div>
          )}
        </div>
        <div className="modal-footer">
          <span>
            <CalendarDays size={15} />
            {suggesting ? (
              <>
                <LoaderCircle size={15} /> Analisando descrição
              </>
            ) : step === 1 ? (
              "Prazos relativos à data principal"
            ) : (
              `Passo ${step} de 2`
            )}
          </span>
          <div>
            {step === 2 && (
              <Button
                variant="ghost"
                onClick={() => {
                  setError("");
                  setStep(1);
                }}
                disabled={busy}
              >
                Voltar
              </Button>
            )}
            <Button variant="secondary" onClick={onClose} disabled={busy}>
              Cancelar
            </Button>
            <Button
              type={step === 1 ? "button" : "submit"}
              onClick={
                step === 1
                  ? (event) => {
                      event.preventDefault();
                      setError("");
                      if (template && employeeId && referenceDate) setStep(2);
                      else
                        setError(
                          "Selecione pessoa, modelo e data para continuar.",
                        );
                    }
                  : undefined
              }
              loading={busy && step === 2}
              disabled={!workspace.templates.some((t) => t.type === type)}
            >
              {step === 1 ? "Revisar atividades" : "Iniciar jornada"}
              <ArrowRight size={16} />
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
