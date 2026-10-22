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
} from "lucide-react";
import type {
  AssigneeRole,
  CreateJourneyInput,
  JourneyType,
  Workspace,
} from "@/shared/contracts";
import { roleLabels } from "@/lib/format";
import { Button, Modal } from "./ui";

export function JourneyForm({
  workspace,
  onClose,
  onSubmit,
}: {
  workspace: Workspace;
  onClose: () => void;
  onSubmit: (value: CreateJourneyInput) => Promise<void>;
}) {
  const [type, setType] = useState<JourneyType>("onboarding");
  const [templateId, setTemplateId] = useState(
    workspace.templates.find((t) => t.type === "onboarding")?.id || "",
  );
  const [employeeId, setEmployeeId] = useState("");
  const [referenceDate, setReferenceDate] = useState("");
  const [assignees, setAssignees] = useState<
    Partial<Record<AssigneeRole, string>>
  >({ ...workspace.settings.defaultAssignees });
  const [requestId] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const template = workspace.templates.find((t) => t.id === templateId);
  const activities = template?.stages.flatMap((s) => s.activities) || [];
  const roles = [...new Set(activities.map((a) => a.assigneeRole))];
  function chooseType(value: JourneyType) {
    setType(value);
    setTemplateId(workspace.templates.find((t) => t.type === value)?.id || "");
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (
      !template ||
      !employeeId ||
      !referenceDate ||
      roles.some((role) => !assignees[role])
    ) {
      setError(
        "Selecione pessoa, modelo, data e todos os responsáveis para continuar.",
      );
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
                    {t.name} · versão {t.version}
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
                    setAssignees((old) => ({ ...old, [role]: e.target.value }))
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
          {template && (
            <div className="journey-preview-stages">
              {template.stages.map((stage, index) => (
                <div key={stage.id}>
                  <span>{index + 1}</span>
                  <div>
                    <strong>{stage.title}</strong>
                    <small>{stage.activities.length} atividades</small>
                  </div>
                  {index < template.stages.length - 1 && (
                    <ArrowRight size={15} />
                  )}
                </div>
              ))}
            </div>
          )}
          <div className="info-strip">
            <ShieldCheck size={18} />
            <p>
              As tarefas serão criadas no Bitrix24 com os prazos calculados a
              partir da data principal. Você poderá acompanhar toda a execução
              aqui.
            </p>
          </div>
          {error && (
            <div className="form-error" role="alert">
              {error}
            </div>
          )}
        </div>
        <div className="modal-footer">
          <span>
            <CalendarDays size={15} />
            Prazos em dias corridos
          </span>
          <div>
            <Button variant="secondary" onClick={onClose} disabled={busy}>
              Cancelar
            </Button>
            <Button
              type="submit"
              loading={busy}
              disabled={!workspace.templates.some((t) => t.type === type)}
            >
              Iniciar jornada
              <ArrowRight size={16} />
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
