"use client";

import { ArrowUpRight, Clock3, ExternalLink, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { Journey, JourneyTask, JourneyType, Workspace } from "@/shared/contracts";

type QueueItem = {
  journey: Journey;
  task: JourneyTask;
  reason: string;
  overdue: boolean;
};

function isComplete(task: JourneyTask) {
  return task.status === "completed" && task.syncState === "synced" &&
    Boolean(task.bitrixTaskId) && task.checklist.every((item) => !item.required || item.completed);
}

function deadlineLabel(value: string, timezone: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: timezone,
  }).format(new Date(value)).replace(" de ", " ");
}

function buildQueue(workspace: Workspace, now: number): QueueItem[] {
  const items = new Map<string, QueueItem>();
  for (const alert of workspace.alerts) {
    const journey = workspace.journeys.find((item) => item.id === alert.journeyId);
    const task = journey?.tasks.find((item) => item.id === alert.taskId);
    if (journey && task) items.set(task.id, { journey, task, reason: alert.reason, overdue: true });
  }
  for (const journey of workspace.journeys) {
    if (journey.status !== "active" && journey.status !== "creating") continue;
    for (const task of journey.tasks) {
      const due = Date.parse(task.dueAt);
      if (task.assigneeRole !== "ti" || isComplete(task) || due < now || due > now + 48 * 60 * 60 * 1000) continue;
      if (!items.has(task.id)) items.set(task.id, { journey, task, reason: "Tarefa de TI vence nas próximas 48 horas", overdue: false });
    }
  }
  return [...items.values()].sort((a, b) => Number(b.overdue) - Number(a.overdue) || Number(b.task.critical) - Number(a.task.critical) || Date.parse(a.task.dueAt) - Date.parse(b.task.dueAt));
}

export function ReadinessQueue({ workspace, onJourney }: { workspace: Workspace; onJourney: (journey: Journey) => void }) {
  const [filter, setFilter] = useState<"all" | JourneyType>("all");
  const [now, setNow] = useState(0);
  useEffect(() => {
    const first = window.setTimeout(() => setNow(Date.now()), 0);
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => { window.clearTimeout(first); window.clearInterval(timer); };
  }, []);
  const items = useMemo(() => buildQueue(workspace, now), [workspace, now]);
  const filtered = filter === "all" ? items : items.filter((item) => item.journey.type === filter);
  const overdueCount = items.filter((item) => item.overdue).length;
  const dueSoonCount = items.length - overdueCount;

  return (
    <section className="readiness-queue" aria-labelledby="readiness-title">
      <div className="readiness-header">
        <div className="readiness-title-block">
          <span className="readiness-icon" aria-hidden="true"><Clock3 size={19} /></span>
          <div>
            <h2 id="readiness-title">Próximos prazos e pendências</h2>
            <p>O que pede atenção agora, começando pelos acessos de TI.</p>
          </div>
        </div>
        <div className="readiness-summary" aria-live="polite">
          {overdueCount > 0 && <span className="readiness-count overdue"><TriangleAlert size={14} />{overdueCount} atrasada{overdueCount === 1 ? "" : "s"}</span>}
          {dueSoonCount > 0 && <span className="readiness-count soon"><Clock3 size={14} />{dueSoonCount} nas próximas 48 h</span>}
          {!items.length && <span className="readiness-count clear">Tudo em dia</span>}
        </div>
      </div>

      {items.length > 0 && (
        <div className="readiness-controls" aria-label="Filtrar prazos por jornada">
          <button type="button" aria-pressed={filter === "all"} onClick={() => setFilter("all")}>Todas <span>{items.length}</span></button>
          <button type="button" aria-pressed={filter === "onboarding"} onClick={() => setFilter("onboarding")}>Entradas <span>{items.filter((item) => item.journey.type === "onboarding").length}</span></button>
          <button type="button" aria-pressed={filter === "offboarding"} onClick={() => setFilter("offboarding")}>Saídas <span>{items.filter((item) => item.journey.type === "offboarding").length}</span></button>
        </div>
      )}

      {filtered.length ? (
        <ul className="readiness-list">
          {filtered.slice(0, 6).map(({ journey, task, reason, overdue }) => (
            <li className="readiness-row" key={task.id}>
              <button type="button" className="readiness-open" onClick={() => onJourney(journey)} aria-label={`Abrir jornada de ${journey.employee.name}: ${task.title}`}>
                <span className={`readiness-type ${journey.type}`}>{journey.type === "onboarding" ? "Entrada" : "Saída"}</span>
                <span className="readiness-task">
                  <strong>{task.title}</strong>
                  <small>{journey.employee.name} · {task.assignee?.name ?? "Responsável pendente"}</small>
                </span>
                <span className={`readiness-reason ${overdue ? "late" : "upcoming"}`}>
                  {overdue ? <TriangleAlert size={14} /> : <Clock3 size={14} />}
                  {reason}
                </span>
                <span className="readiness-deadline">{deadlineLabel(task.dueAt, workspace.settings.timezone)}</span>
                <ArrowUpRight className="readiness-arrow" size={17} aria-hidden="true" />
              </button>
              {task.bitrixUrl && <a className="readiness-bitrix" href={task.bitrixUrl} target="_blank" rel="noreferrer" aria-label={`Abrir tarefa ${task.title} no Bitrix24`}><ExternalLink size={14} /> Bitrix</a>}
            </li>
          ))}
        </ul>
      ) : (
        <div className="readiness-empty">
          <span className="readiness-empty-mark"><Clock3 size={18} /></span>
          <p>{items.length ? "Nenhum prazo nesta categoria. Escolha outro filtro." : "Não há prazos vencidos nem tarefas de TI para as próximas 48 horas."}</p>
        </div>
      )}
      {filtered.length > 6 && <p className="readiness-more">Mostrando 6 de {filtered.length}. Os próximos prazos estão priorizados.</p>}
    </section>
  );
}
