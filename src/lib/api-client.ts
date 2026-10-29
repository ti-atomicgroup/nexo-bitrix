/**
 * Cliente da API do Nexo (mesma origem, `/api/...`), uma função por rota de `src/shared/api.ts`.
 * Login sem cookie: token Bearer guardado em localStorage → sessionStorage → memória (o iframe da Onnira
 * pode bloquear o armazenamento). Erros viram `ApiError` com a mensagem pt-BR pronta para a tela.
 */
import type { z } from "zod";
import { API_ROUTES, type ApiRouteName } from "@/shared/api";
import type {
  ActivityDTO,
  ApiErrorDTO,
  AppUserDTO,
  AuditEntryDTO,
  CollaboratorLinkDTO,
  CrmSourceDTO,
  DetectionDTO,
  DiagnosticsDTO,
  JourneyDTO,
  JourneyPreviewDTO,
  JourneySummaryDTO,
  LedgerItemDTO,
  LibraryActivityDTO,
  MeDTO,
  PersonDTO,
  SessionDTO,
  SettingsDTO,
  SetupStateDTO,
  StatusDTO,
  SyncStatusDTO,
  TaskStartedDTO,
  TaskStatusDTO,
  TemplateDTO,
  TemplateSummaryDTO,
  TodayDTO,
  TriggerDTO,
  WebhookCheckDTO,
} from "@/shared/contracts";
import type { JourneyKind, JourneyStatus } from "@/shared/enums";
import type * as Schemas from "@/shared/schemas";
import { safeGet, safeRemove, safeSet } from "./storage";

/* ───────────── Erros ───────────── */

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  /** Código técnico seguro para a tela (ex.: ENOTFOUND), quando o servidor manda um. */
  readonly detail: string | null;

  constructor(code: string, message: string, status: number, detail: string | null = null) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.detail = detail;
  }
}

export function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error && (error as { name: unknown }).name === "AbortError";
}

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  return new ApiError("unexpected", "Algo não saiu como esperado. Tente de novo.", 0);
}

/* ───────────── Token de sessão ───────────── */

const TOKEN_KEY = "nexo.session";
let memoryToken: string | null = null;
const tokenListeners = new Set<() => void>();

function notifyToken(): void {
  for (const listener of tokenListeners) listener();
}

export function getToken(): string | null {
  return safeGet("local", TOKEN_KEY) ?? safeGet("session", TOKEN_KEY) ?? memoryToken;
}

export function setToken(token: string): void {
  memoryToken = token;
  if (!safeSet("local", TOKEN_KEY, token)) safeSet("session", TOKEN_KEY, token);
  notifyToken();
}

export function clearToken(): void {
  memoryToken = null;
  safeRemove("local", TOKEN_KEY);
  safeRemove("session", TOKEN_KEY);
  notifyToken();
}

/** Para `useSyncExternalStore`: avisa quando o token muda nesta aba ou em outra. */
export function subscribeToken(listener: () => void): () => void {
  tokenListeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === TOKEN_KEY || event.key === null) listener();
  };
  if (typeof window !== "undefined") window.addEventListener("storage", onStorage);
  return () => {
    tokenListeners.delete(listener);
    if (typeof window !== "undefined") window.removeEventListener("storage", onStorage);
  };
}

/* ───────────── Token de instalação (preso à aba que validou o webhook) ───────────── */

const INSTALL_KEY = "nexo.install";
let memoryInstallToken: string | null = null;

export function getInstallToken(): string | null {
  return safeGet("session", INSTALL_KEY) ?? memoryInstallToken;
}

export function setInstallToken(token: string): void {
  memoryInstallToken = token;
  safeSet("session", INSTALL_KEY, token);
}

export function clearInstallToken(): void {
  memoryInstallToken = null;
  safeRemove("session", INSTALL_KEY);
}

/* ───────────── Transporte ───────────── */

type QueryValue = string | number | boolean | null | undefined;

export interface CallOptions {
  signal?: AbortSignal;
}

interface RequestOptions extends CallOptions {
  params?: Record<string, string>;
  query?: Record<string, QueryValue>;
  body?: unknown;
}

const NETWORK_MESSAGE = "Sem conexão com o servidor do Nexo. Confira a internet e tente de novo.";

function buildPath(name: ApiRouteName, params?: Record<string, string>, query?: Record<string, QueryValue>): string {
  const template = API_ROUTES[name].path.split("?")[0] ?? "";
  const path = template.replace(/:([A-Za-z]+)/g, (_match, key: string) => {
    const value = params?.[key];
    if (value === undefined || value === "") throw new ApiError("bad_request", "Faltou um identificador na chamada.", 0);
    return encodeURIComponent(value);
  });
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== "") search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `${path}?${qs}` : path;
}

function isApiErrorBody(value: unknown): value is ApiErrorDTO {
  if (typeof value !== "object" || value === null || !("error" in value)) return false;
  const error = (value as { error: unknown }).error;
  return typeof error === "object" && error !== null && "message" in error && typeof (error as { message: unknown }).message === "string";
}

function fallbackMessage(status: number): string {
  if (status === 401) return "Sua sessão terminou. Entre de novo.";
  // O 403 do próprio Nexo vem em JSON com mensagem; sem JSON, quem recusou foi a hospedagem (na Onnira, a autorização do painel vence em 10 min).
  if (status === 403) return "A autorização do painel da hospedagem venceu. Recarregue a página (F5) e abra o Nexo de novo.";
  if (status === 404) return "Não encontramos o que você procurou. Ele pode ter sido removido.";
  if (status === 409) return "Alguém mudou estes dados agora há pouco. Recarregue e tente de novo.";
  if (status === 429) return "Muitas tentativas seguidas. Espere um pouco e tente de novo.";
  if (status >= 500) return "O servidor do Nexo teve um problema. Tente de novo em instantes.";
  return "Não foi possível concluir. Tente de novo.";
}

async function call<T>(name: ApiRouteName, options: RequestOptions = {}): Promise<T> {
  const route = API_ROUTES[name];
  const headers: Record<string, string> = { Accept: "application/json" };
  const token = getToken();
  // A borda da Onnira remove `Authorization`; o servidor lê primeiro o cabeçalho próprio.
  if (token) headers["X-Nexo-Session"] = token;
  if (options.body !== undefined) headers["Content-Type"] = "application/json";

  let response: Response;
  try {
    response = await fetch(buildPath(name, options.params, options.query), {
      method: route.method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      cache: "no-store",
      credentials: "same-origin",
      signal: options.signal,
    });
  } catch (error) {
    if (isAbortError(error)) throw error;
    throw new ApiError("network", NETWORK_MESSAGE, 0);
  }

  const text = await response.text();
  let payload: unknown = undefined;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = undefined;
    }
  }

  if (!response.ok) {
    const sessionRoute = route.auth === "user" || route.auth === "admin";
    if (response.status === 401 && sessionRoute) clearToken();
    if (isApiErrorBody(payload)) {
      const description = (payload.error as { details?: { description?: unknown } }).details?.description;
      throw new ApiError(payload.error.code || `http_${response.status}`, payload.error.message, response.status, typeof description === "string" ? description : null);
    }
    throw new ApiError(`http_${response.status}`, fallbackMessage(response.status), response.status);
  }

  if (payload === undefined && text) {
    throw new ApiError("bad_response", "O servidor respondeu num formato inesperado. Tente de novo.", response.status);
  }
  return payload as T;
}

/* ───────────── Trabalho em segundo plano (202 + consulta) ───────────── */

const TASK_FIRST_CHECK_MS = 700;
const TASK_POLL_MS = 1_000;
const TASK_LIMIT_MS = 3 * 60 * 1000;
/** Falhas de rede seguidas toleradas na consulta (a resposta do gateway pode oscilar). */
const TASK_NETWORK_RETRIES = 3;

function pause(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException("Aborted", "AbortError"));
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}

/**
 * Começa um trabalho demorado (a rota responde 202 com o id) e consulta em chamadas curtas até o resultado.
 * Falha do trabalho chega como `ApiError`, com a mesma mensagem de quando a chamada era direta.
 */
async function runTask<T>(name: ApiRouteName, options: RequestOptions): Promise<T> {
  const { taskId } = await call<TaskStartedDTO>(name, options);
  const deadline = Date.now() + TASK_LIMIT_MS;
  let networkFailures = 0;
  await pause(TASK_FIRST_CHECK_MS, options.signal);
  for (;;) {
    try {
      const status = await call<TaskStatusDTO<T>>("task", { signal: options.signal, params: { taskId } });
      if (status.state === "done") return status.result;
      networkFailures = 0;
    } catch (error) {
      if (!(error instanceof ApiError && error.code === "network") || ++networkFailures > TASK_NETWORK_RETRIES) throw error;
    }
    if (Date.now() > deadline) throw new ApiError("task_timeout", "O Bitrix24 está demorando para responder. Tente de novo em instantes.", 0);
    await pause(TASK_POLL_MS, options.signal);
  }
}

/* ───────────── Tipos de entrada (formato aceito pelos esquemas, antes dos padrões) ───────────── */

type In<S extends z.ZodType> = z.input<S>;

export type ConnectWebhookBody = In<typeof Schemas.connectWebhookInput>;
export type CreateAccountBody = In<typeof Schemas.createAccountInput>;
export type PrepareBody = In<typeof Schemas.prepareInput>;
export type LoginBody = In<typeof Schemas.loginInput>;
export type ChangePasswordBody = In<typeof Schemas.changePasswordInput>;
export type LedgerItemBody = In<typeof Schemas.ledgerItemInput>;
export type LedgerWaiveBody = In<typeof Schemas.ledgerWaiveInput>;
export type CreateJourneyBody = In<typeof Schemas.createJourneyInput>;
export type JourneyActionBody = In<typeof Schemas.journeyActionInput>;
export type LinkPersonBody = In<typeof Schemas.linkPersonInput>;
export type CollaboratorLinkBody = In<typeof Schemas.collaboratorLinkInput>;
export type CollaboratorMessageBody = In<typeof Schemas.collaboratorMessageInput>;
export type ActivityActionBody = In<typeof Schemas.activityActionInput>;
export type TemplateBody = In<typeof Schemas.templateInput>;
export type TriggerBody = In<typeof Schemas.triggerInput>;
export type SettingsBody = In<typeof Schemas.settingsInput>;
export type ReplaceWebhookBody = In<typeof Schemas.replaceWebhookInput>;
export type CreateUserBody = In<typeof Schemas.createUserInput>;
export type UpdateUserBody = In<typeof Schemas.updateUserInput>;

export interface HealthDTO {
  ok: boolean;
  version: string;
  commit: string;
  buildTime: string;
  node: string;
}

export interface Ok {
  ok: true;
}

/* ───────────── Rotas ───────────── */

export const api = {
  /* Público */
  health: (o?: CallOptions) => call<HealthDTO>("health", o),
  status: (o?: CallOptions) => call<StatusDTO>("status", o),

  /* Instalação */
  setupConnect: (body: ConnectWebhookBody, o?: CallOptions) => runTask<WebhookCheckDTO>("setupConnect", { ...o, body }),
  setupAccount: async (body: CreateAccountBody, o?: CallOptions) => {
    const session = await call<SessionDTO>("setupAccount", { ...o, body });
    setToken(session.token);
    return session;
  },
  setupPrepare: (body: PrepareBody, o?: CallOptions) => runTask<SetupStateDTO>("setupPrepare", { ...o, body }),
  task: (taskId: string, o?: CallOptions) => call<TaskStatusDTO>("task", { ...o, params: { taskId } }),

  /* Sessão */
  login: async (body: LoginBody, o?: CallOptions) => {
    const session = await call<SessionDTO>("login", { ...o, body });
    setToken(session.token);
    return session;
  },
  logout: async (o?: CallOptions) => {
    try {
      return await call<Ok>("logout", o);
    } finally {
      clearToken();
    }
  },
  me: (o?: CallOptions) => call<MeDTO>("me", o),
  changePassword: (body: ChangePasswordBody, o?: CallOptions) => call<Ok>("changePassword", { ...o, body }),

  /* Painel */
  today: (o?: CallOptions) => call<TodayDTO>("today", o),
  sync: (o?: CallOptions) => call<SyncStatusDTO>("sync", o),

  /* Pessoas */
  people: (query: { query?: string; limit?: number } = {}, o?: CallOptions) => call<PersonDTO[]>("people", { ...o, query }),
  peopleRefresh: (o?: CallOptions) => runTask<{ count: number }>("peopleRefresh", { ...o }),
  personLedger: (personId: string, o?: CallOptions) => call<LedgerItemDTO[]>("personLedger", { ...o, params: { personId } }),
  personLedgerAdd: (personId: string, body: LedgerItemBody, o?: CallOptions) =>
    call<LedgerItemDTO>("personLedgerAdd", { ...o, params: { personId }, body }),
  ledgerWaive: (ledgerItemId: string, body: LedgerWaiveBody, o?: CallOptions) =>
    call<LedgerItemDTO>("ledgerWaive", { ...o, params: { ledgerItemId }, body }),

  /* Jornadas */
  journeys: (query: { status?: JourneyStatus; kind?: JourneyKind } = {}, o?: CallOptions) =>
    call<JourneySummaryDTO[]>("journeys", { ...o, query }),
  journeyPreview: (body: CreateJourneyBody, o?: CallOptions) => call<JourneyPreviewDTO>("journeyPreview", { ...o, body }),
  journeyCreate: (body: CreateJourneyBody, o?: CallOptions) => call<{ id: string }>("journeyCreate", { ...o, body }),
  journey: (journeyId: string, o?: CallOptions) => call<JourneyDTO>("journey", { ...o, params: { journeyId } }),
  journeyAction: (journeyId: string, body: JourneyActionBody, o?: CallOptions) =>
    call<JourneyDTO>("journeyAction", { ...o, params: { journeyId }, body }),
  journeyLinkPerson: (journeyId: string, body: LinkPersonBody, o?: CallOptions) =>
    call<JourneyDTO>("journeyLinkPerson", { ...o, params: { journeyId }, body }),
  journeyCollaboratorLink: (journeyId: string, body: CollaboratorLinkBody, o?: CallOptions) =>
    call<CollaboratorLinkDTO>("journeyCollaboratorLink", { ...o, params: { journeyId }, body }),
  journeyCollaboratorMessage: (journeyId: string, body: CollaboratorMessageBody, o?: CallOptions) =>
    runTask<{ sent: true }>("journeyCollaboratorMessage", { ...o, params: { journeyId }, body }),
  activityAction: (activityId: string, body: ActivityActionBody, o?: CallOptions) =>
    call<ActivityDTO>("activityAction", { ...o, params: { activityId }, body }),

  /* Trilhas */
  templates: (o?: CallOptions) => call<TemplateSummaryDTO[]>("templates", o),
  templateCreate: (body: TemplateBody, o?: CallOptions) => call<TemplateDTO>("templateCreate", { ...o, body }),
  template: (templateId: string, o?: CallOptions) => call<TemplateDTO>("template", { ...o, params: { templateId } }),
  templateUpdate: (templateId: string, body: TemplateBody, o?: CallOptions) =>
    call<TemplateDTO>("templateUpdate", { ...o, params: { templateId }, body }),
  templateArchive: (templateId: string, o?: CallOptions) => call<Ok>("templateArchive", { ...o, params: { templateId } }),
  library: (o?: CallOptions) => call<LibraryActivityDTO[]>("library", o),

  /* Automação */
  detectionDismiss: (detectionId: string, o?: CallOptions) => call<Ok>("detectionDismiss", { ...o, params: { detectionId } }),
  detection: (detectionId: string, o?: CallOptions) => call<DetectionDTO>("detection", { ...o, params: { detectionId } }),
  crmSources: (o?: CallOptions) => runTask<CrmSourceDTO[]>("crmSources", { ...o }),
  triggers: (o?: CallOptions) => call<TriggerDTO[]>("triggers", o),
  triggerCreate: (body: TriggerBody, o?: CallOptions) => call<TriggerDTO>("triggerCreate", { ...o, body }),
  triggerUpdate: (triggerId: string, body: TriggerBody, o?: CallOptions) =>
    call<TriggerDTO>("triggerUpdate", { ...o, params: { triggerId }, body }),
  triggerDelete: (triggerId: string, o?: CallOptions) => call<Ok>("triggerDelete", { ...o, params: { triggerId } }),

  /* Ajustes */
  settings: (o?: CallOptions) => call<SettingsDTO>("settings", o),
  settingsUpdate: (body: SettingsBody, o?: CallOptions) => call<SettingsDTO>("settingsUpdate", { ...o, body }),
  webhookReplace: (body: ReplaceWebhookBody, o?: CallOptions) => runTask<SettingsDTO>("webhookReplace", { ...o, body }),
  users: (o?: CallOptions) => call<AppUserDTO[]>("users", o),
  userCreate: (body: CreateUserBody, o?: CallOptions) => call<AppUserDTO>("userCreate", { ...o, body }),
  userUpdate: (userId: string, body: UpdateUserBody, o?: CallOptions) => call<AppUserDTO>("userUpdate", { ...o, params: { userId }, body }),
  diagnostics: (o?: CallOptions) => call<DiagnosticsDTO>("diagnostics", o),
  audit: (query: { limit?: number } = {}, o?: CallOptions) => call<AuditEntryDTO[]>("audit", { ...o, query }),
} satisfies Record<ApiRouteName, (...args: never[]) => Promise<unknown>>;

export type Api = typeof api;
