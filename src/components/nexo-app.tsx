"use client";

import Script from "next/script";
import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import {
  Activity,
  Bell,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  ExternalLink,
  Layers3,
  LayoutDashboard,
  Menu,
  RefreshCw,
  Route,
  Search,
  Settings2,
  ShieldCheck,
  X,
  Zap,
  CheckCheck,
  TriangleAlert,
} from "lucide-react";
import type {
  CreateJourneyInput,
  Journey,
  JourneyTask,
  JourneyTemplate,
  PublicStatus,
  Workspace,
} from "@/shared/contracts";
import {
  journeySchema,
  sessionSchema,
  settingsSchema,
  statusSchema,
  taskSchema,
  templateSchema,
  workspaceSchema,
} from "@/shared/validation";
import {
  ApiClient,
  consumeLaunchHash,
  errorMessage,
  RequestError,
} from "@/lib/client";
import { appRoleLabels, timeAgo } from "@/lib/format";
import { Avatar, Button, Logo, Modal } from "./ui";
import {
  AutomationsView,
  JourneysView,
  Overview,
  TasksView,
  type View,
} from "./workspace";
import { JourneyForm } from "./journey-form";
import { JourneyDetail, type TaskAction } from "./journey-detail";
import { emptyTemplate, TemplateEditor, TemplatesView } from "./templates";
import { SettingsView } from "./settings";
import { SetupScreen } from "./setup-screen";

const navItems: {
  view: View;
  label: string;
  icon: typeof Route;
  manage?: boolean;
  configure?: boolean;
}[] = [
  { view: "overview", label: "Visão geral", icon: LayoutDashboard },
  { view: "journeys", label: "Jornadas", icon: Route },
  { view: "tasks", label: "Minhas tarefas", icon: CheckCheck },
  { view: "templates", label: "Modelos", icon: Layers3, manage: true },
  { view: "automations", label: "Automações", icon: Zap, manage: true },
  {
    view: "settings",
    label: "Configurações",
    icon: Settings2,
    configure: true,
  },
];

export function NexoApp() {
  const [api] = useState(() => new ApiClient());
  const launchRef = useRef<ReturnType<typeof consumeLaunchHash> | undefined>(
    undefined,
  );
  const [status, setStatus] = useState<PublicStatus | null>(null);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [bootstrap, setBootstrap] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [view, setView] = useState<View>("overview");
  const [query, setQuery] = useState("");
  const [filterDate, setFilterDate] = useState("");
  const [mobileMenu, setMobileMenu] = useState(false);
  const [modal, setModal] = useState<
    "journey" | "notifications" | "help" | "profile" | null
  >(null);
  const [journeyId, setJourneyId] = useState<string | null>(null);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [editor, setEditor] = useState<{
    template: JourneyTemplate;
    isNew: boolean;
  } | null>(null);
  const [toast, setToast] = useState("");
  const [syncBusy, setSyncBusy] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const reload = useCallback(async () => {
    const next = await api.request("/api/workspace", workspaceSchema);
    setWorkspace(next);
    return next;
  }, [api]);
  const notify = useCallback((message: string) => setToast(message), []);
  const fail = useCallback(
    (error: unknown) => {
      setError(errorMessage(error));
      if (error instanceof RequestError && error.status === 401) {
        api.setToken("");
        setWorkspace(null);
      }
    },
    [api],
  );
  useEffect(() => {
    if (launchRef.current === undefined)
      launchRef.current = consumeLaunchHash(window.location.hash);
    const launch = launchRef.current;
    if (window.location.hash)
      window.history.replaceState(
        null,
        "",
        window.location.pathname + window.location.search,
      );
    let active = true;
    async function initialize() {
      const nextStatus = await api.request("/api/status", statusSchema);
      if (!active) return;
      setStatus(nextStatus);
      if (launch) {
        api.setToken(launch.token);
        if (launch.kind === "bootstrap") setBootstrap(true);
        else {
          const next = await reload();
          if (!next.settings.setupComplete) setView("settings");
        }
      }
    }
    initialize()
      .catch((error) => {
        if (active) fail(error);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [api, reload, fail]);
  const hasWorkspace = workspace !== null;
  useEffect(() => {
    if (!hasWorkspace) return;
    const timer = window.setInterval(() => reload().catch(fail), 60000);
    return () => window.clearInterval(timer);
  }, [hasWorkspace, reload, fail]);
  useEffect(() => {
    function keyboard(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
      }
    }
    window.addEventListener("keydown", keyboard);
    return () => window.removeEventListener("keydown", keyboard);
  }, []);
  const selectedJourney = workspace?.journeys.find((j) => j.id === journeyId);
  function navigate(next: View) {
    setView(next);
    setMobileMenu(false);
    setQuery("");
    setFilterDate("");
  }
  function openJourney(journey: Journey, task?: JourneyTask) {
    setJourneyId(journey.id);
    setTaskId(task?.id || null);
  }
  function createJourney() {
    if (!workspace?.settings.setupComplete) {
      notify("Conclua a configuração inicial para iniciar uma jornada.");
      setView("settings");
      return;
    }
    setModal("journey");
  }
  async function bootstrapInstall(values: {
    setupToken: string;
    clientId: string;
    clientSecret: string;
  }) {
    const result = await api.request(
      "/api/setup",
      z.object({ token: z.string(), session: sessionSchema }),
      { action: "bootstrap", ...values },
    );
    api.setToken(result.token);
    setBootstrap(false);
    await reload();
    setView("settings");
  }
  async function create(values: CreateJourneyInput) {
    const journey = await api.request("/api/journeys", journeySchema, values);
    setModal(null);
    await reload();
    setJourneyId(journey.id);
    notify(
      "Jornada iniciada. A criação das tarefas será acompanhada pelo Nexo.",
    );
  }
  async function saveTemplate(template: JourneyTemplate, isNew: boolean) {
    await api.request(
      isNew
        ? "/api/templates"
        : `/api/templates/${encodeURIComponent(template.id)}`,
      templateSchema,
      template,
      isNew ? "POST" : "PUT",
    );
    setEditor(null);
    await reload();
    notify("Modelo salvo. A nova versão será usada nas próximas jornadas.");
  }
  async function taskAction(
    task: JourneyTask,
    action: TaskAction,
    checklistId?: string,
  ) {
    await api.request(
      `/api/tasks/${encodeURIComponent(task.id)}/action`,
      taskSchema,
      { action, ...(checklistId ? { checklistId } : {}) },
    );
    await reload();
  }
  async function complete() {
    if (!journeyId) return;
    await api.request(
      `/api/journeys/${encodeURIComponent(journeyId)}/complete`,
      journeySchema,
      {},
    );
    await reload();
    notify("Jornada concluída e movimentação atualizada no Bitrix24.");
  }
  async function sync() {
    setSyncBusy(true);
    try {
      await api.request("/api/sync", z.unknown(), {});
      await reload();
      notify(
        "Sincronização solicitada. As atualizações serão refletidas na próxima consulta.",
      );
    } catch (error) {
      fail(error);
    } finally {
      setSyncBusy(false);
    }
  }
  async function toggleRule(id: string) {
    if (!workspace) return;
    setSyncBusy(true);
    try {
      await api.request("/api/setup", settingsSchema, {
        action: "configure",
        settings: workspace.settings,
        rules: workspace.rules.map((rule) =>
          rule.id === id ? { ...rule, enabled: !rule.enabled } : rule,
        ),
      });
      await reload();
      notify("Regra de automação atualizada.");
    } catch (error) {
      fail(error);
    } finally {
      setSyncBusy(false);
    }
  }
  if (!workspace)
    return (
      <>
        <Script
          src="https://api.bitrix24.com/api/v1/"
          strategy="afterInteractive"
          onLoad={() => window.BX24?.init(() => window.BX24?.fitWindow())}
        />
        <SetupScreen
          status={status}
          bootstrap={bootstrap}
          loading={loading}
          error={error}
          onBootstrap={bootstrapInstall}
          onRetry={() => {
            setError("");
            api
              .request("/api/status", statusSchema)
              .then(setStatus)
              .catch(fail);
          }}
        />
      </>
    );
  const myPending = workspace.journeys
    .flatMap((j) => j.tasks)
    .filter(
      (t) =>
        t.assignee?.id === workspace.session.user.id &&
        t.status !== "completed",
    ).length;
  const allowedNav = navItems.filter(
    (n) =>
      (!n.manage || workspace.session.canManage) &&
      (!n.configure || workspace.session.canConfigure),
  );
  const currentNav = allowedNav.find((n) => n.view === view) || allowedNav[0];
  return (
    <div className="app-shell">
      <Script
        src="https://api.bitrix24.com/api/v1/"
        strategy="afterInteractive"
        onLoad={() => window.BX24?.init(() => window.BX24?.fitWindow())}
      />
      <a className="skip-link" href="#main-content">
        Ir para o conteúdo
      </a>
      {mobileMenu && (
        <button
          className="sidebar-backdrop"
          aria-label="Fechar menu"
          onClick={() => setMobileMenu(false)}
        />
      )}
      <aside className={`sidebar ${mobileMenu ? "is-open" : ""}`}>
        <button
          className="sidebar-logo-button"
          onClick={() => navigate("overview")}
          aria-label="Nexo, visão geral"
        >
          <Logo />
        </button>
        <div className="workspace-switch">
          <span className="workspace-monogram">
            {workspace.settings.companyName.slice(0, 1).toUpperCase()}
          </span>
          <span>
            <strong>{workspace.settings.companyName}</strong>
            <small>Workspace de pessoas</small>
          </span>
          <ShieldCheck size={15} />
        </div>
        <div className="nav-label">Workspace</div>
        <nav aria-label="Navegação principal">
          {allowedNav.map((item) => (
            <button
              key={item.view}
              className={view === item.view ? "nav-item active" : "nav-item"}
              onClick={() => navigate(item.view)}
              aria-current={view === item.view ? "page" : undefined}
            >
              <item.icon size={18} />
              <span>{item.label}</span>
              {item.view === "tasks" && myPending > 0 && (
                <span className="nav-count">{myPending}</span>
              )}
              {item.view === "automations" && (
                <span className="nav-new">Novo</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-integration">
            <span className="dot dot-onboarding" />
            <span>Bitrix24 conectado</span>
            <ShieldCheck size={14} />
          </div>
          <button
            className="nav-item help-link"
            onClick={() => setModal("help")}
          >
            <CircleHelp size={18} />
            <span>Central de ajuda</span>
            <ExternalLink size={13} />
          </button>
          <button
            className="sidebar-profile"
            onClick={() => setModal("profile")}
          >
            <Avatar user={workspace.session.user} />
            <span>
              <strong>{workspace.session.user.name}</strong>
              <small>{appRoleLabels[workspace.session.role]}</small>
            </span>
            <ChevronDown size={15} />
          </button>
        </div>
      </aside>
      <div className="app-main">
        <header className="topbar">
          <button
            className="icon-button mobile-menu-toggle"
            aria-label="Abrir menu"
            onClick={() => setMobileMenu(true)}
          >
            <Menu size={21} />
          </button>
          <div className="breadcrumbs">
            <span>Workspace</span>
            <ChevronRight size={13} />
            <strong>{currentNav.label}</strong>
          </div>
          <label className="global-search">
            <Search size={16} />
            <input
              ref={searchRef}
              aria-label="Buscar pessoas ou jornadas"
              placeholder="Buscar pessoas ou jornadas..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && query) setView("journeys");
              }}
            />
            <kbd>⌃ K</kbd>
          </label>
          <div className="topbar-actions">
            <button
              className={`icon-button ${syncBusy ? "is-syncing" : ""}`}
              disabled={syncBusy}
              onClick={sync}
              aria-label="Sincronizar com o Bitrix24"
              title="Sincronizar com o Bitrix24"
            >
              <RefreshCw size={17} className={syncBusy ? "spin" : ""} />
            </button>
            <span className="topbar-divider" />
            <button
              className="icon-button notification-button"
              onClick={() => setModal("notifications")}
              aria-label={`Notificações, ${workspace.issues.length} pendências`}
            >
              <Bell size={18} />
              {workspace.issues.length > 0 && <i />}
            </button>
            <button
              className="topbar-avatar"
              onClick={() => setModal("profile")}
              aria-label="Ver meu perfil"
            >
              <Avatar user={workspace.session.user} size="sm" />
            </button>
          </div>
        </header>
        <main id="main-content" className="page-content">
          {!workspace.settings.setupComplete && view !== "settings" && (
            <div className="setup-notice">
              <ShieldCheck size={18} />
              <span>Conclua a configuração para iniciar suas jornadas.</span>
              <Button variant="ghost" onClick={() => navigate("settings")}>
                Configurar
                <ChevronRight size={14} />
              </Button>
            </div>
          )}
          {error && (
            <div className="global-error" role="alert">
              <TriangleAlert size={18} />
              <span>{error}</span>
              <button
                className="icon-button"
                aria-label="Fechar mensagem de erro"
                onClick={() => setError("")}
              >
                <X size={16} />
              </button>
            </div>
          )}
          {view === "overview" && (
            <Overview
              workspace={workspace}
              query={query}
              onJourney={openJourney}
              onCreate={createJourney}
              onView={navigate}
              onDate={(date) => {
                setFilterDate(date);
                setView("journeys");
              }}
            />
          )}
          {view === "journeys" && (
            <JourneysView
              workspace={workspace}
              query={query}
              onJourney={openJourney}
              onCreate={createJourney}
              filterDate={filterDate}
              onClearDate={() => setFilterDate("")}
            />
          )}
          {view === "tasks" && (
            <TasksView
              workspace={workspace}
              query={query}
              onTask={openJourney}
            />
          )}
          {view === "templates" && workspace.session.canManage && (
            <TemplatesView
              workspace={workspace}
              query={query}
              onCreate={() =>
                setEditor({
                  template: emptyTemplate("onboarding"),
                  isNew: true,
                })
              }
              onEdit={(template) => setEditor({ template, isNew: false })}
              onDuplicate={(template) =>
                setEditor({
                  template: {
                    ...structuredClone(template),
                    id: crypto.randomUUID(),
                    name: `${template.name} · cópia`,
                    version: 1,
                  },
                  isNew: true,
                })
              }
            />
          )}
          {view === "automations" && workspace.session.canManage && (
            <AutomationsView
              workspace={workspace}
              onConfigure={() => navigate("settings")}
              onToggle={toggleRule}
              busy={syncBusy}
            />
          )}
          {view === "settings" && workspace.session.canConfigure && (
            <SettingsView
              workspace={workspace}
              api={api}
              onUpdated={async () => {
                await reload();
              }}
              notify={notify}
            />
          )}
        </main>
        <footer className="app-footer">
          <span>
            <Logo compact />
            Nexo · Pessoas e processos
          </span>
          <span>
            <span className="dot dot-onboarding" />
            {timeAgo(workspace.lastSyncAt)}
            <i />
            Bitrix24
          </span>
        </footer>
      </div>
      {toast && (
        <div className="toast" role="status">
          <span>
            <Check size={16} />
          </span>
          <p>{toast}</p>
          <button
            className="icon-button"
            aria-label="Fechar notificação"
            onClick={() => setToast("")}
          >
            <X size={15} />
          </button>
        </div>
      )}
      {modal === "journey" && (
        <JourneyForm
          workspace={workspace}
          onClose={() => setModal(null)}
          onSubmit={create}
        />
      )}
      {selectedJourney && (
        <JourneyDetail
          key={selectedJourney.id}
          journey={selectedJourney}
          session={workspace.session}
          timezone={workspace.settings.timezone}
          initialTaskId={taskId}
          onClose={() => {
            setJourneyId(null);
            setTaskId(null);
          }}
          onTaskAction={taskAction}
          onComplete={complete}
        />
      )}
      {editor && (
        <TemplateEditor
          template={editor.template}
          isNew={editor.isNew}
          readOnly={!workspace.session.canManage}
          onClose={() => setEditor(null)}
          onSave={saveTemplate}
        />
      )}
      {modal === "notifications" && (
        <Modal
          title="Pendências de operação"
          description="Configuração e sincronização que precisam de atenção."
          onClose={() => setModal(null)}
        >
          <div className="modal-body">
            {workspace.issues.length ? (
              workspace.issues.map((issue) => (
                <div className="operation-issue" key={issue.id}>
                  <TriangleAlert size={19} />
                  <div>
                    <h3>{issue.title}</h3>
                    <p>{issue.message}</p>
                    <small>{timeAgo(issue.createdAt)}</small>
                  </div>
                </div>
              ))
            ) : (
              <div className="notification-clear">
                <ShieldCheck size={35} />
                <h3>Nenhuma pendência de operação</h3>
                <p>As situações que exigirem ação da equipe aparecerão aqui.</p>
              </div>
            )}
          </div>
          <div className="modal-footer">
            <Button variant="secondary" onClick={() => setModal(null)}>
              Fechar
            </Button>
            <Button onClick={sync} loading={syncBusy}>
              <RefreshCw size={15} />
              Sincronizar
            </Button>
          </div>
        </Modal>
      )}
      {modal === "help" && (
        <Modal
          title="Como o Nexo trabalha"
          description="Do início da jornada à última confirmação."
          onClose={() => setModal(null)}
        >
          <div className="modal-body help-content">
            <div>
              <Layers3 size={20} />
              <section>
                <h3>Configure seus modelos</h3>
                <p>
                  Organize etapas, checklists, responsáveis e prazos relativos à
                  admissão ou ao desligamento.
                </p>
              </section>
            </div>
            <div>
              <Zap size={20} />
              <section>
                <h3>Inicie pelo RH ou por aprovação</h3>
                <p>
                  Uma movimentação aprovada no processo de RH pode iniciar a
                  jornada automaticamente, usando o modelo associado.
                </p>
              </section>
            </div>
            <div>
              <Activity size={20} />
              <section>
                <h3>Acompanhe as tarefas reais</h3>
                <p>
                  Atividades e checklists são sincronizados com o Bitrix. O
                  radar mostra prazos e pendências críticas.
                </p>
              </section>
            </div>
            <div>
              <ShieldCheck size={20} />
              <section>
                <h3>Conclua com todas as etapas cumpridas</h3>
                <p>
                  Atividades obrigatórias e aprovações pendentes precisam ser
                  resolvidas antes de encerrar a jornada.
                </p>
              </section>
            </div>
          </div>
          <div className="modal-footer">
            <span>Suporte: administrador da sua instalação Nexo</span>
            <Button onClick={() => setModal(null)}>
              Entendi
              <Check size={15} />
            </Button>
          </div>
        </Modal>
      )}
      {modal === "profile" && (
        <Modal title="Seu acesso ao Nexo" onClose={() => setModal(null)}>
          <div className="modal-body">
            <div className="profile-summary">
              <Avatar user={workspace.session.user} size="lg" />
              <div>
                <h3>{workspace.session.user.name}</h3>
                <p>{workspace.session.user.position}</p>
                <span className="status radar-ok">
                  <span />
                  {appRoleLabels[workspace.session.role]}
                </span>
              </div>
            </div>
            <dl className="profile-details">
              <div>
                <dt>Portal</dt>
                <dd>{workspace.session.portalDomain}</dd>
              </div>
              <div>
                <dt>Departamento</dt>
                <dd>{workspace.session.user.department || "Não informado"}</dd>
              </div>
              <div>
                <dt>Autenticação</dt>
                <dd>Identidade do Bitrix24</dd>
              </div>
            </dl>
            <div className="info-strip">
              <ShieldCheck size={17} />
              <p>
                O Nexo respeita as permissões da sua conta. Para trocar de
                usuário, acesse a conta desejada no Bitrix e reabra a aplicação.
              </p>
            </div>
          </div>
          <div className="modal-footer">
            <Button variant="secondary" onClick={() => setModal(null)}>
              Fechar
            </Button>
            <a
              className="button button-primary"
              href={`https://${workspace.session.portalDomain}`}
              target="_blank"
              rel="noreferrer"
            >
              Abrir meu portal
              <ExternalLink size={14} />
            </a>
          </div>
        </Modal>
      )}
    </div>
  );
}
