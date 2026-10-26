import "server-only";
/**
 * Interface pública do motor (Bitrix + regras de jornada + agendador). CONTRATO congelado pelo lead:
 * E1 implementa em módulos próprios e reexporta aqui com exatamente estas assinaturas.
 * E3 (serviços e rotas da API) importa só deste arquivo e de `@/server/domain`.
 *
 * Regras gerais:
 * - Funções síncronas só mexem no SQLite e enfileiram jobs; quem fala com o Bitrix é o ciclo (`kick()` agenda um ciclo imediato).
 * - Exceções esperadas são `AppError` (src/server/errors.ts) com mensagem pt-BR.
 */
import type { CrmSourceDTO, JourneyPreviewDTO, LibraryActivityDTO, UserRef } from "@/shared/contracts";
import type { ActivityActionInput, CreateJourneyInput, JourneyActionInput, LedgerItemInput, PrepareInput, TemplateInput } from "@/shared/schemas";
import type { LedgerRow } from "../db/repos/ledger";

export interface Actor {
  type: "user" | "system" | "link";
  id: string | null;
  name: string | null;
}

export interface WebhookCheck {
  portal: string;
  owner: UserRef;
  /** Escopos concedidos ao webhook (resposta do método `scope`). */
  scopes: string[];
  /** URL cifrada (AES-256-GCM), pronta para `setWebhookRecord`. */
  encryptedUrl: string;
}

export interface SchedulerStatus {
  running: boolean;
  lastCycleAt: string | null;
  lastCycleMs: number | null;
  lastError: string | null;
  nextCycleAt: string | null;
}

const pending = (name: string): never => {
  throw new Error(`engine.${name} ainda não implementado (E1).`);
};

/* ───────────── Instalação ───────────── */

/** Valida o formato do URL, chama `user.current` e `scope` no Bitrix e devolve o dono, os escopos e o URL cifrado. Não grava nada. */
export async function verifyWebhook(url: string): Promise<WebhookCheck> {
  void url;
  return pending("verifyWebhook");
}

/** "https://empresa.bitrix24.com.br/rest/1/••••••/" — para exibir sem revelar o segredo. */
export function maskWebhookUrl(url: string): string {
  void url;
  return pending("maskWebhookUrl");
}

/**
 * Passo 3 da instalação: atualiza o cache de pessoas, procura ou cria o projeto privado, carrega as trilhas iniciais
 * (se ainda não houver trilhas), grava empresa, fuso e responsáveis padrão e marca a instalação como pronta.
 */
export async function prepareWorkspace(input: PrepareInput, actor: Actor): Promise<void> {
  void input;
  void actor;
  return pending("prepareWorkspace");
}

/* ───────────── Pessoas ───────────── */

/** Atualiza o cache local de usuários ativos do Bitrix. Devolve quantos foram gravados. */
export async function refreshPeople(): Promise<number> {
  return pending("refreshPeople");
}

/* ───────────── Jornadas ───────────── */

export function previewJourney(input: CreateJourneyInput): JourneyPreviewDTO {
  void input;
  return pending("previewJourney");
}

/** Cria a jornada (idempotente por `requestId` ou detecção), libera as etapas devidas, enfileira as tarefas e chama `kick()`. */
export function createJourney(input: CreateJourneyInput, actor: Actor): { id: string } {
  void input;
  void actor;
  return pending("createJourney");
}

/** pause | resume | cancel | complete (complete exige `completionCheck` ok). */
export function applyJourneyAction(journeyId: string, input: JourneyActionInput, actor: Actor): void {
  void journeyId;
  void input;
  void actor;
  return pending("applyJourneyAction");
}

/** Liga a pessoa sem conta ao usuário Bitrix e envia as tarefas do colaborador que já estavam liberadas. */
export function linkJourneyPerson(journeyId: string, bitrixUserId: string, actor: Actor): void {
  void journeyId;
  void bitrixUserId;
  void actor;
  return pending("linkJourneyPerson");
}

/** complete | reopen | approve | nudge | toggle_item. Atualiza localmente e enfileira a escrita no Bitrix. */
export function applyActivityAction(activityId: string, input: ActivityActionInput, actor: Actor): void {
  void activityId;
  void input;
  void actor;
  return pending("applyActivityAction");
}

/** "Marcar como feita" vindo do link do colaborador. Só aceita atividades do próprio colaborador, visíveis e liberadas. */
export function markDoneFromLink(journeyId: string, activityId: string): { ok: boolean; message: string } {
  void journeyId;
  void activityId;
  return pending("markDoneFromLink");
}

/* ───────────── Inventário ───────────── */

export function addManualLedgerItem(personId: string, input: LedgerItemInput, actor: Actor): LedgerRow {
  void personId;
  void input;
  void actor;
  return pending("addManualLedgerItem");
}

/** Dispensa exige motivo; o item deixa de bloquear a conclusão da saída. */
export function waiveLedgerItem(itemId: string, reason: string, actor: Actor): LedgerRow {
  void itemId;
  void reason;
  void actor;
  return pending("waiveLedgerItem");
}

/* ───────────── Automação (CRM) ───────────── */

/** Funis e etapas de leads, negócios e processos inteligentes, lidos ao vivo do Bitrix (só para a tela de configuração). */
export async function listCrmSources(): Promise<CrmSourceDTO[]> {
  return pending("listCrmSources");
}

/** Maior ID atual de `crm.stagehistory.list` para a entidade: cursor inicial de um gatilho novo (não reprocessa o passado). */
export async function currentStageHistoryCursor(entityTypeId: number): Promise<number | null> {
  void entityTypeId;
  return pending("currentStageHistoryCursor");
}

/* ───────────── Trilhas ───────────── */

export function starterTemplates(): TemplateInput[] {
  return pending("starterTemplates");
}

export function activityLibrary(): LibraryActivityDTO[] {
  return pending("activityLibrary");
}

/* ───────────── Agendador ───────────── */

/** Inicia o laço de sincronização (idempotente). Desligado em `next dev`, salvo `NEXO_SCHEDULER=1`. */
export function startScheduler(): void {
  return pending("startScheduler");
}

/** Pede um ciclo o quanto antes (com debounce). Seguro de chamar em qualquer rota. */
export function kick(): void {
  return pending("kick");
}

/** Religa o laço se ele parou (chamado pelas rotas a cada requisição). */
export function ensureScheduler(): void {
  return pending("ensureScheduler");
}

export function schedulerStatus(): SchedulerStatus {
  return pending("schedulerStatus");
}

/** ISO até quando o Bitrix está limitando a taxa (ou null). */
export function bitrixRateLimitedUntil(): string | null {
  return pending("bitrixRateLimitedUntil");
}
