"use client";

import { ArrowRight, CalendarCheck2, Clock3, ExternalLink, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { shortDate } from "@/lib/format";
import { priorityForRhItem, sortRhAgendaItems } from "@/lib/rh-priority";
import type { Journey, JourneyTask, Workspace } from "@/shared/contracts";

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

function syncLabel(syncState: JourneyTask["syncState"]) {
  return {
    queued: "Aguardando envio ao Bitrix",
    syncing: "Sincronizando com o Bitrix",
    error: "Falha na sincronização",
    uncertain: "Confirmando no Bitrix",
    synced: "",
  }[syncState];
}

function collectItems(workspace: Workspace, now: number, query: string): AgendaItem[] {
  const today = localDateKey(new Date(now), workspace.settings.timezone);
  const items: AgendaItem[] = [];

  for (const journey of workspace.journeys) {
    if (journey.status !== "active" && journey.status !== "creating") continue;

    for (const task of journey.tasks) {
      if (task.assigneeRole !== "rh" || task.status === "completed") continue;
      if (query && !`${task.title} ${journey.employee.name} ${journey.employee.department}`.toLowerCase().includes(query.toLowerCase())) continue;
      const deadline = Date.parse(task.dueAt);
      if (!Number.isFinite(deadline)) continue;
      const overdue = deadline < now;
      if (!overdue && localDateKey(new Date(deadline), workspace.settings.timezone) !== today) continue;
      items.push({ journey, task, overdue });
    }
  }

  return sortRhAgendaItems(items);
}

export function RhDailyAgenda({
  workspace,
  query,
  onTask,
  onView,
}: {
  workspace: Workspace;
  query: string;
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
    () => (now === null ? [] : collectItems(workspace, now, query)),
    [workspace, now, query],
  );
  const overdue = items.filter((item) => item.overdue);
  const today = items.filter((item) => !item.overdue);
  const loading = now === null;
  const focused = items[0];

  return (
    <section className="rh-daily-agenda" aria-labelledby="rh-agenda-title" aria-busy={loading}>
      <header className="rh-agenda-simple-heading">
        <div><h2 id="rh-agenda-title">Trabalho de hoje</h2><p>Atividades de RH nas jornadas ativas.</p></div>
        <div className="rh-agenda-counts" aria-live="polite">
          {overdue.length > 0 && <span className="rh-agenda-count overdue"><TriangleAlert size={14} />{overdue.length} atrasada{overdue.length === 1 ? "" : "s"}</span>}
          {today.length > 0 && <span className="rh-agenda-count today"><Clock3 size={14} />{today.length} para hoje</span>}
          {!loading && items.length === 0 && <span className="rh-agenda-count clear">Tudo em dia</span>}
        </div>
      </header>
      {loading ? <p className="rh-agenda-empty" role="status">Carregando atividades…</p> : items.length === 0 ? (
        <div className="rh-agenda-empty-state"><span><CalendarCheck2 size={20} /></span><div><strong>Nenhuma atividade de RH para hoje</strong><p>Quando uma atividade vencer ou atrasar, ela aparecerá aqui.</p></div><button type="button" className="rh-agenda-view-all" onClick={onView}>Ver jornadas <ArrowRight size={14} /></button></div>
      ) : focused ? (
        <div className="rh-agenda-simple-list">
          {items.map((item, index) => {
            const reason = priorityForRhItem(item).reason;
            const needsReason = item.overdue || item.task.critical || item.task.syncState !== "synced";
            return <article className={`rh-work-row ${index === 0 ? "rh-work-row-focus" : ""}`} key={item.task.id}>
              <span className={`rh-work-indicator ${item.overdue ? "late" : item.task.critical ? "critical" : "due"}`} aria-hidden="true">{item.overdue ? <TriangleAlert size={16} /> : <Clock3 size={16} />}</span>
              <div className="rh-work-main"><strong>{item.task.title}</strong><span>{item.journey.employee.name} · {item.journey.type === "onboarding" ? "Entrada" : "Saída"}</span>{needsReason && <small className="rh-work-reason">{item.task.syncState !== "synced" ? syncLabel(item.task.syncState) : reason}</small>}</div>
              <div className="rh-work-meta"><span>{item.overdue ? "Vencida" : "Hoje"} · {shortDate(item.task.dueAt, workspace.settings.timezone)}</span><small>Responsável: {item.task.assignee?.name ?? "A definir"}</small></div>
              {item.task.bitrixUrl && <a className="rh-work-bitrix" href={item.task.bitrixUrl} target="_blank" rel="noreferrer" aria-label={`Abrir tarefa no Bitrix: ${item.task.title}`}><ExternalLink size={15} /></a>}
              <button className="rh-work-open" type="button" onClick={() => onTask(item.journey, item.task)}>{index === 0 ? "Abrir atividade" : "Abrir"}<ArrowRight size={15} /></button>
            </article>;
          })}
        </div>
      ) : null}
    </section>
  );
}
