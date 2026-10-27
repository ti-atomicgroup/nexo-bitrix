/**
 * Mapa da API do Nexo: método, caminho, entrada (esquema em ./schemas) e saída (DTO em ./contracts).
 * Autenticação: `Authorization: Bearer <token>` em tudo, exceto onde `auth: "public"` ou `auth: "install"`.
 * Erros: status HTTP adequado + corpo `ApiErrorDTO` ({ error: { code, message } }), mensagem em pt-BR.
 *
 * A interface (src/lib/api-client.ts) e as rotas (src/app/api/**) seguem esta tabela.
 */
export const API_ROUTES = {
  /* Público */
  health: { method: "GET", path: "/api/health", auth: "public", output: "{ ok, version, commit, buildTime, node }" },
  status: { method: "GET", path: "/api/status", auth: "public", output: "StatusDTO" },

  /* Instalação (só enquanto não existe administrador) */
  /* Rotas que falam com o Bitrix24 (conectar, preparar, trocar webhook, pessoas, fontes do CRM): respondem 202 na hora e a tela consulta `task` até terminar. */
  setupConnect: { method: "POST", path: "/api/setup/connect", auth: "public", input: "connectWebhookInput", output: "TaskStartedDTO (202) → WebhookCheckDTO" },
  setupAccount: { method: "POST", path: "/api/setup/account", auth: "install", input: "createAccountInput", output: "SessionDTO" },
  setupPrepare: { method: "POST", path: "/api/setup/prepare", auth: "admin", input: "prepareInput", output: "TaskStartedDTO (202) → SetupStateDTO" },
  /* O id é aleatório (256 bits) e vale 15 min; o resultado é entregue uma vez. Falha volta com o erro do trabalho. */
  task: { method: "GET", path: "/api/tasks/:taskId", auth: "public", output: "TaskStatusDTO" },

  /* Sessão */
  login: { method: "POST", path: "/api/auth/login", auth: "public", input: "loginInput", output: "SessionDTO" },
  logout: { method: "POST", path: "/api/auth/logout", auth: "user", output: "{ ok: true }" },
  me: { method: "GET", path: "/api/me", auth: "user", output: "MeDTO" },
  changePassword: { method: "POST", path: "/api/me/password", auth: "user", input: "changePasswordInput", output: "{ ok: true }" },

  /* Painel */
  today: { method: "GET", path: "/api/today", auth: "user", output: "TodayDTO" },
  sync: { method: "POST", path: "/api/sync", auth: "user", output: "SyncStatusDTO" },

  /* Pessoas (cache local de usuários do Bitrix) */
  people: { method: "GET", path: "/api/people?query=&limit=", auth: "user", input: "peopleQueryInput", output: "PersonDTO[]" },
  peopleRefresh: { method: "POST", path: "/api/people/refresh", auth: "user", output: "TaskStartedDTO (202) → { count: number }" },
  personLedger: { method: "GET", path: "/api/people/:personId/ledger", auth: "user", output: "LedgerItemDTO[]" },
  personLedgerAdd: { method: "POST", path: "/api/people/:personId/ledger", auth: "user", input: "ledgerItemInput", output: "LedgerItemDTO" },
  ledgerWaive: { method: "PATCH", path: "/api/ledger/:ledgerItemId", auth: "user", input: "ledgerWaiveInput", output: "LedgerItemDTO" },

  /* Jornadas */
  journeys: { method: "GET", path: "/api/journeys?status=&kind=", auth: "user", output: "JourneySummaryDTO[]" },
  journeyPreview: { method: "POST", path: "/api/journeys/preview", auth: "user", input: "journeyPreviewInput", output: "JourneyPreviewDTO" },
  journeyCreate: { method: "POST", path: "/api/journeys", auth: "user", input: "createJourneyInput", output: "{ id: string }" },
  journey: { method: "GET", path: "/api/journeys/:journeyId", auth: "user", output: "JourneyDTO" },
  journeyAction: { method: "POST", path: "/api/journeys/:journeyId/actions", auth: "user", input: "journeyActionInput", output: "JourneyDTO" },
  journeyLinkPerson: { method: "POST", path: "/api/journeys/:journeyId/person", auth: "user", input: "linkPersonInput", output: "JourneyDTO" },
  journeyCollaboratorLink: { method: "POST", path: "/api/journeys/:journeyId/link", auth: "user", input: "collaboratorLinkInput", output: "CollaboratorLinkDTO" },
  activityAction: { method: "POST", path: "/api/activities/:activityId/actions", auth: "user", input: "activityActionInput", output: "ActivityDTO" },

  /* Trilhas */
  templates: { method: "GET", path: "/api/templates", auth: "user", output: "TemplateSummaryDTO[]" },
  templateCreate: { method: "POST", path: "/api/templates", auth: "user", input: "templateInput", output: "TemplateDTO" },
  template: { method: "GET", path: "/api/templates/:templateId", auth: "user", output: "TemplateDTO" },
  templateUpdate: { method: "PUT", path: "/api/templates/:templateId", auth: "user", input: "templateInput", output: "TemplateDTO" },
  templateArchive: { method: "DELETE", path: "/api/templates/:templateId", auth: "user", output: "{ ok: true }" },
  library: { method: "GET", path: "/api/library", auth: "user", output: "LibraryActivityDTO[]" },

  /* Automação */
  detectionDismiss: { method: "POST", path: "/api/detections/:detectionId/dismiss", auth: "user", output: "{ ok: true }" },
  detection: { method: "GET", path: "/api/detections/:detectionId", auth: "user", output: "DetectionDTO" },
  crmSources: { method: "GET", path: "/api/crm/sources", auth: "admin", output: "TaskStartedDTO (202) → CrmSourceDTO[]" },
  triggers: { method: "GET", path: "/api/triggers", auth: "user", output: "TriggerDTO[]" },
  triggerCreate: { method: "POST", path: "/api/triggers", auth: "admin", input: "triggerInput", output: "TriggerDTO" },
  triggerUpdate: { method: "PUT", path: "/api/triggers/:triggerId", auth: "admin", input: "triggerInput", output: "TriggerDTO" },
  triggerDelete: { method: "DELETE", path: "/api/triggers/:triggerId", auth: "admin", output: "{ ok: true }" },

  /* Ajustes */
  settings: { method: "GET", path: "/api/settings", auth: "user", output: "SettingsDTO" },
  settingsUpdate: { method: "PUT", path: "/api/settings", auth: "admin", input: "settingsInput", output: "SettingsDTO" },
  webhookReplace: { method: "POST", path: "/api/settings/webhook", auth: "admin", input: "replaceWebhookInput", output: "TaskStartedDTO (202) → SettingsDTO" },
  users: { method: "GET", path: "/api/users", auth: "admin", output: "AppUserDTO[]" },
  userCreate: { method: "POST", path: "/api/users", auth: "admin", input: "createUserInput", output: "AppUserDTO" },
  userUpdate: { method: "PATCH", path: "/api/users/:userId", auth: "admin", input: "updateUserInput", output: "AppUserDTO" },
  diagnostics: { method: "GET", path: "/api/diagnostics", auth: "user", output: "DiagnosticsDTO" },
  audit: { method: "GET", path: "/api/audit?limit=", auth: "user", output: "AuditEntryDTO[]" },
} as const;

/**
 * Página do colaborador (fora da API JSON): `GET /j/:token` renderiza no servidor; `POST /j/:token/feito`
 * recebe o formulário `collaboratorDoneInput` e redireciona (303) de volta para `/j/:token`.
 */
export const COLLABORATOR_ROUTES = { page: "/j/:token", done: "/j/:token/feito" } as const;

export type ApiRouteName = keyof typeof API_ROUTES;
