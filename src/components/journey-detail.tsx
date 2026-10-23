"use client";

import { useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  Check,
  CheckCheck,
  ChevronRight,
  Clock3,
  ExternalLink,
  FileText,
  LockKeyhole,
  Play,
  RotateCcw,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import type { Journey, JourneyTask, SessionInfo } from "@/shared/contracts";
import { fullDate, roleLabels, shortDate } from "@/lib/format";
import {
  Avatar,
  Button,
  Modal,
  Progress,
  RadarBadge,
  TaskBadge,
  TypeBadge,
} from "./ui";

export type TaskAction = "start" | "complete" | "reopen" | "check" | "uncheck";

export function JourneyDetail({
  journey,
  session,
  timezone,
  initialTaskId,
  onClose,
  onTaskAction,
  onComplete,
}: {
  journey: Journey;
  session: SessionInfo;
  timezone: string;
  initialTaskId: string | null;
  onClose: () => void;
  onTaskAction: (
    task: JourneyTask,
    action: TaskAction,
    checklistId?: string,
  ) => Promise<void>;
  onComplete: () => Promise<void>;
}) {
  const [taskId, setTaskId] = useState(
    initialTaskId ||
      journey.tasks.find((t) => t.status !== "completed")?.id ||
      journey.tasks[0]?.id ||
      "",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [stageFilter, setStageFilter] = useState<number | null>(null);
  const task = journey.tasks.find((t) => t.id === taskId);
  const stages = [
    ...new Map(
      journey.tasks.map((t) => [t.stageOrder, t.stageTitle]),
    ).entries(),
  ].sort(([a], [b]) => a - b);
  const canAct =
    task &&
    (session.canManage ||
      session.role === "gestor" ||
      task.assignee?.id === session.user.id);
  const requiredLeft = journey.tasks.filter(
    (t) =>
      t.required &&
      (t.status !== "completed" ||
        t.checklist.some((c) => c.required && !c.completed)),
  ).length;
  const canCompleteTask =
    task && !task.checklist.some((c) => c.required && !c.completed);
  async function act(callback: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await callback();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Não foi possível concluir a ação.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="Detalhes da jornada" onClose={onClose} wide>
      <div className="journey-detail-header">
        <Avatar user={journey.employee} size="lg" />
        <div className="detail-person">
          <h2>{journey.employee.name}</h2>
          <p>
            {journey.employee.position || "Colaborador"}
            {journey.employee.department && ` · ${journey.employee.department}`}
          </p>
          <div>
            <TypeBadge type={journey.type} />
            <RadarBadge journey={journey} />
          </div>
        </div>
        <div className="detail-date">
          <span>
            {journey.type === "onboarding" ? "Admissão" : "Desligamento"}
          </span>
          <strong>
            <CalendarDays size={15} />
            {fullDate(journey.referenceDate, timezone)}
          </strong>
          <small>
            {journey.source === "approval"
              ? "Iniciada por aprovação no Bitrix"
              : "Iniciada pelo RH"}
          </small>
        </div>
      </div>
      <div className="journey-progress-summary">
        <span>
          {journey.completedCount} de {journey.taskCount} atividades concluídas
        </span>
        <Progress value={journey.progress} />
        <small>
          {journey.templateName} · {journey.templateProfile} · v{journey.templateVersion}
        </small>
      </div>
      <div className="journey-detail-layout">
        <aside className="detail-stages">
          <h3>Etapas da jornada</h3>
          <button
            className={
              stageFilter === null ? "stage-filter selected" : "stage-filter"
            }
            onClick={() => setStageFilter(null)}
          >
            <span className="stage-number">
              <CheckCheck size={15} />
            </span>
            <span>Todas as atividades</span>
            <small>{journey.tasks.length}</small>
          </button>
          {stages.map(([stageOrder, stage], index) => {
            const tasks = journey.tasks.filter(
              (t) => t.stageOrder === stageOrder,
            );
            const done = tasks.filter((t) => t.status === "completed").length;
            return (
              <button
                className={`stage-filter ${stageFilter === stageOrder ? "selected" : ""}`}
                key={stageOrder}
                onClick={() => {
                  setStageFilter(stageOrder);
                  const first = tasks[0];
                  if (first) setTaskId(first.id);
                }}
              >
                <span
                  className={`stage-number ${done === tasks.length ? "done" : ""}`}
                >
                  {done === tasks.length ? <Check size={15} /> : index + 1}
                </span>
                <span>
                  {stage}
                  <small>
                    {done}/{tasks.length} concluídas
                  </small>
                </span>
              </button>
            );
          })}
          <div className="detail-origin">
            <ShieldCheck size={17} />
            <p>As atividades estão vinculadas às tarefas do seu Bitrix24.</p>
            {journey.sourceUrl && (
              <a href={journey.sourceUrl} target="_blank" rel="noreferrer">
                Ver movimentação
                <ExternalLink size={12} />
              </a>
            )}
          </div>
        </aside>
        <div className="detail-activities">
          <div className="detail-activity-list">
            {journey.tasks
              .filter(
                (t) => stageFilter === null || t.stageOrder === stageFilter,
              )
              .map((t) => (
                <button
                  key={t.id}
                  className={`detail-activity-row ${task?.id === t.id ? "selected" : ""}`}
                  onClick={() => setTaskId(t.id)}
                >
                  <span
                    className={`task-circle ${t.status === "completed" ? "checked" : ""}`}
                  >
                    {t.status === "completed" && <Check size={13} />}
                  </span>
                  <span>
                    <strong>{t.title}</strong>
                    <small>
                      {t.assignee?.name || "Responsável não definido"} ·{" "}
                      {shortDate(t.dueAt, timezone)}
                    </small>
                  </span>
                  {t.critical && (
                    <TriangleAlert size={14} className="text-amber" />
                  )}
                  <ChevronRight size={14} />
                </button>
              ))}
          </div>
          {task && (
            <section className="task-inspector">
              <div className="inspector-heading">
                <span className="eyebrow">{task.stageTitle}</span>
                <TaskBadge status={task.status} />
              </div>
              {task.bitrixStageTitle && <p className="kanban-stage-label"><span>Coluna no Kanban</span><strong>{task.bitrixStageTitle}</strong></p>}
              <h3>{task.title}</h3>
              {task.description && (
                <p className="task-description">{task.description}</p>
              )}
              <div className="task-metadata">
                <div>
                  <span>Responsável</span>
                  <strong>
                    {task.assignee ? (
                      <>
                        <Avatar user={task.assignee} size="sm" />
                        {task.assignee.name}
                      </>
                    ) : (
                      "A definir"
                    )}
                  </strong>
                  <small>{roleLabels[task.assigneeRole]}</small>
                </div>
                <div>
                  <span>Prazo</span>
                  <strong>
                    <Clock3 size={15} />
                    {fullDate(task.dueAt, timezone)}
                  </strong>
                  <small>
                    {task.required
                      ? "Atividade obrigatória"
                      : "Atividade opcional"}
                  </small>
                </div>
              </div>
              {task.checklist.length > 0 && (
                <div className="task-checklist">
                  <h4>
                    Checklist{" "}
                    <span>
                      {task.checklist.filter((c) => c.completed).length}/
                      {task.checklist.length}
                    </span>
                  </h4>
                  {task.checklist.map((item) => (
                    <label
                      key={item.id}
                      className={`checklist-item ${item.completed ? "checked" : ""}`}
                    >
                      <input
                        type="checkbox"
                        checked={item.completed}
                        disabled={
                          busy ||
                          !canAct ||
                          !task.bitrixTaskId ||
                          !item.bitrixId
                        }
                        onChange={() =>
                          act(() =>
                            onTaskAction(
                              task,
                              item.completed ? "uncheck" : "check",
                              item.id,
                            ),
                          )
                        }
                      />
                      <span>
                        {item.title}
                        {!item.required && <small>Opcional</small>}
                      </span>
                    </label>
                  ))}
                </div>
              )}
              {task.documents.length > 0 && (
                <div className="task-documents">
                  <h4>Materiais e orientações</h4>
                  {task.documents.map((doc) => (
                    <a
                      key={doc.id}
                      href={doc.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <FileText size={17} />
                      <span>{doc.title}</span>
                      <ExternalLink size={13} />
                    </a>
                  ))}
                </div>
              )}
              {task.visibility === "hr" && (
                <div className="privacy-note">
                  <LockKeyhole size={14} />
                  Visível apenas ao RH autorizado
                </div>
              )}
              {task.syncState !== "synced" && (
                <div
                  className={`info-strip ${["error", "uncertain"].includes(task.syncState) ? "warning" : ""}`}
                >
                  <Clock3 size={17} />
                  <p>
                    {task.errorMessage ||
                      {
                        queued:
                          "Criação no Bitrix24 em fila. As ações serão liberadas após a confirmação.",
                        syncing: "Sincronizando com o Bitrix24…",
                        error:
                          "Esta atividade precisa de uma nova sincronização.",
                        uncertain:
                          "O Nexo está conciliando o resultado da criação para evitar duplicação.",
                        synced: "",
                      }[task.syncState]}
                  </p>
                </div>
              )}
              {error && (
                <div role="alert" className="form-error">
                  {error}
                </div>
              )}
              <div className="task-actions">
                {task.bitrixUrl && (
                  <a
                    href={task.bitrixUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="button button-secondary"
                  >
                    Abrir no Bitrix
                    <ExternalLink size={14} />
                  </a>
                )}
                {canAct && task.bitrixTaskId && (
                  <>
                    {task.status === "pending" && (
                      <Button
                        variant="secondary"
                        loading={busy}
                        onClick={() => act(() => onTaskAction(task, "start"))}
                      >
                        <Play size={14} />
                        Iniciar
                      </Button>
                    )}
                    {task.status === "completed" ? (
                      <Button
                        variant="ghost"
                        loading={busy}
                        onClick={() => act(() => onTaskAction(task, "reopen"))}
                      >
                        <RotateCcw size={14} />
                        Reabrir
                      </Button>
                    ) : task.status === "awaiting_review" ? (
                      <span className="field-help">
                        Aguardando aprovação no Bitrix
                      </span>
                    ) : (
                      <Button
                        loading={busy}
                        disabled={!canCompleteTask}
                        title={
                          !canCompleteTask
                            ? "Conclua os itens obrigatórios do checklist"
                            : undefined
                        }
                        onClick={() =>
                          act(() => onTaskAction(task, "complete"))
                        }
                      >
                        <Check size={16} />
                        Concluir atividade
                      </Button>
                    )}
                  </>
                )}
              </div>
            </section>
          )}
        </div>
      </div>
      <div className="modal-footer">
        <span>
          {journey.status === "completed" ? (
            <>
              <CheckCheck size={16} />
              Jornada concluída
            </>
          ) : (
            `${requiredLeft} atividades obrigatórias pendentes`
          )}
        </span>
        {session.canManage && journey.status !== "completed" && (
          <Button
            disabled={requiredLeft > 0 || busy || journey.status === "creating"}
            loading={busy}
            onClick={() => act(onComplete)}
          >
            Concluir jornada
            <ArrowRight size={15} />
          </Button>
        )}
      </div>
    </Modal>
  );
}
