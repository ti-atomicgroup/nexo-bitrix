/**
 * Contratos (DTOs) entre a API (`src/app/api/**`) e a interface.
 * Congelados na Fase 0: mudanças só por adição de campos opcionais, feitas pelo lead.
 * Datas: `YYYY-MM-DD` para datas de calendário; ISO 8601 com fuso para instantes.
 */
import type {
  ActivityKind,
  ActivityRole,
  ActivityStatus,
  AppRole,
  DetectionStatus,
  DocumentStatus,
  JourneyKind,
  JourneyStatus,
  LedgerKind,
  LedgerStatus,
  OffboardingReason,
  OffsetUnit,
  OptionalScope,
  ParticipantRole,
  ReleaseMode,
  RequiredScope,
  SetupStage,
  SyncState,
  Visibility,
} from "./enums";

/* ───────────── Pessoas ───────────── */

export interface UserRef {
  bitrixUserId: string;
  name: string;
  position: string | null;
}

export interface PersonDTO {
  id: string;
  bitrixUserId: string | null;
  name: string;
  email: string | null;
  position: string | null;
  department: string | null;
  active: boolean;
  source: "bitrix" | "manual" | "crm";
}

/* ───────────── Trilhas (modelos) ───────────── */

export interface LedgerTag {
  kind: LedgerKind;
  name: string;
}

export interface ChecklistTemplateItem {
  /** Chave estável dentro da atividade (ex.: "google-workspace"). */
  key: string;
  text: string;
  /** Quando concluído no onboarding, vira item do inventário da pessoa. */
  ledger: LedgerTag | null;
}

export interface LinkItem {
  label: string;
  url: string;
}

/** Documento que o RH pede ao colaborador numa atividade do link pessoal (ex.: "Comprovante de residência"). */
export interface DocumentRequest {
  /** Chave estável dentro da atividade (ex.: "comprovante-residencia"). */
  key: string;
  name: string;
  /** Orientação curta para o colaborador (ex.: "Conta de luz ou água dos últimos 3 meses"). */
  hint: string;
  required: boolean;
}

/** Arquivo recebido pelo link pessoal. O arquivo vai para o Drive do projeto no Bitrix24; o Nexo guarda só os dados abaixo. */
export interface ReceivedDocumentDTO {
  id: string;
  fileName: string;
  size: number;
  receivedAt: string;
  status: DocumentStatus;
  /** Abre o arquivo no Bitrix24 (Drive do projeto), depois do envio. */
  bitrixUrl: string | null;
  error: string | null;
}

export interface ActivityDocumentDTO extends DocumentRequest {
  files: ReceivedDocumentDTO[];
}

export interface TemplateActivityDTO {
  id: string;
  position: number;
  title: string;
  instructions: string;
  kind: ActivityKind;
  role: ActivityRole;
  /** Dias relativos à data-âncora (1º dia ou último dia). Negativo = antes. */
  dueOffsetDays: number;
  dueOffsetUnit: OffsetUnit;
  /** HH:MM no fuso da empresa. */
  dueTime: string;
  required: boolean;
  visibility: Visibility;
  requiresApproval: boolean;
  /** Atividade de desligamento que recebe a lista "Revogar e recolher" do inventário. */
  ledgerRole: "revoke_and_collect" | null;
  checklist: ChecklistTemplateItem[];
  links: LinkItem[];
  /** Documentos pedidos ao colaborador (só em atividade do colaborador visível no link). Ausente = nenhum. */
  documents?: DocumentRequest[];
}

export interface TemplateStageDTO {
  id: string;
  position: number;
  name: string;
  description: string;
  releaseMode: ReleaseMode;
  releaseOffsetDays: number;
  releaseOffsetUnit: OffsetUnit;
  /**
   * Só em "quando a etapa anterior terminar": data-limite (dias a partir da data-âncora, na mesma unidade). Nessa data a
   * etapa libera mesmo que a anterior não tenha terminado. Nulo/ausente = espera a anterior sem limite.
   */
  releaseLatestOffsetDays?: number | null;
  activities: TemplateActivityDTO[];
}

export interface TemplateSummaryDTO {
  id: string;
  kind: JourneyKind;
  name: string;
  profile: string;
  description: string;
  version: number;
  archived: boolean;
  stageCount: number;
  activityCount: number;
  /** Menor e maior deslocamento de prazo, em dias (ex.: -5 a 90). */
  span: { fromDays: number; toDays: number };
  updatedAt: string;
}

export interface TemplateDTO extends TemplateSummaryDTO {
  stages: TemplateStageDTO[];
}

/** Atividade pronta da biblioteca (só leitura), para inserir em trilhas. */
export interface LibraryActivityDTO {
  id: string;
  journeyKind: JourneyKind | "both";
  group: string;
  activity: Omit<TemplateActivityDTO, "id" | "position">;
}

/* ───────────── Jornadas ───────────── */

export interface JourneyChecklistItem {
  key: string;
  text: string;
  done: boolean;
  bitrixItemId: string | null;
  ledger: LedgerTag | null;
}

export interface ActivityDTO {
  id: string;
  journeyId: string;
  stagePosition: number;
  position: number;
  title: string;
  instructions: string;
  kind: ActivityKind;
  role: ActivityRole;
  assignee: UserRef | null;
  dueAt: string;
  required: boolean;
  visibility: Visibility;
  requiresApproval: boolean;
  status: ActivityStatus;
  overdue: boolean;
  checklist: JourneyChecklistItem[];
  links: LinkItem[];
  /** Documentos pedidos e o que já chegou pelo link pessoal. Ausente = nenhum pedido. */
  documents?: ActivityDocumentDTO[];
  bitrixTaskId: string | null;
  bitrixUrl: string | null;
  bitrixMissing: boolean;
  syncState: SyncState;
  syncError: string | null;
  releasedAt: string | null;
  /** Quando a etapa ainda está bloqueada: previsão de liberação (em "depois da anterior", a data-limite). */
  releasesAt: string | null;
  /** Como a etapa da atividade libera (para dizer "depois da etapa anterior ou em 3 dias"). */
  releaseMode?: ReleaseMode;
  doneAt: string | null;
  doneSource: "bitrix" | "nexo" | "link" | null;
}

export interface LineStationDTO {
  position: number;
  name: string;
  state: "done" | "current" | "upcoming";
}

export type JourneyRisk = "ok" | "attention" | "critical";

export interface JourneySummaryDTO {
  id: string;
  kind: JourneyKind;
  person: PersonDTO;
  templateName: string;
  profile: string;
  /** 1º dia (entrada) ou último dia (saída). */
  anchorDate: string;
  status: JourneyStatus;
  progress: { done: number; total: number; percent: number };
  line: LineStationDTO[];
  nextStop: { label: string; at: string } | null;
  risk: JourneyRisk;
  /** Por que o selo não está "Em dia" (ex.: "“Preparar acessos” vence em menos de 2 dias"). */
  riskReason?: string | null;
}

export interface JourneyStageDTO {
  position: number;
  name: string;
  state: "done" | "current" | "upcoming";
  releaseMode: ReleaseMode;
  releasesAt: string | null;
  activities: ActivityDTO[];
}

export interface LedgerItemDTO {
  id: string;
  personId: string;
  kind: LedgerKind;
  name: string;
  detail: string;
  status: LedgerStatus;
  source: "onboarding" | "manual";
  grantedAt: string | null;
  closedAt: string | null;
  waivedReason: string | null;
}

export interface CompletionCheckDTO {
  ok: boolean;
  blockers: string[];
}

export interface CollaboratorLinkDTO {
  active: boolean;
  expiresAt: string | null;
  /** Só existe na resposta que cria o link; depois o Nexo guarda apenas o hash. */
  url?: string;
}

export interface AuditEntryDTO {
  at: string;
  actor: string;
  action: string;
  detail: string;
}

export interface JourneyDTO {
  summary: JourneySummaryDTO;
  participants: Partial<Record<ParticipantRole, UserRef>>;
  stages: JourneyStageDTO[];
  ledger: LedgerItemDTO[];
  link: CollaboratorLinkDTO;
  source: { type: "manual" | "trigger"; label: string | null; crmUrl: string | null };
  /** Só para o RH; nunca vai para a página do colaborador. */
  offboardingReason: OffboardingReason | null;
  completion: CompletionCheckDTO;
  projectUrl: string | null;
  history: AuditEntryDTO[];
}

/** Resumo antes de iniciar: "14 atividades em 45 dias: TI 5, Gestor 4…". */
export interface JourneyPreviewDTO {
  activityCount: number;
  spanDays: number;
  firstDueAt: string | null;
  lastDueAt: string | null;
  byRole: Partial<Record<ActivityRole, number>>;
  releasedNow: number;
  missingAssignees: ActivityRole[];
}

/* ───────────── Painel de hoje ───────────── */

export type BoardRowKind = "detection" | "missing_data" | "sync_error" | "hr_activity" | "risk" | "approval";
export type BoardActionType = "start_journey" | "open_activity" | "nudge" | "approve" | "resolve_sync" | "link_person" | "open_journey";

export interface BoardRowDTO {
  id: string;
  kind: BoardRowKind;
  when: { label: string; at: string | null; overdue: boolean };
  who: { name: string; journeyId: string | null; kind: JourneyKind | null };
  what: string;
  reason: string;
  status: { tone: "ok" | "attention" | "late" | "info"; label: string };
  action: { type: BoardActionType; label: string; targetId: string };
}

export interface SyncStatusDTO {
  connected: boolean;
  lastCycleAt: string | null;
  lastError: string | null;
  rateLimitedUntil: string | null;
  queued: number;
}

export interface TodayDTO {
  date: string;
  greetingName: string;
  counters: { actions: number; arriving: number; leaving: number };
  board: BoardRowDTO[];
  lines: JourneySummaryDTO[];
  upcoming: Array<{ journeyId: string; personName: string; kind: JourneyKind; anchorDate: string; daysUntil: number }>;
  sync: SyncStatusDTO;
}

/* ───────────── Automação (CRM) ───────────── */

export interface DetectionDTO {
  id: string;
  triggerId: string;
  triggerName: string;
  journeyKind: JourneyKind;
  templateId: string;
  entityTypeId: number;
  entityId: number;
  title: string;
  personName: string | null;
  personEmail: string | null;
  bitrixUserId: string | null;
  suggestedDate: string | null;
  crmUrl: string | null;
  detectedAt: string;
  status: DetectionStatus;
}

export interface TriggerFieldMap {
  date?: string;
  name?: string;
  email?: string;
  bitrixUser?: string;
}

export interface TriggerDTO {
  id: string;
  name: string;
  journeyKind: JourneyKind;
  entityTypeId: number;
  categoryId: number | null;
  stageId: string;
  stageName: string | null;
  sourceName: string | null;
  templateId: string;
  fieldMap: TriggerFieldMap;
  enabled: boolean;
  lastRunAt: string | null;
  lastError: string | null;
}

export interface CrmSourceDTO {
  entityTypeId: number;
  kind: "lead" | "deal" | "smart_process";
  name: string;
  categories: Array<{ id: number | null; name: string; stages: Array<{ id: string; name: string }> }>;
  fields: Array<{ id: string; name: string; type: string }>;
}

/* ───────────── Instalação, sessão e ajustes ───────────── */

export interface ScopeCheckDTO {
  required: Record<RequiredScope, boolean>;
  optional: Record<OptionalScope, boolean>;
}

export interface SetupStateDTO {
  stage: SetupStage;
  portal: string | null;
  webhookOwner: UserRef | null;
  scopes: ScopeCheckDTO | null;
}

/** Resposta pública de /api/status (sem segredos). */
export interface StatusDTO {
  setup: SetupStage;
  version: string;
  commit: string;
}

export interface MeDTO {
  user: { id: string; name: string; email: string; role: AppRole; mustChangePassword: boolean };
  setup: SetupStateDTO;
}

export interface SessionDTO {
  token: string;
  expiresAt: string;
  me: MeDTO;
}

/** Trabalho demorado começado pelo navegador (resposta 202): a tela consulta GET /api/tasks/:taskId até terminar. */
export interface TaskStartedDTO {
  taskId: string;
}

export type TaskStatusDTO<T = unknown> = { state: "running" } | { state: "done"; result: T };

export interface WebhookCheckDTO {
  /** Token curto que liga a criação do primeiro acesso a esta aba. */
  installToken: string;
  portal: string;
  owner: UserRef;
  scopes: ScopeCheckDTO;
}

export interface CollaboratorContentDTO {
  welcomeMessage: string;
  farewellMessage: string;
  contacts: Array<{ label: string; value: string }>;
  faqOnboarding: Array<{ question: string; answer: string }>;
  faqOffboarding: Array<{ question: string; answer: string }>;
}

export interface SettingsDTO {
  company: { name: string; timezone: string };
  portal: string | null;
  webhook: { masked: string; owner: UserRef; scopes: ScopeCheckDTO; verifiedAt: string } | null;
  project: { id: string; name: string; url: string } | null;
  defaults: Partial<Record<ParticipantRole, UserRef>>;
  content: CollaboratorContentDTO;
  features: { notifications: boolean; calendar: boolean; feed: boolean };
  /** Pedido de documentos: o webhook precisa da permissão Drive (disk). */
  documentsEnabled?: boolean;
}

export interface AppUserDTO {
  id: string;
  name: string;
  email: string;
  role: AppRole;
  active: boolean;
  lastLoginAt: string | null;
}

export interface DiagnosticsDTO {
  build: { version: string; commit: string; buildTime: string };
  node: string;
  database: { driver: string; journalMode: string; dataDir: string };
  scheduler: { running: boolean; lastCycleAt: string | null; lastCycleMs: number | null; lastError: string | null; nextCycleAt: string | null };
  queue: { queued: number; failed: number };
  rateLimitedUntil: string | null;
  recentBitrixErrors: Array<{ at: string; method: string; code: string | null }>;
}

/* ───────────── Página do colaborador (/j/:token) ───────────── */

export interface CollaboratorActivityDTO {
  id: string;
  title: string;
  instructions: string;
  kind: ActivityKind;
  dueAt: string;
  /** todo: a fazer; done: feita; waiting: ainda não liberada. */
  status: "todo" | "done" | "waiting";
  /** Atividade do próprio colaborador (pode marcar como feita). As outras aparecem como "o que vai acontecer". */
  mine: boolean;
  /** Ex.: "TI" para "TI está preparando seu notebook". Nunca o nome de quem executa tarefas internas do RH. */
  ownerLabel: string;
  links: LinkItem[];
  /** Documentos pedidos nesta atividade, com os nomes dos arquivos já enviados. Ausente = nenhum pedido. */
  documents?: Array<DocumentRequest & { received: Array<{ fileName: string; receivedAt: string }> }>;
}

export interface CollaboratorViewDTO {
  kind: JourneyKind;
  company: string;
  person: { firstName: string; name: string };
  /** 1º dia (entrada) ou último dia (saída). */
  anchorDate: string;
  /** Dias até a data-âncora no fuso da empresa (negativo depois dela). */
  daysUntilAnchor: number;
  /** Mensagem de boas-vindas (entrada) ou de agradecimento (saída), configurada pelo RH. */
  message: string;
  progress: { done: number; total: number; percent: number };
  stages: Array<{ position: number; name: string; state: "done" | "current" | "upcoming"; activities: CollaboratorActivityDTO[] }>;
  people: Array<{ role: "gestor" | "buddy" | "rh"; name: string; position: string | null }>;
  contacts: Array<{ label: string; value: string }>;
  faq: Array<{ question: string; answer: string }>;
  completed: boolean;
  /** O link aceita envio de arquivos (webhook com Drive e jornada em andamento). */
  uploadsEnabled?: boolean;
}

/** Erro padrão de toda a API: mensagem em pt-BR pronta para a tela. */
export interface ApiErrorDTO {
  error: { code: string; message: string };
}
