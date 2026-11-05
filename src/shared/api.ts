/**
 * Mapa da API do Nexo: método, caminho, entrada (esquema em ./schemas) e saída (DTO em ./contracts).
 * Autenticação: `auth: "session"` exige sessão (cookie protegido ou, no modo alternativo, `X-Nexo-Session`) e a `operation`
 * da matriz em ./permissions diz quais papéis podem; `public` e `install` não exigem sessão.
 * Erros: status HTTP adequado + corpo `ApiErrorDTO` ({ error: { code, message } }), mensagem em pt-BR.
 *
 * A interface (src/lib/api-client.ts) e as rotas (src/app/api/**) seguem esta tabela.
 */
export const API_ROUTES = {
  /* Público: só o necessário para a hospedagem e para decidir a próxima tela. Nenhum dado do ambiente. */
  health: { method: "GET", path: "/api/health", auth: "public", output: "{ ok: true }" },
  status: { method: "GET", path: "/api/status", auth: "public", output: "StatusDTO" },
  probe: { method: "GET", path: "/api/probe", auth: "public", output: "BasicProbeDTO" },

  /* Instalação (só enquanto não existe administrador) */
  /* Rotas que falam com o Bitrix24 (conectar, preparar, trocar webhook, pessoas, fontes do CRM): respondem 202 na hora e a tela consulta `task` até terminar. */
  setupConnect: { method: "POST", path: "/api/setup/connect", auth: "public", input: "connectWebhookInput", output: "TaskStartedDTO (202) → WebhookCheckDTO" },
  setupAccount: { method: "POST", path: "/api/setup/account", auth: "install", input: "createAccountInput", output: "SessionDTO" },
  setupPrepare: { method: "POST", path: "/api/setup/prepare", auth: "session", operation: "workspace.prepare", input: "prepareInput", output: "TaskStartedDTO (202) → SetupStateDTO" },
  /* O id é aleatório (256 bits) e vale 15 min; o resultado é entregue uma vez. Falha volta com o erro do trabalho. */
  task: { method: "GET", path: "/api/tasks/:taskId", auth: "public", output: "TaskStatusDTO" },

  /* Sessão */
  /* Duas chamadas seguidas dizem se o cookie protegido funciona neste navegador e nesta hospedagem, antes de entrar. */
  sessionTransport: { method: "GET", path: "/api/auth/transport", auth: "public", output: "SessionTransportDTO" },
  login: { method: "POST", path: "/api/auth/login", auth: "public", input: "loginInput", output: "SessionDTO" },
  logout: { method: "POST", path: "/api/auth/logout", auth: "session", operation: "session.self", output: "{ ok: true }" },
  me: { method: "GET", path: "/api/me", auth: "session", operation: "session.self", output: "MeDTO" },
  changePassword: { method: "POST", path: "/api/me/password", auth: "session", operation: "session.self", input: "changePasswordInput", output: "{ ok: true }" },

  /* Painel */
  today: { method: "GET", path: "/api/today", auth: "session", operation: "today.read", output: "TodayDTO" },
  sync: { method: "POST", path: "/api/sync", auth: "session", operation: "sync.run", output: "SyncStatusDTO" },

  /* Pessoas (cache local de usuários do Bitrix) */
  people: { method: "GET", path: "/api/people?query=&limit=", auth: "session", operation: "people.read", input: "peopleQueryInput", output: "PersonDTO[]" },
  peopleRefresh: { method: "POST", path: "/api/people/refresh", auth: "session", operation: "people.refresh", output: "TaskStartedDTO (202) → { count: number }" },
  personLedger: { method: "GET", path: "/api/people/:personId/ledger", auth: "session", operation: "ledger.read", output: "LedgerItemDTO[]" },
  personLedgerAdd: { method: "POST", path: "/api/people/:personId/ledger", auth: "session", operation: "ledger.add", input: "ledgerItemInput", output: "LedgerItemDTO" },
  ledgerWaive: { method: "PATCH", path: "/api/ledger/:ledgerItemId", auth: "session", operation: "ledger.waive", input: "ledgerWaiveInput", output: "LedgerItemDTO" },

  /* Jornadas */
  journeys: { method: "GET", path: "/api/journeys?status=&kind=", auth: "session", operation: "journey.read", output: "JourneySummaryDTO[]" },
  journeyPreview: { method: "POST", path: "/api/journeys/preview", auth: "session", operation: "journey.read", input: "journeyPreviewInput", output: "JourneyPreviewDTO" },
  /* Com convite para o Bitrix24 no corpo, a rota também exige `person.invite`. */
  journeyCreate: { method: "POST", path: "/api/journeys", auth: "session", operation: "journey.create", input: "createJourneyInput", output: "{ id: string }" },
  journey: { method: "GET", path: "/api/journeys/:journeyId", auth: "session", operation: "journey.read", output: "JourneyDTO" },
  journeyAction: { method: "POST", path: "/api/journeys/:journeyId/actions", auth: "session", operation: "journey.manage", input: "journeyActionInput", output: "JourneyDTO" },
  /* Com `inviteEmail` no corpo, a rota também exige `person.invite`. */
  journeyLinkPerson: { method: "POST", path: "/api/journeys/:journeyId/person", auth: "session", operation: "journey.link_person", input: "linkPersonInput", output: "JourneyDTO" },
  journeyCollaboratorLink: { method: "POST", path: "/api/journeys/:journeyId/link", auth: "session", operation: "journey.collaborator_link", input: "collaboratorLinkInput", output: "CollaboratorLinkDTO" },
  journeyCollaboratorMessage: {
    method: "POST",
    path: "/api/journeys/:journeyId/message",
    auth: "session",
    operation: "journey.message",
    input: "collaboratorMessageInput",
    output: "TaskStartedDTO (202) → { sent: true }",
  },
  activityAction: { method: "POST", path: "/api/activities/:activityId/actions", auth: "session", operation: "activity.act", input: "activityActionInput", output: "ActivityDTO" },

  /* Trilhas */
  templates: { method: "GET", path: "/api/templates", auth: "session", operation: "template.read", output: "TemplateSummaryDTO[]" },
  templateCreate: { method: "POST", path: "/api/templates", auth: "session", operation: "template.write", input: "templateInput", output: "TemplateDTO" },
  template: { method: "GET", path: "/api/templates/:templateId", auth: "session", operation: "template.read", output: "TemplateDTO" },
  templateUpdate: { method: "PUT", path: "/api/templates/:templateId", auth: "session", operation: "template.write", input: "templateInput", output: "TemplateDTO" },
  templateArchive: { method: "DELETE", path: "/api/templates/:templateId", auth: "session", operation: "template.write", output: "{ ok: true }" },
  library: { method: "GET", path: "/api/library", auth: "session", operation: "template.read", output: "LibraryActivityDTO[]" },

  /* Automação */
  detectionDismiss: { method: "POST", path: "/api/detections/:detectionId/dismiss", auth: "session", operation: "detection.act", output: "{ ok: true }" },
  detection: { method: "GET", path: "/api/detections/:detectionId", auth: "session", operation: "detection.read", output: "DetectionDTO" },
  crmSources: { method: "GET", path: "/api/crm/sources", auth: "session", operation: "crm.read", output: "TaskStartedDTO (202) → CrmSourceDTO[]" },
  triggers: { method: "GET", path: "/api/triggers", auth: "session", operation: "trigger.read", output: "TriggerDTO[]" },
  triggerCreate: { method: "POST", path: "/api/triggers", auth: "session", operation: "trigger.write", input: "triggerInput", output: "TriggerDTO" },
  triggerUpdate: { method: "PUT", path: "/api/triggers/:triggerId", auth: "session", operation: "trigger.write", input: "triggerInput", output: "TriggerDTO" },
  triggerDelete: { method: "DELETE", path: "/api/triggers/:triggerId", auth: "session", operation: "trigger.write", output: "{ ok: true }" },

  /* Ajustes */
  settings: { method: "GET", path: "/api/settings", auth: "session", operation: "settings.read", output: "SettingsDTO" },
  settingsUpdate: { method: "PUT", path: "/api/settings", auth: "session", operation: "settings.write", input: "settingsInput", output: "SettingsDTO" },
  webhookReplace: { method: "POST", path: "/api/settings/webhook", auth: "session", operation: "webhook.replace", input: "replaceWebhookInput", output: "TaskStartedDTO (202) → SettingsDTO" },
  users: { method: "GET", path: "/api/users", auth: "session", operation: "users.manage", output: "AppUserDTO[]" },
  userCreate: { method: "POST", path: "/api/users", auth: "session", operation: "users.manage", input: "createUserInput", output: "AppUserDTO" },
  userUpdate: { method: "PATCH", path: "/api/users/:userId", auth: "session", operation: "users.manage", input: "updateUserInput", output: "AppUserDTO" },
  diagnostics: { method: "GET", path: "/api/diagnostics", auth: "session", operation: "diagnostics.read", output: "DiagnosticsDTO" },
  probeFull: { method: "GET", path: "/api/probe/full?bitrix=", auth: "session", operation: "diagnostics.read", output: "FullProbeDTO" },
  audit: { method: "GET", path: "/api/audit?limit=", auth: "session", operation: "audit.read", output: "AuditEntryDTO[]" },

  /* Dados pessoais (LGPD) e cópia de segurança */
  privacyPeople: { method: "GET", path: "/api/privacy/people?query=", auth: "session", operation: "privacy.manage", input: "privacyQueryInput", output: "PrivacyPersonDTO[]" },
  privacyExport: { method: "GET", path: "/api/privacy/people/:personId", auth: "session", operation: "privacy.manage", output: "PersonExportDTO" },
  privacyErase: { method: "POST", path: "/api/privacy/people/:personId/erase", auth: "session", operation: "privacy.manage", input: "eraseSubjectInput", output: "ErasureReceiptDTO" },
  backup: { method: "GET", path: "/api/backup", auth: "session", operation: "backup.download", output: "arquivo cifrado (application/octet-stream)" },
} as const;

/**
 * Página do colaborador (fora da API JSON): `GET /j/:token` renderiza no servidor; `POST /j/:token/feito`
 * recebe o formulário `collaboratorDoneInput` e redireciona (303) de volta para `/j/:token`.
 */
export const COLLABORATOR_ROUTES = { page: "/j/:token", done: "/j/:token/feito" } as const;

export type ApiRouteName = keyof typeof API_ROUTES;
