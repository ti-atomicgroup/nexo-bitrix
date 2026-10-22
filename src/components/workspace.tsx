"use client";

import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  CheckCheck,
  ChevronRight,
  CircleCheck,
  Clock3,
  Layers3,
  Plus,
  Route,
  Search,
  TriangleAlert,
  Zap,
} from "lucide-react";
import { useState } from "react";
import type {
  Journey,
  JourneyTask,
  JourneyType,
  Workspace,
} from "@/shared/contracts";
import { fullDate, shortDate, timeAgo } from "@/lib/format";
import {
  Avatar,
  Button,
  EmptyState,
  Progress,
  RadarBadge,
  SectionHeader,
  TaskBadge,
  TypeBadge,
} from "./ui";
import { ReadinessQueue } from "./readiness-queue";
import { RhDailyAgenda } from "./rh-daily-agenda";

export type View =
  "overview" | "journeys" | "tasks" | "templates" | "automations" | "settings";
type Shared = {
  workspace: Workspace;
  onJourney: (journey: Journey, task?: JourneyTask) => void;
  onCreate: () => void;
  query: string;
};

export function JourneyTable({
  journeys,
  onJourney,
  timezone,
}: {
  journeys: Journey[];
  onJourney: (journey: Journey) => void;
  timezone: string;
}) {
  return (
    <div className="table-scroll">
      <table className="journey-table">
        <thead>
          <tr>
            <th>Colaborador</th>
            <th>Jornada</th>
            <th>Data principal</th>
            <th>Progresso</th>
            <th>Situação</th>
            <th>
              <span className="sr-only">Abrir jornada</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {journeys.map((journey) => (
            <tr key={journey.id}>
              <td>
                <button
                  className="person-button"
                  onClick={() => onJourney(journey)}
                >
                  <Avatar user={journey.employee} />
                  <span>
                    <strong>{journey.employee.name}</strong>
                    <small>
                      {journey.employee.position ||
                        journey.employee.department ||
                        "Colaborador"}
                    </small>
                  </span>
                </button>
              </td>
              <td>
                <TypeBadge type={journey.type} />
              </td>
              <td>
                <span className="date-cell">
                  {shortDate(journey.referenceDate, timezone)}
                </span>
              </td>
              <td>
                <Progress value={journey.progress} />
                <small className="progress-caption">
                  {journey.completedCount} de {journey.taskCount} atividades
                </small>
              </td>
              <td>
                <RadarBadge journey={journey} />
              </td>
              <td>
                <button
                  className="icon-button row-open"
                  onClick={() => onJourney(journey)}
                  aria-label={`Abrir jornada de ${journey.employee.name}`}
                >
                  <ChevronRight size={17} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CalendarStrip({
  journeys,
  timezone,
  onDate,
}: {
  journeys: Journey[];
  timezone: string;
  onDate: (date: string) => void;
}) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() + index);
    return { date, key: formatter.format(date) };
  });
  return (
    <div className="calendar-strip">
      {days.map(({ date, key }, index) => {
        const entries = journeys.filter(
          (j) => j.referenceDate.slice(0, 10) === key,
        );
        return (
          <button
            key={key}
            className={`calendar-day ${index === 0 ? "calendar-today" : ""}`}
            onClick={() => onDate(key)}
            aria-label={`Jornadas em ${fullDate(key, timezone)}, ${entries.length} movimentações`}
          >
            <span>
              {index === 0
                ? "Hoje"
                : new Intl.DateTimeFormat("pt-BR", {
                    weekday: "short",
                    timeZone: timezone,
                  })
                    .format(date)
                    .replace(".", "")}
            </span>
            <strong>
              {new Intl.DateTimeFormat("pt-BR", {
                day: "2-digit",
                timeZone: timezone,
              }).format(date)}
            </strong>
            <div className="calendar-marks">
              {entries.length ? (
                entries
                  .slice(0, 4)
                  .map((j) => <i key={j.id} className={j.type} />)
              ) : (
                <i className="no-event" />
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}

export function Overview({
  workspace,
  onJourney,
  onCreate,
  query,
  onView,
  onDate,
}: Shared & { onView: (view: View) => void; onDate: (date: string) => void }) {
  const active = workspace.journeys.filter(
    (j) => j.status === "active" || j.status === "creating",
  );
  const critical = active.filter((j) => j.radar === "critical");
  const completed = workspace.journeys.filter((j) => j.status === "completed");
  const filtered = active.filter((j) =>
    `${j.employee.name} ${j.employee.department} ${j.templateName}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const firstName = workspace.session.user.name.split(" ")[0];
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">Pessoas e processos</div>
          <h1>
            {workspace.session.role === "colaborador"
              ? `Sua jornada, ${firstName}`
              : "Visão geral"}
          </h1>
          <p>
            {workspace.session.role === "colaborador"
              ? "Suas próximas etapas e tudo o que você precisa para seguir."
              : "Acompanhe cada entrada, cada saída e o que precisa da sua atenção."}
          </p>
        </div>
        {workspace.session.canManage && (
          <Button onClick={onCreate}>
            <Plus size={17} />
            Nova jornada
          </Button>
        )}
      </div>
      <div className="metric-strip" aria-label="Resumo das jornadas">
        <div className="metric">
          <span>
            <Route size={16} />
            Em andamento
          </span>
          <strong>{active.length.toString().padStart(2, "0")}</strong>
          <small>jornadas ativas</small>
        </div>
        <div className="metric">
          <span>
            <ArrowDownLeft size={16} />
            Onboardings
          </span>
          <strong>
            {active
              .filter((j) => j.type === "onboarding")
              .length.toString()
              .padStart(2, "0")}
          </strong>
          <small>pessoas chegando</small>
        </div>
        <div className="metric">
          <span>
            <ArrowUpRight size={16} />
            Offboardings
          </span>
          <strong>
            {active
              .filter((j) => j.type === "offboarding")
              .length.toString()
              .padStart(2, "0")}
          </strong>
          <small>transições em curso</small>
        </div>
        <div className={`metric ${critical.length ? "metric-alert" : ""}`}>
          <span>
            <TriangleAlert size={16} />
            Precisam de atenção
          </span>
          <strong>{critical.length.toString().padStart(2, "0")}</strong>
          <small>
            {critical.length
              ? "jornadas com risco crítico"
              : "nenhuma jornada crítica"}
          </small>
        </div>
      </div>
      {workspace.session.canManage && (
        <RhDailyAgenda
          workspace={workspace}
          onTask={onJourney}
          onView={() => onView("journeys")}
        />
      )}
      {workspace.session.role !== "colaborador" && (
        <ReadinessQueue workspace={workspace} onJourney={onJourney} />
      )}
      <div className="overview-layout">
        <div className="main-column">
          <section className="workspace-section">
            <SectionHeader
              title="Jornadas em andamento"
              description="Prazos, responsáveis e progresso em um só lugar."
              action={
                <Button variant="ghost" onClick={() => onView("journeys")}>
                  Ver todas
                  <ArrowRight size={15} />
                </Button>
              }
            />
            {filtered.length ? (
              <JourneyTable
                journeys={filtered.slice(0, 6)}
                onJourney={onJourney}
                timezone={workspace.settings.timezone}
              />
            ) : (
              <EmptyState
                icon={<Route size={27} />}
                title={
                  query
                    ? "Nenhuma jornada encontrada"
                    : "Tudo começa com uma jornada"
                }
                description={
                  query
                    ? "Tente outro nome ou departamento."
                    : "Escolha um modelo e deixe o Nexo organizar as etapas no Bitrix24."
                }
                action={
                  workspace.session.canManage ? (
                    <Button variant="secondary" onClick={onCreate}>
                      <Plus size={16} />
                      Criar primeira jornada
                    </Button>
                  ) : undefined
                }
              />
            )}
          </section>
          <section className="workspace-section upcoming-section">
            <SectionHeader
              title="Próximas movimentações"
              description="Entradas e saídas nos próximos sete dias."
              action={
                <span className="subtle-label">
                  {new Intl.DateTimeFormat("pt-BR", {
                    month: "long",
                    year: "numeric",
                    timeZone: workspace.settings.timezone,
                  }).format(new Date())}
                </span>
              }
            />
            <CalendarStrip
              journeys={workspace.journeys}
              timezone={workspace.settings.timezone}
              onDate={onDate}
            />
            <div className="calendar-legend">
              <span>
                <i className="dot dot-onboarding" />
                Onboarding
              </span>
              <span>
                <i className="dot dot-offboarding" />
                Offboarding
              </span>
              {completed.length > 0 && (
                <span className="calendar-completed">
                  <CircleCheck size={14} />
                  {completed.length} jornadas concluídas
                </span>
              )}
            </div>
          </section>
        </div>
        <aside className="context-column">
          <section className="activity-section">
            <SectionHeader title="Últimas atividades" />
            {workspace.audit.length ? (
              <div className="activity-feed">
                {workspace.audit.slice(0, 4).map((entry) => (
                  <div className="activity-item" key={entry.id}>
                    <span className="activity-point">
                      <CheckCheck size={13} />
                    </span>
                    <div>
                      <p>{entry.message}</p>
                      <small>
                        {entry.actorName} ·{" "}
                        {timeAgo(entry.createdAt).toLowerCase()}
                      </small>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted small empty-feed">
                As atividades da equipe serão registradas aqui.
              </p>
            )}
          </section>
          <div className="integration-note">
            <span className="integration-logo">
              b<span>24</span>
            </span>
            <div>
              <strong>Conectado ao seu Bitrix24</strong>
              <small>{workspace.session.portalDomain}</small>
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}

export function JourneysView({
  workspace,
  onJourney,
  onCreate,
  query,
  filterDate,
  onClearDate,
}: Shared & { filterDate: string; onClearDate: () => void }) {
  const [type, setType] = useState<"all" | JourneyType>("all");
  const [status, setStatus] = useState("active");
  const journeys = workspace.journeys.filter(
    (j) =>
      (type === "all" || j.type === type) &&
      (status === "all" ||
        (status === "active"
          ? ["active", "creating"].includes(j.status)
          : j.status === status)) &&
      (!filterDate || j.referenceDate.slice(0, 10) === filterDate) &&
      `${j.employee.name} ${j.employee.department} ${j.templateName}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">Central de operações</div>
          <h1>Jornadas</h1>
          <p>Cada pessoa, suas etapas e um próximo passo claro.</p>
        </div>
        {workspace.session.canManage && (
          <Button onClick={onCreate}>
            <Plus size={17} />
            Nova jornada
          </Button>
        )}
      </div>
      <div className="filter-bar">
        <div className="segmented">
          <button
            className={type === "all" ? "selected" : ""}
            onClick={() => setType("all")}
          >
            Todas
          </button>
          <button
            className={type === "onboarding" ? "selected" : ""}
            onClick={() => setType("onboarding")}
          >
            <ArrowDownLeft size={15} />
            Onboarding
          </button>
          <button
            className={type === "offboarding" ? "selected" : ""}
            onClick={() => setType("offboarding")}
          >
            <ArrowUpRight size={15} />
            Offboarding
          </button>
        </div>
        <div className="filter-controls">
          {filterDate && (
            <button className="filter-chip" onClick={onClearDate}>
              {shortDate(filterDate)} ×
            </button>
          )}
          <select
            aria-label="Filtrar por situação"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="active">Em andamento</option>
            <option value="all">Todas as situações</option>
            <option value="completed">Concluídas</option>
            <option value="cancelled">Canceladas</option>
          </select>
          <span className="count-label">{journeys.length} jornadas</span>
        </div>
      </div>
      <section className="workspace-section">
        {journeys.length ? (
          <JourneyTable
            journeys={journeys}
            onJourney={onJourney}
            timezone={workspace.settings.timezone}
          />
        ) : (
          <EmptyState
            icon={
              query || filterDate ? <Search size={28} /> : <Route size={28} />
            }
            title="Nenhuma jornada nesta seleção"
            description="Altere os filtros ou inicie uma nova jornada para acompanhar as etapas."
            action={
              workspace.session.canManage ? (
                <Button variant="secondary" onClick={onCreate}>
                  Nova jornada
                  <ArrowRight size={15} />
                </Button>
              ) : undefined
            }
          />
        )}
      </section>
    </>
  );
}

export function TasksView({
  workspace,
  query,
  onTask,
}: {
  workspace: Workspace;
  query: string;
  onTask: (journey: Journey, task: JourneyTask) => void;
}) {
  const [filter, setFilter] = useState("pending");
  const tasks = workspace.journeys
    .flatMap((j) => j.tasks.map((task) => ({ journey: j, task })))
    .filter(
      ({ task, journey }) =>
        task.assignee?.id === workspace.session.user.id &&
        (filter === "all" ||
          (filter === "pending"
            ? task.status !== "completed"
            : task.status === "completed")) &&
        `${task.title} ${journey.employee.name}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .sort((a, b) => a.task.dueAt.localeCompare(b.task.dueAt));
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">Meu espaço</div>
          <h1>Minhas tarefas</h1>
          <p>Suas entregas para que cada jornada aconteça.</p>
        </div>
      </div>
      <div className="filter-bar">
        <div className="segmented">
          <button
            className={filter === "pending" ? "selected" : ""}
            onClick={() => setFilter("pending")}
          >
            A fazer
          </button>
          <button
            className={filter === "completed" ? "selected" : ""}
            onClick={() => setFilter("completed")}
          >
            Concluídas
          </button>
          <button
            className={filter === "all" ? "selected" : ""}
            onClick={() => setFilter("all")}
          >
            Todas
          </button>
        </div>
        <span className="count-label">{tasks.length} atividades</span>
      </div>
      <section className="workspace-section">
        {tasks.length ? (
          <div className="task-list">
            {tasks.map(({ task, journey }) => (
              <button
                className="task-list-row"
                key={task.id}
                onClick={() => onTask(journey, task)}
              >
                <span
                  className={`task-circle ${task.status === "completed" ? "checked" : ""}`}
                >
                  {task.status === "completed" && <CheckCheck size={16} />}
                </span>
                <span className="task-list-name">
                  <strong>
                    {task.title}
                    {task.critical && (
                      <i className="critical-mark" title="Atividade crítica" />
                    )}
                  </strong>
                  <small>
                    {journey.employee.name} <span>·</span> {task.stageTitle}
                  </small>
                </span>
                <TypeBadge type={journey.type} />
                <span className="task-list-date">
                  <Clock3 size={14} />
                  {shortDate(task.dueAt, workspace.settings.timezone)}
                </span>
                <TaskBadge status={task.status} />
                <ChevronRight size={17} />
              </button>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<CheckCheck size={29} />}
            title={
              filter === "completed"
                ? "Suas conclusões aparecerão aqui"
                : "Nenhuma tarefa pendente"
            }
            description="Atividades atribuídas a você nas jornadas aparecerão nesta área."
          />
        )}
      </section>
    </>
  );
}

export function AutomationsView({
  workspace,
  onConfigure,
  onToggle,
  busy,
}: {
  workspace: Workspace;
  onConfigure: () => void;
  onToggle: (id: string) => void;
  busy: boolean;
}) {
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">Padronização em movimento</div>
          <h1>Automações</h1>
          <p>Uma aprovação no Bitrix. Todas as etapas no lugar.</p>
        </div>
        {workspace.session.canConfigure && (
          <Button variant="secondary" onClick={onConfigure}>
            Configurar processo
            <ArrowRight size={16} />
          </Button>
        )}
      </div>
      <section className="automation-flow">
        <div>
          <span>
            <Layers3 size={22} />
          </span>
          <strong>Solicitação de RH</strong>
          <p>Movimentação registrada no Bitrix</p>
        </div>
        <ArrowRight className="flow-arrow" size={21} />
        <div>
          <span>
            <CircleCheck size={22} />
          </span>
          <strong>Aprovação</strong>
          <p>Entrada na etapa configurada</p>
        </div>
        <ArrowRight className="flow-arrow" size={21} />
        <div>
          <span>
            <Zap size={22} />
          </span>
          <strong>Jornada automática</strong>
          <p>Modelo, responsáveis e prazos</p>
        </div>
        <ArrowRight className="flow-arrow" size={21} />
        <div>
          <span>
            <CheckCheck size={22} />
          </span>
          <strong>Acompanhamento</strong>
          <p>Tarefas e conclusão sincronizadas</p>
        </div>
      </section>
      <SectionHeader
        title="Regras de início"
        description="Cada movimentação gera uma única jornada, mesmo quando o evento é reenviado."
      />
      {workspace.rules.length ? (
        <div className="automation-rules">
          {workspace.rules.map((rule) => {
            const template = workspace.templates.find(
              (t) => t.id === rule.templateId,
            );
            return (
              <section className="automation-rule" key={rule.id}>
                <div className={`rule-symbol ${rule.type}`}>
                  <Zap size={21} />
                </div>
                <div className="rule-content">
                  <div className="rule-title">
                    <h3>{rule.name}</h3>
                    <TypeBadge type={rule.type} />
                  </div>
                  <p>
                    Quando a movimentação entra na etapa de aprovação
                    configurada
                  </p>
                  <div className="rule-target">
                    <Layers3 size={15} />
                    Aplicar modelo{" "}
                    <strong>{template?.name || "Modelo indisponível"}</strong>
                  </div>
                </div>
                <label className="switch-label">
                  <input
                    type="checkbox"
                    role="switch"
                    checked={rule.enabled}
                    disabled={busy || !workspace.session.canConfigure}
                    onChange={() => onToggle(rule.id)}
                    aria-label={`${rule.enabled ? "Desativar" : "Ativar"} ${rule.name}`}
                  />
                  <span />
                  <small>{rule.enabled ? "Ativa" : "Pausada"}</small>
                </label>
              </section>
            );
          })}
        </div>
      ) : (
        <section className="workspace-section">
          <EmptyState
            icon={<Zap size={28} />}
            title="Configure seu primeiro gatilho"
            description="Associe as etapas de aprovação do processo de RH aos modelos de onboarding e offboarding."
            action={
              workspace.session.canConfigure ? (
                <Button onClick={onConfigure}>
                  Configurar automações
                  <ArrowRight size={15} />
                </Button>
              ) : undefined
            }
          />
        </section>
      )}
      <div className="info-strip">
        <CircleCheck size={18} />
        <p>
          <strong>Você também pode iniciar manualmente.</strong> O RH seleciona
          pessoa, modelo e data na central de jornadas. Os dois caminhos usam o
          mesmo fluxo de execução.
        </p>
      </div>
    </>
  );
}
