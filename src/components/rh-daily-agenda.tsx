"use client";

import { ArrowRight, CalendarCheck2, Clock3, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { Journey, JourneyTask, Workspace } from "@/shared/contracts";
import { TaskBadge } from "./ui";

type AgendaItem = { journey: Journey; task: JourneyTask; overdue: boolean };

function localDateKey(value: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function deadlineLabel(value: string, timezone: string, overdue: boolean) {
  const date = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    timeZone: timezone,
  })
    .format(new Date(value))
    .replace(" de ", " ");
  const time = new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: timezone,
  }).format(new Date(value));
  return overdue ? `Vencida · ${date} · ${time}` : `Hoje · ${time}`;
}

function syncLabel(syncState: JourneyTask["syncState"]) {
  return {
    queued: "Aguardando envio ao Bitrix",
    syncing: "Sincronizando com o Bitrix",
    error: "Falha na sincronização",
    uncertain: "Confirmando no Bitrix",
    synced: "",
  }[syncState];
}

function collectItems(workspace: Workspace, now: number): AgendaItem[] {
  const today = localDateKey(new Date(now), workspace.settings.timezone);
  const items: AgendaItem[] = [];

  for (const journey of workspace.journeys) {
    if (journey.status !== "active" && journey.status !== "creating") continue;

    for (const task of journey.tasks) {
      if (task.assigneeRole !== "rh" || task.status === "completed") continue;
      const deadline = Date.parse(task.dueAt);
      if (!Number.isFinite(deadline)) continue;
      const overdue = deadline < now;
      if (!overdue && localDateKey(new Date(deadline), workspace.settings.timezone) !== today) continue;
      items.push({ journey, task, overdue });
    }
  }

  return items.sort(
    (a, b) =>
      Number(b.overdue) - Number(a.overdue) ||
      Number(b.task.critical) - Number(a.task.critical) ||
      Date.parse(a.task.dueAt) - Date.parse(b.task.dueAt),
  );
}

export function RhDailyAgenda({
  workspace,
  onTask,
  onView,
}: {
  workspace: Workspace;
  onTask: (journey: Journey, task: JourneyTask) => void;
  onView: () => void;
}) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const refresh = () => setNow(Date.now());
    refresh();
    const timer = window.setInterval(refresh, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const items = useMemo(
    () => (now === null ? [] : collectItems(workspace, now)),
    [workspace, now],
  );
  const overdue = items.filter((item) => item.overdue);
  const today = items.filter((item) => !item.overdue);
  const loading = now === null;

  return (
    <section className="rh-daily-agenda" aria-labelledby="rh-agenda-title" aria-busy={loading}>
      <header className="rh-agenda-header">
        <div className="rh-agenda-title-block">
          <span className="rh-agenda-icon" aria-hidden="true">
            <CalendarCheck2 size={19} />
          </span>
          <div>
            <h2 id="rh-agenda-title">Atividades de RH para hoje</h2>
            <p>Acompanhe as etapas de RH nas jornadas em andamento.</p>
          </div>
        </div>
        <div className="rh-agenda-header-side">
          <div className="rh-agenda-counts" aria-live="polite">
            {overdue.length > 0 && (
              <span className="rh-agenda-count overdue">
                <TriangleAlert size={14} />
                {overdue.length} atrasada{overdue.length === 1 ? "" : "s"}
              </span>
            )}
            {today.length > 0 && (
              <span className="rh-agenda-count today">
                <Clock3 size={14} />
                {today.length} para hoje
              </span>
            )}
            {!loading && items.length === 0 && (
              <span className="rh-agenda-count clear">Tudo em dia</span>
            )}
          </div>
          <button type="button" className="rh-agenda-view-all" onClick={onView}>
            Ver jornadas <ArrowRight size={14} />
          </button>
        </div>
      </header>

      {loading ? (
        <p className="rh-agenda-empty" role="status">Carregando atividades de hoje…</p>
      ) : items.length === 0 ? (
        <p className="rh-agenda-empty">Nenhuma atividade de RH atrasada ou prevista para hoje.</p>
      ) : (
        <div className="rh-agenda-groups">
          {[
            { title: "Atrasadas", entries: overdue, kind: "overdue" },
            { title: "Para hoje", entries: today, kind: "today" },
          ].map(({ title, entries, kind }) =>
            entries.length ? (
              <section className="rh-agenda-group" key={kind} aria-labelledby={`rh-agenda-${kind}`}>
                <h3 id={`rh-agenda-${kind}`}>
                  {title} <span>{entries.length}</span>
                </h3>
                <ul>
                  {entries.map(({ journey, task, overdue: isOverdue }) => (
                    <li key={task.id}>
                      <button
                        type="button"
                        className="rh-agenda-item"
                        onClick={() => onTask(journey, task)}
                        aria-label={`Abrir atividade ${task.title}, de ${journey.employee.name}, responsável ${task.assignee?.name ?? "não definido"}, ${deadlineLabel(task.dueAt, workspace.settings.timezone, isOverdue)}`}
                      >
                        <span className={`rh-agenda-deadline ${isOverdue ? "overdue" : "today"}`}>
                          {isOverdue ? <TriangleAlert size={14} /> : <Clock3 size={14} />}
                          {deadlineLabel(task.dueAt, workspace.settings.timezone, isOverdue)}
                        </span>
                        <span className="rh-agenda-task">
                          <strong>{task.title}</strong>
                          <small>{journey.employee.name} · {task.stageTitle}</small>
                        </span>
                        <span className="rh-agenda-assignee">
                          <small>Responsável</small>
                          <strong>{task.assignee?.name ?? "A definir"}</strong>
                        </span>
                        <span className="rh-agenda-state">
                          <TaskBadge status={task.status} />
                          {task.syncState !== "synced" && (
                            <small className={`rh-agenda-sync ${task.syncState}`}>
                              {syncLabel(task.syncState)}
                            </small>
                          )}
                        </span>
                        <span className="rh-agenda-open">Abrir atividade <ArrowRight size={14} /></span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null,
          )}
        </div>
      )}
    </section>
  );
}
