import "server-only";
import type { CrmSourceDTO, TriggerDTO } from "@/shared/contracts";
import type { TriggerInput } from "@/shared/schemas";
import { currentStageHistoryCursor, listCrmSources, type Actor } from "@/server/engine";
import { getTemplate } from "../../db/repos/templates";
import { createTrigger, deleteTrigger, getTrigger, listTriggers, toTriggerDTO, updateTrigger } from "../../db/repos/triggers";
import { AppError } from "../../errors";
import { log } from "../../log";
import { auditAs } from "../audit";

/** Gatilhos "Detectado no Bitrix": funil/processo + etapa → detecção em Hoje. */
const triggerNotFound = () => new AppError("NOT_FOUND", "Não encontramos este gatilho.", 404);

export function listTriggerDTOs(): TriggerDTO[] {
  return listTriggers().map(toTriggerDTO);
}

export function crmSources(): Promise<CrmSourceDTO[]> {
  return listCrmSources();
}

function assertTemplate(input: TriggerInput): void {
  const template = getTemplate(input.templateId);
  if (!template || template.archived) throw new AppError("INVALID_INPUT", "Escolha uma trilha ativa.", 400, { field: "templateId" });
  if (template.kind !== input.journeyKind) {
    throw new AppError("INVALID_INPUT", input.journeyKind === "onboarding" ? "Escolha uma trilha de entrada." : "Escolha uma trilha de saída.", 400, { field: "templateId" });
  }
}

/** Nomes do funil e da etapa só para exibição; se o Bitrix não responder, ficam vazios e o gatilho funciona igual. */
async function sourceNames(input: TriggerInput): Promise<{ sourceName: string | null; stageName: string | null }> {
  try {
    const source = (await listCrmSources()).find((item) => item.entityTypeId === input.entityTypeId);
    if (!source) return { sourceName: null, stageName: null };
    const category =
      source.categories.find((item) => item.id === input.categoryId) ?? source.categories.find((item) => item.stages.some((stage) => stage.id === input.stageId));
    const stage = category?.stages.find((item) => item.id === input.stageId);
    const sourceName = category && source.categories.length > 1 ? `${source.name} · ${category.name}` : source.name;
    return { sourceName, stageName: stage?.name ?? null };
  } catch (error) {
    log.warn("crm_sources_unavailable", { message: "O Bitrix24 não devolveu os funis do CRM; o gatilho foi salvo sem os nomes.", error });
    return { sourceName: null, stageName: null };
  }
}

/** O cursor começa no maior ID atual do histórico: o gatilho novo não reprocessa o passado. */
export async function createTriggerFromInput(input: TriggerInput, actor: Actor): Promise<TriggerDTO> {
  assertTemplate(input);
  const cursor = await currentStageHistoryCursor(input.entityTypeId);
  const trigger = createTrigger({ ...input, ...(await sourceNames(input)), cursor });
  auditAs(actor, "Gatilho criado", "trigger", trigger.id, trigger.name);
  return toTriggerDTO(trigger);
}

/** Mudou a origem/etapa ou foi religado: recomeça do maior ID atual. */
export async function updateTriggerFromInput(id: string, input: TriggerInput, actor: Actor): Promise<TriggerDTO> {
  const current = getTrigger(id);
  if (!current) throw triggerNotFound();
  assertTemplate(input);
  const moved = current.entityTypeId !== input.entityTypeId || current.categoryId !== input.categoryId || current.stageId !== input.stageId;
  const restarted = moved || (!current.enabled && input.enabled);
  const updated = updateTrigger(id, {
    name: input.name,
    journeyKind: input.journeyKind,
    entityTypeId: input.entityTypeId,
    categoryId: input.categoryId,
    stageId: input.stageId,
    templateId: input.templateId,
    fieldMap: input.fieldMap,
    enabled: input.enabled,
    ...(restarted ? { cursor: await currentStageHistoryCursor(input.entityTypeId), lastError: null } : {}),
    ...(moved ? await sourceNames(input) : {}),
  });
  if (!updated) throw triggerNotFound();
  auditAs(actor, "Gatilho atualizado", "trigger", id, updated.name);
  return toTriggerDTO(updated);
}

export function deleteTriggerById(id: string, actor: Actor): { ok: true } {
  const current = getTrigger(id);
  if (!current || !deleteTrigger(id)) throw triggerNotFound();
  auditAs(actor, "Gatilho removido", "trigger", id, current.name);
  return { ok: true };
}
