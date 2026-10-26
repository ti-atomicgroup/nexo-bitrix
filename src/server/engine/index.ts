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
import type { CrmSourceDTO, JourneyPreviewDTO, LibraryActivityDTO } from "@/shared/contracts";
import type { ActivityActionInput, CreateJourneyInput, JourneyActionInput, LedgerItemInput, PrepareInput, TemplateInput } from "@/shared/schemas";
import { maskWebhookUrl as maskUrl } from "../bitrix/webhook-url";
import type { LedgerRow } from "../db/repos/ledger";
import { activityLibrary as library } from "../seeds/library";
import { starterTemplates as starters } from "../seeds/templates";
import * as actions from "./actions";
import * as journeys from "./journeys";
import * as people from "./people";
import * as prepare from "./prepare";
import { bitrixRateLimitedUntil as rateLimitedUntil } from "./runtime";
import * as scheduler from "./scheduler";
import * as triggers from "./triggers";
import type { Actor, SchedulerStatus, WebhookCheck } from "./types";

export type { Actor, SchedulerStatus, WebhookCheck } from "./types";

/* ───────────── Instalação ───────────── */

/** Valida o formato do URL, chama `user.current` e `scope` no Bitrix e devolve o dono, os escopos e o URL cifrado. Não grava nada. */
export async function verifyWebhook(url: string): Promise<WebhookCheck> {
  return prepare.verifyWebhook(url);
}

/** "https://empresa.bitrix24.com.br/rest/1/••••••/" — para exibir sem revelar o segredo. */
export function maskWebhookUrl(url: string): string {
  return maskUrl(url);
}

/**
 * Passo 3 da instalação: atualiza o cache de pessoas, procura ou cria o projeto privado, carrega as trilhas iniciais
 * (se ainda não houver trilhas), grava empresa, fuso e responsáveis padrão e marca a instalação como pronta.
 */
export async function prepareWorkspace(input: PrepareInput, actor: Actor): Promise<void> {
  return prepare.prepareWorkspace(input, actor);
}

/* ───────────── Pessoas ───────────── */

/** Atualiza o cache local de usuários ativos do Bitrix. Devolve quantos foram gravados. */
export async function refreshPeople(): Promise<number> {
  return people.refreshPeople();
}

/* ───────────── Jornadas ───────────── */

export function previewJourney(input: CreateJourneyInput): JourneyPreviewDTO {
  return journeys.previewJourney(input);
}

/** Cria a jornada (idempotente por `requestId` ou detecção), libera as etapas devidas, enfileira as tarefas e chama `kick()`. */
export function createJourney(input: CreateJourneyInput, actor: Actor): { id: string } {
  return journeys.createJourney(input, actor);
}

/** pause | resume | cancel | complete (complete exige `completionCheck` ok). */
export function applyJourneyAction(journeyId: string, input: JourneyActionInput, actor: Actor): void {
  journeys.applyJourneyAction(journeyId, input, actor);
}

/** Liga a pessoa sem conta ao usuário Bitrix e envia as tarefas do colaborador que já estavam liberadas. */
export function linkJourneyPerson(journeyId: string, bitrixUserId: string, actor: Actor): void {
  journeys.linkJourneyPerson(journeyId, bitrixUserId, actor);
}

/** complete | reopen | approve | nudge | toggle_item. Atualiza localmente e enfileira a escrita no Bitrix. */
export function applyActivityAction(activityId: string, input: ActivityActionInput, actor: Actor): void {
  actions.applyActivityAction(activityId, input, actor);
}

/** "Marcar como feita" vindo do link do colaborador. Só aceita atividades do próprio colaborador, visíveis e liberadas. */
export function markDoneFromLink(journeyId: string, activityId: string): { ok: boolean; message: string } {
  return actions.markDoneFromLink(journeyId, activityId);
}

/* ───────────── Inventário ───────────── */

export function addManualLedgerItem(personId: string, input: LedgerItemInput, actor: Actor): LedgerRow {
  return actions.addManualLedgerItem(personId, input, actor);
}

/** Dispensa exige motivo; o item deixa de bloquear a conclusão da saída. */
export function waiveLedgerItem(itemId: string, reason: string, actor: Actor): LedgerRow {
  return actions.waiveLedgerItem(itemId, reason, actor);
}

/* ───────────── Automação (CRM) ───────────── */

/** Funis e etapas de leads, negócios e processos inteligentes, lidos ao vivo do Bitrix (só para a tela de configuração). */
export async function listCrmSources(): Promise<CrmSourceDTO[]> {
  return triggers.listCrmSources();
}

/** Maior ID atual de `crm.stagehistory.list` para a entidade: cursor inicial de um gatilho novo (não reprocessa o passado). */
export async function currentStageHistoryCursor(entityTypeId: number): Promise<number | null> {
  return triggers.currentStageHistoryCursor(entityTypeId);
}

/* ───────────── Trilhas ───────────── */

export function starterTemplates(): TemplateInput[] {
  return starters();
}

export function activityLibrary(): LibraryActivityDTO[] {
  return library();
}

/* ───────────── Agendador ───────────── */

/** Inicia o laço de sincronização (idempotente). Desligado em `next dev`, salvo `NEXO_SCHEDULER=1`. */
export function startScheduler(): void {
  scheduler.startScheduler();
}

/** Pede um ciclo o quanto antes (com debounce). Seguro de chamar em qualquer rota. */
export function kick(): void {
  scheduler.kick();
}

/** Religa o laço se ele parou (chamado pelas rotas a cada requisição). */
export function ensureScheduler(): void {
  scheduler.ensureScheduler();
}

export function schedulerStatus(): SchedulerStatus {
  return scheduler.schedulerStatus();
}

/** ISO até quando o Bitrix está limitando a taxa (ou null). */
export function bitrixRateLimitedUntil(): string | null {
  return rateLimitedUntil();
}
