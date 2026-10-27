/** Vocabulário do domínio. Valores em inglês no código; rótulos pt-BR para a interface. */

export const JOURNEY_KINDS = ["onboarding", "offboarding"] as const;
export type JourneyKind = (typeof JOURNEY_KINDS)[number];

export const ACTIVITY_ROLES = ["rh", "gestor", "ti", "colaborador", "buddy", "outro"] as const;
export type ActivityRole = (typeof ACTIVITY_ROLES)[number];

/** Papéis que podem ter um responsável padrão ou escolhido na jornada. */
export const PARTICIPANT_ROLES = ["rh", "gestor", "ti", "buddy"] as const;
export type ParticipantRole = (typeof PARTICIPANT_ROLES)[number];

export const ACTIVITY_KINDS = ["task", "meeting", "reading", "delivery"] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

/** employee: o colaborador vê no link pessoal; team: só quem participa; hr: só o RH (gestor não é observador). */
export const VISIBILITIES = ["employee", "team", "hr"] as const;
export type Visibility = (typeof VISIBILITIES)[number];

export const ACTIVITY_STATUSES = ["locked", "open", "in_progress", "awaiting_approval", "done", "cancelled"] as const;
export type ActivityStatus = (typeof ACTIVITY_STATUSES)[number];

export const JOURNEY_STATUSES = ["active", "paused", "completed", "cancelled"] as const;
export type JourneyStatus = (typeof JOURNEY_STATUSES)[number];

export const RELEASE_MODES = ["start", "offset", "after_previous"] as const;
export type ReleaseMode = (typeof RELEASE_MODES)[number];

export const OFFSET_UNITS = ["calendar", "business"] as const;
export type OffsetUnit = (typeof OFFSET_UNITS)[number];

export const LEDGER_KINDS = ["access", "equipment"] as const;
export type LedgerKind = (typeof LEDGER_KINDS)[number];

/** planned → active → return_requested → closed; waived exige motivo. */
export const LEDGER_STATUSES = ["planned", "active", "return_requested", "closed", "waived"] as const;
export type LedgerStatus = (typeof LEDGER_STATUSES)[number];

/** received: guardado no Nexo, a caminho do Bitrix; sent: no Drive do projeto (e anexado à tarefa, se houver); error: envio parou. */
export const DOCUMENT_STATUSES = ["received", "sent", "error"] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

export const SYNC_STATES = ["local", "queued", "synced", "error", "uncertain"] as const;
export type SyncState = (typeof SYNC_STATES)[number];

export const APP_ROLES = ["admin", "rh"] as const;
export type AppRole = (typeof APP_ROLES)[number];

/** Nunca exibido ao colaborador (LGPD). */
export const OFFBOARDING_REASONS = ["voluntary", "involuntary"] as const;
export type OffboardingReason = (typeof OFFBOARDING_REASONS)[number];

export const DETECTION_STATUSES = ["pending", "started", "dismissed"] as const;
export type DetectionStatus = (typeof DETECTION_STATUSES)[number];

export const SETUP_STAGES = ["connect", "account", "prepare", "ready"] as const;
export type SetupStage = (typeof SETUP_STAGES)[number];

export const REQUIRED_SCOPES = ["task", "user_brief", "crm", "sonet_group"] as const;
export const OPTIONAL_SCOPES = ["im", "calendar", "log", "disk"] as const;
export type RequiredScope = (typeof REQUIRED_SCOPES)[number];
export type OptionalScope = (typeof OPTIONAL_SCOPES)[number];

export const JOURNEY_KIND_LABEL: Record<JourneyKind, string> = { onboarding: "Entrada", offboarding: "Saída" };
export const ROLE_LABEL: Record<ActivityRole, string> = {
  rh: "RH",
  gestor: "Gestor",
  ti: "TI",
  colaborador: "Colaborador",
  buddy: "Buddy",
  outro: "Outro",
};
export const ACTIVITY_KIND_LABEL: Record<ActivityKind, string> = { task: "Tarefa", meeting: "Reunião", reading: "Leitura", delivery: "Entrega" };
export const VISIBILITY_LABEL: Record<Visibility, string> = {
  employee: "Colaborador vê no link",
  team: "Só participantes",
  hr: "Só RH",
};
export const ACTIVITY_STATUS_LABEL: Record<ActivityStatus, string> = {
  locked: "Ainda não liberada",
  open: "A fazer",
  in_progress: "Em andamento",
  awaiting_approval: "Aguardando aprovação",
  done: "Feita",
  cancelled: "Cancelada",
};
export const JOURNEY_STATUS_LABEL: Record<JourneyStatus, string> = { active: "Em andamento", paused: "Pausada", completed: "Concluída", cancelled: "Cancelada" };
export const LEDGER_KIND_LABEL: Record<LedgerKind, string> = { access: "Acesso", equipment: "Equipamento" };
export const LEDGER_STATUS_LABEL: Record<LedgerStatus, string> = {
  planned: "Previsto",
  active: "Com a pessoa",
  return_requested: "Devolução pedida",
  closed: "Encerrado",
  waived: "Dispensado",
};
export const SCOPE_LABEL: Record<RequiredScope | OptionalScope, string> = {
  task: "Tarefas",
  user_brief: "Usuários",
  crm: "CRM",
  sonet_group: "Grupos de trabalho",
  im: "Notificações",
  calendar: "Agenda",
  log: "Feed de notícias",
  disk: "Drive",
};
