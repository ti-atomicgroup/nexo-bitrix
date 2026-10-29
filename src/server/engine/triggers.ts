import "server-only";
import type { CrmSourceDTO } from "@/shared/contracts";
import { getCrmItem, listCrmSources as readCrmSources, listStageHistory, maxStageHistoryId, type StageHistoryEntry } from "../bitrix/methods";
import { isBitrixError } from "../bitrix/errors";
import { insertDetectionIfNew } from "../db/repos/detections";
import { listTriggers, updateTrigger, type TriggerRow } from "../db/repos/triggers";
import { errorMessage } from "./job-errors";
import { requireBitrix, type EngineContext } from "./runtime";

/** Páginas (de 50) lidas por gatilho a cada ciclo; o resto fica para o próximo ciclo (o cursor avança). */
const MAX_HISTORY_PAGES = 10;
const PAGE_SIZE = 50;
const CONTACT_ENTITY_TYPE_ID = 3;

/** Última leitura dos funis, por portal: a tela de nova automação acabou de ler e o salvar só precisa dos nomes. */
const SOURCES_KEY = Symbol.for("nexo.crm-sources");
export const CRM_SOURCES_TTL_MS = 10 * 60_000;
type SourcesGlobal = typeof globalThis & { [SOURCES_KEY]?: { portal: string; at: number; sources: CrmSourceDTO[] } };

/** Lê os funis do Bitrix24 (sempre fresco) e guarda a leitura para `recentCrmSources`. */
export async function listCrmSources(): Promise<CrmSourceDTO[]> {
  const client = requireBitrix();
  const sources = await readCrmSources(client);
  (globalThis as SourcesGlobal)[SOURCES_KEY] = { portal: client.portal, at: Date.now(), sources };
  return sources;
}

/** Funis lidos há menos de 10 min (mesmo portal) ou, se não houver, uma leitura nova. */
export async function recentCrmSources(now = Date.now()): Promise<CrmSourceDTO[]> {
  const cached = (globalThis as SourcesGlobal)[SOURCES_KEY];
  if (cached && now - cached.at < CRM_SOURCES_TTL_MS && cached.portal === requireBitrix().portal) return cached.sources;
  return listCrmSources();
}

export function forgetCrmSourcesForTests(): void {
  delete (globalThis as SourcesGlobal)[SOURCES_KEY];
}

export async function currentStageHistoryCursor(entityTypeId: number): Promise<number | null> {
  return maxStageHistoryId(requireBitrix(), entityTypeId);
}

/** Vínculo UF_CRM_TASK: lead L_, negócio D_, processo inteligente T<tipo em hexadecimal>_. */
export function crmBinding(entityTypeId: number, entityId: number): string {
  if (entityTypeId === 1) return `L_${entityId}`;
  if (entityTypeId === 2) return `D_${entityId}`;
  return `T${entityTypeId.toString(16)}_${entityId}`;
}

export function crmItemUrl(portal: string, entityTypeId: number, entityId: number): string {
  if (entityTypeId === 1) return `${portal}/crm/lead/details/${entityId}/`;
  if (entityTypeId === 2) return `${portal}/crm/deal/details/${entityId}/`;
  return `${portal}/crm/type/${entityTypeId}/details/${entityId}/`;
}

const clean = (value: unknown): string | null => {
  if (typeof value === "number") return String(value);
  return typeof value === "string" && value.trim() ? value.trim() : null;
};

function firstValue(value: unknown): unknown {
  if (!Array.isArray(value)) return value;
  const first: unknown = value[0];
  if (first !== null && typeof first === "object") {
    const record = first as Record<string, unknown>;
    return record.value ?? record.VALUE;
  }
  return first;
}

const fieldText = (item: Record<string, unknown>, key: string | undefined) => (key ? clean(firstValue(item[key])) : null);

function fieldDate(item: Record<string, unknown>, key: string | undefined): string | null {
  const value = fieldText(item, key);
  const match = value ? /^(\d{4}-\d{2}-\d{2})/.exec(value) : null;
  return match?.[1] ?? null;
}

function fieldEmail(item: Record<string, unknown>, key: string | undefined): string | null {
  const value = fieldText(item, key);
  return value && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? value.toLowerCase() : null;
}

function fieldUser(item: Record<string, unknown>, key: string | undefined): string | null {
  const value = fieldText(item, key);
  const match = value ? /(\d{1,12})$/.exec(value) : null;
  return match?.[1] ?? null;
}

const fullName = (item: Record<string, unknown>) => [clean(item.name), clean(item.secondName), clean(item.lastName)].filter(Boolean).join(" ") || null;

/** Nome da pessoa: campo mapeado → nome do lead → contato vinculado → título do registro. */
async function personName(ctx: EngineContext, trigger: TriggerRow, item: Record<string, unknown>): Promise<string | null> {
  const mapped = fieldText(item, trigger.fieldMap.name);
  if (mapped) return mapped;
  if (trigger.entityTypeId === 1) {
    const lead = fullName(item);
    if (lead) return lead;
  }
  const contactId = Number(item.contactId);
  if (Number.isSafeInteger(contactId) && contactId > 0) {
    const contact = await getCrmItem(ctx.client, CONTACT_ENTITY_TYPE_ID, contactId);
    const name = contact ? fullName(contact) : null;
    if (name) return name;
  }
  return clean(item.title);
}

async function detect(ctx: EngineContext, trigger: TriggerRow, entry: StageHistoryEntry): Promise<void> {
  const item = await getCrmItem(ctx.client, trigger.entityTypeId, entry.ownerId);
  // Registro apagado depois de mudar de etapa: não há quem receber.
  if (!item) return;
  const name = await personName(ctx, trigger, item);
  insertDetectionIfNew({
    triggerId: trigger.id,
    entityTypeId: trigger.entityTypeId,
    entityId: entry.ownerId,
    title: clean(item.title) ?? name ?? `Registro ${entry.ownerId}`,
    personName: name,
    personEmail: fieldEmail(item, trigger.fieldMap.email),
    bitrixUserId: fieldUser(item, trigger.fieldMap.bitrixUser),
    suggestedDate: fieldDate(item, trigger.fieldMap.date),
    crmUrl: crmItemUrl(ctx.portal, trigger.entityTypeId, entry.ownerId),
  });
}

/**
 * Lê o histórico de etapas depois do cursor e cria uma detecção por (gatilho, registro) quando o registro entra na etapa.
 * Cursor nulo = gatilho novo: começa no maior ID atual (não reprocessa o passado).
 */
async function runTrigger(ctx: EngineContext, trigger: TriggerRow): Promise<void> {
  const ranAt = new Date().toISOString();
  if (trigger.cursor === null) {
    const max = await maxStageHistoryId(ctx.client, trigger.entityTypeId);
    updateTrigger(trigger.id, { cursor: max ?? 0, lastRunAt: ranAt, lastError: null });
    return;
  }
  let cursor = trigger.cursor;
  const seen = new Set<number>();
  try {
    for (let page = 0; page < MAX_HISTORY_PAGES; page++) {
      const entries = await listStageHistory(ctx.client, trigger.entityTypeId, cursor);
      for (const entry of entries) {
        // Criado direto na etapa (TYPE_ID 1), movido (2, 3) ou trocado de funil (5): todos contam.
        if (entry.stageId === trigger.stageId && !seen.has(entry.ownerId)) {
          await detect(ctx, trigger, entry);
          seen.add(entry.ownerId);
        }
        cursor = entry.id;
      }
      if (entries.length < PAGE_SIZE) break;
    }
  } finally {
    // Avança só até o último item processado: um erro no meio retoma dali no próximo ciclo.
    if (cursor !== trigger.cursor) updateTrigger(trigger.id, { cursor });
  }
  updateTrigger(trigger.id, { lastRunAt: ranAt, lastError: null });
}

/** Passo do ciclo: todos os gatilhos ligados. Um gatilho com erro não impede os outros. */
export async function runTriggers(ctx: EngineContext): Promise<void> {
  let firstError: unknown = null;
  for (const trigger of listTriggers({ enabledOnly: true })) {
    if (ctx.rateLimited) break;
    try {
      await runTrigger(ctx, trigger);
    } catch (error) {
      if (isBitrixError(error) && error.rateLimited) ctx.rateLimited = true;
      updateTrigger(trigger.id, { lastRunAt: new Date().toISOString(), lastError: errorMessage(error) });
      firstError ??= error;
    }
  }
  if (firstError) throw firstError;
}
