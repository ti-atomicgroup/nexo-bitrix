import "server-only";
import type { CrmSourceDTO, UserRef } from "@/shared/contracts";
import { AppError } from "../errors";
import { asRecord, type BatchCommands, type BitrixClient } from "./client";
import { BitrixError, isBitrixError } from "./errors";

/* ───────────── utilitários de leitura ───────────── */

const text = (value: unknown): string => (typeof value === "string" ? value : typeof value === "number" ? String(value) : "");
const optionalText = (value: unknown): string | null => text(value).trim() || null;
const toNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};
/** Primeiro campo presente entre os nomes (respostas em camelCase ou MAIÚSCULAS). */
function pick(raw: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) if (raw[key] !== undefined && raw[key] !== null) return raw[key];
  return undefined;
}
const normalizeName = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();

const invalidResponse = (uncertain = false) => new BitrixError("RESPONSE_INVALID", { retryable: uncertain, uncertain });

/* ───────────── conexão e pessoas (escopos user_brief/user) ───────────── */

export interface BitrixUserInfo {
  bitrixUserId: string;
  name: string;
  email: string | null;
  position: string | null;
  department: string | null;
  active: boolean;
}

const EXTERNAL_USER_TYPES = new Set(["extranet", "email", "bot", "imconnector", "replica", "sale", "shop"]);

export function parseUser(value: unknown): BitrixUserInfo {
  const raw = asRecord(value);
  const id = text(raw.ID);
  const name = [text(raw.NAME).trim(), text(raw.LAST_NAME).trim()].filter(Boolean).join(" ") || `Usuário ${id}`;
  const active = raw.ACTIVE === true || raw.ACTIVE === "Y" || raw.ACTIVE === "1" || raw.ACTIVE === 1;
  return { bitrixUserId: id, name, email: optionalText(raw.EMAIL), position: optionalText(raw.WORK_POSITION), department: null, active };
}

export const toUserRef = (user: Pick<BitrixUserInfo, "bitrixUserId" | "name" | "position">): UserRef => ({
  bitrixUserId: user.bitrixUserId,
  name: user.name,
  position: user.position,
});

/** `user.current` + `scope`: dono do webhook e escopos concedidos. */
export async function checkWebhook(client: BitrixClient): Promise<{ owner: UserRef; scopes: string[] }> {
  const user = parseUser(await client.call("user.current"));
  if (!user.bitrixUserId) throw new BitrixError("RESPONSE_INVALID", {}, "O Bitrix24 não confirmou a conta dona do webhook.");
  if (!user.active) {
    throw new AppError("WEBHOOK_USER_INACTIVE", "A conta dona do webhook está inativa no Bitrix24. Crie o webhook com uma conta ativa.", 400);
  }
  const scopes = await client.call<unknown>("scope");
  return { owner: toUserRef(user), scopes: Array.isArray(scopes) ? scopes.filter((scope): scope is string => typeof scope === "string") : [] };
}

/** Colaboradores do portal (sem extranet, bots e e-mail). Com `includeInactive`, traz os desligados para atualizar o cache. */
export async function listActiveUsers(client: BitrixClient, options: { includeInactive?: boolean } = {}): Promise<BitrixUserInfo[]> {
  const filter: Record<string, unknown> = options.includeInactive ? {} : { ACTIVE: true };
  const raw = await client.list<Record<string, unknown>>("user.get", { FILTER: filter, sort: "ID", order: "ASC" }, { maxPages: 200 });
  return raw
    .filter((user) => !EXTERNAL_USER_TYPES.has(text(asRecord(user).USER_TYPE)))
    .map(parseUser)
    .filter((user) => user.bitrixUserId && (options.includeInactive || user.active));
}

/* ───────────── convite (escopo user; o dono do webhook precisa ser administrador) ───────────── */

/** Conta com este e-mail (ativa, convidada ou desativada), sem extranet nem bots. */
export async function findUserByEmail(client: BitrixClient, email: string): Promise<BitrixUserInfo | null> {
  const raw = await client.call<unknown>("user.get", { FILTER: { EMAIL: email } });
  const wanted = email.trim().toLowerCase();
  const match = (Array.isArray(raw) ? raw : [])
    .filter((user) => !EXTERNAL_USER_TYPES.has(text(asRecord(user).USER_TYPE)))
    .map(parseUser)
    .find((user) => user.bitrixUserId && user.email?.toLowerCase() === wanted);
  return match ?? null;
}

/** Departamentos (`UF_DEPARTMENT`) de uma conta: o convidado entra no mesmo departamento. */
export async function userDepartments(client: BitrixClient, userId: string): Promise<string[]> {
  const raw = await client.call<unknown>("user.get", { FILTER: { ID: userId } });
  const user = asRecord(Array.isArray(raw) ? raw[0] : null);
  const departments = Array.isArray(user.UF_DEPARTMENT) ? user.UF_DEPARTMENT : [];
  return departments.map((value) => text(value)).filter((value) => /^\d+$/.test(value));
}

/** `user.add`: o Bitrix24 cria a conta e manda o convite para o e-mail. Devolve o ID da conta nova. */
export async function inviteUser(client: BitrixClient, input: { email: string; name: string; departmentId: string; position?: string | null }): Promise<string> {
  const [first = input.name, ...rest] = input.name.trim().split(/\s+/);
  const id = text(
    await client.call("user.add", { EMAIL: input.email, NAME: first, LAST_NAME: rest.join(" "), EXTRANET: "N", UF_DEPARTMENT: [Number(input.departmentId)], ...(input.position ? { WORK_POSITION: input.position } : {}) }),
  );
  if (!/^\d+$/.test(id)) throw invalidResponse(true);
  return id;
}

/* ───────────── projeto (escopo sonet_group) ───────────── */

export async function findGroupByName(client: BitrixClient, name: string): Promise<{ id: string; name: string } | null> {
  const groups = await client.list<Record<string, unknown>>("sonet_group.get", { FILTER: { NAME: name.trim() }, ORDER: { ID: "ASC" } }, { maxPages: 5 });
  const wanted = normalizeName(name);
  const match = groups.map(asRecord).find((group) => normalizeName(text(group.NAME)) === wanted && text(group.CLOSED) !== "Y");
  return match ? { id: text(match.ID), name: text(match.NAME) } : null;
}

/** Projeto privado (invisível, fechado, convites por dono e moderadores). Devolve o ID. */
export async function createPrivateProject(client: BitrixClient, input: { name: string; description: string }): Promise<string> {
  const result = await client.call("sonet_group.create", {
    NAME: input.name,
    DESCRIPTION: input.description,
    VISIBLE: "N",
    OPENED: "N",
    PROJECT: "Y",
    INITIATE_PERMS: "E",
  });
  const id = text(result);
  if (!/^\d+$/.test(id)) throw invalidResponse(true);
  return id;
}

/* ───────────── tarefas (escopo task) ───────────── */

export interface CreateTaskInput {
  title: string;
  description: string;
  responsibleId: string;
  auditors: string[];
  /** ISO com fuso (2026-10-27T18:00:00-03:00). */
  deadline: string;
  groupId: string;
  /** nexo:<atividade>: permite reconciliar uma criação incerta. */
  xmlId: string;
  requiresApproval: boolean;
  /** Vínculos UF_CRM_TASK (ex.: D_12, L_3, T8a_5). */
  crmBindings?: string[];
}

export async function createTask(client: BitrixClient, input: CreateTaskInput): Promise<string> {
  const fields: Record<string, unknown> = {
    TITLE: input.title,
    DESCRIPTION: input.description,
    RESPONSIBLE_ID: Number(input.responsibleId),
    DEADLINE: input.deadline,
    GROUP_ID: Number(input.groupId),
    XML_ID: input.xmlId,
    TASK_CONTROL: input.requiresApproval ? "Y" : "N",
    ALLOW_CHANGE_DEADLINE: "Y",
  };
  const auditors = [...new Set(input.auditors)].filter((id) => id && id !== input.responsibleId).map(Number);
  if (auditors.length) fields.AUDITORS = auditors;
  if (input.crmBindings?.length) fields.UF_CRM_TASK = input.crmBindings;
  const result = asRecord(await client.call("tasks.task.add", { fields }));
  const task = asRecord(result.task);
  const id = text(pick(task, "id", "ID"));
  // Sem ID na resposta, a tarefa pode ter sido criada: tratar como incerto.
  if (!/^\d+$/.test(id)) throw invalidResponse(true);
  return id;
}

export interface BitrixTaskInfo {
  id: string;
  status: number | null;
  deadline: string | null;
  responsibleId: string | null;
  closedDate: string | null;
  groupId: string | null;
  xmlId: string | null;
  title: string;
  createdDate: string | null;
}

export function parseTask(value: unknown): BitrixTaskInfo {
  const raw = asRecord(value);
  return {
    id: text(pick(raw, "id", "ID")),
    status: toNumber(pick(raw, "status", "STATUS", "realStatus", "REAL_STATUS")),
    deadline: optionalText(pick(raw, "deadline", "DEADLINE")),
    responsibleId: optionalText(pick(raw, "responsibleId", "RESPONSIBLE_ID")),
    closedDate: optionalText(pick(raw, "closedDate", "CLOSED_DATE")),
    groupId: optionalText(pick(raw, "groupId", "GROUP_ID")),
    xmlId: optionalText(pick(raw, "xmlId", "XML_ID")),
    title: text(pick(raw, "title", "TITLE")),
    createdDate: optionalText(pick(raw, "createdDate", "CREATED_DATE")),
  };
}

export const TASK_SELECT = ["ID", "STATUS", "DEADLINE", "RESPONSIBLE_ID", "CLOSED_DATE", "GROUP_ID", "XML_ID", "TITLE"];

/** Consulta por lista de IDs (50 por chamada, sempre com `select`). Tarefas ausentes na resposta foram apagadas ou ficaram inacessíveis. */
export async function listTasksByIds(client: BitrixClient, ids: string[]): Promise<BitrixTaskInfo[]> {
  const unique = [...new Set(ids.filter((id) => /^\d+$/.test(id)))];
  const wanted = new Set(unique);
  const tasks: BitrixTaskInfo[] = [];
  for (let index = 0; index < unique.length; index += 50) {
    const chunk = unique.slice(index, index + 50);
    const raw = await client.list("tasks.task.list", { filter: { ID: chunk.map(Number) }, select: TASK_SELECT, order: { ID: "asc" } }, { itemsKey: "tasks", maxPages: 2 });
    tasks.push(...raw.map(parseTask).filter((task) => wanted.has(task.id)));
  }
  return tasks;
}

/** Uma tarefa pelo ID (confirma uma ausência antes de marcar a atividade como sem tarefa). */
export async function getTask(client: BitrixClient, id: string): Promise<BitrixTaskInfo | null> {
  const result = asRecord(await client.call("tasks.task.get", { taskId: Number(id), select: TASK_SELECT }));
  const task = parseTask(result.task);
  return task.id === id ? task : null;
}

/**
 * Tarefas do projeto criadas desde a data (AAAA-MM-DD, com folga de um dia para cobrir fusos), para reconciliar
 * criações incertas pelo XML_ID.
 */
export async function listTasksCreatedSince(client: BitrixClient, groupId: string, sinceDate: string): Promise<BitrixTaskInfo[]> {
  const raw = await client.list(
    "tasks.task.list",
    { filter: { GROUP_ID: Number(groupId), ">=CREATED_DATE": sinceDate }, select: ["ID", "XML_ID", "TITLE", "CREATED_DATE", "GROUP_ID"], order: { ID: "desc" } },
    { itemsKey: "tasks", maxPages: 10 },
  );
  return raw.map(parseTask).filter((task) => task.id);
}

export type TaskAction = "complete" | "renew" | "approve" | "disapprove";

export async function changeTaskStatus(client: BitrixClient, taskId: string, action: TaskAction): Promise<void> {
  await client.call(`tasks.task.${action}`, { taskId: Number(taskId) });
}
export const completeTask = (client: BitrixClient, taskId: string) => changeTaskStatus(client, taskId, "complete");
export const renewTask = (client: BitrixClient, taskId: string) => changeTaskStatus(client, taskId, "renew");
export const approveTask = (client: BitrixClient, taskId: string) => changeTaskStatus(client, taskId, "approve");

export async function addTaskComment(client: BitrixClient, taskId: string, message: string): Promise<string> {
  return text(await client.call("task.commentitem.add", { TASKID: Number(taskId), FIELDS: { POST_MESSAGE: message } }));
}

/* ───────────── checklists ───────────── */

export interface BitrixChecklistItem {
  id: string;
  /** "0" para a raiz (o nome do checklist). */
  parentId: string;
  title: string;
  done: boolean;
}

export function parseChecklistItem(value: unknown): BitrixChecklistItem {
  const raw = asRecord(value);
  return {
    id: text(raw.ID),
    parentId: text(raw.PARENT_ID) || "0",
    title: text(raw.TITLE),
    done: raw.IS_COMPLETE === "Y" || raw.IS_COMPLETE === true,
  };
}

export async function addChecklistRoot(client: BitrixClient, taskId: string, title: string): Promise<string> {
  const id = text(await client.call("task.checklistitem.add", { TASKID: Number(taskId), FIELDS: { TITLE: title, PARENT_ID: 0 } }));
  if (!/^\d+$/.test(id)) throw invalidResponse(true);
  return id;
}

export interface ChecklistDraft {
  key: string;
  text: string;
  done: boolean;
}

/** Filhos sob a raiz, num único `batch`. Devolve chave → ID do item e os erros por item. */
export async function addChecklistItems(
  client: BitrixClient,
  taskId: string,
  rootId: string,
  items: ChecklistDraft[],
): Promise<{ itemIds: Record<string, string>; errors: BitrixError[] }> {
  if (!items.length) return { itemIds: {}, errors: [] };
  const commands: BatchCommands = {};
  const keys = new Map<string, string>();
  items.forEach((item, index) => {
    const commandKey = `item_${index}`;
    keys.set(commandKey, item.key);
    commands[commandKey] = {
      method: "task.checklistitem.add",
      params: { TASKID: Number(taskId), FIELDS: { TITLE: item.text, PARENT_ID: Number(rootId), IS_COMPLETE: item.done ? "Y" : "N", SORT_INDEX: (index + 1) * 10 } },
    };
  });
  const { results, errors } = await client.batch(commands);
  const itemIds: Record<string, string> = {};
  for (const [commandKey, value] of Object.entries(results)) {
    const key = keys.get(commandKey);
    const id = text(value);
    if (key && /^\d+$/.test(id)) itemIds[key] = id;
  }
  return { itemIds, errors: Object.values(errors) };
}

/** Raiz (via `task.checklistitem.add` com PARENT_ID 0) e depois os filhos num único `batch`. */
export async function addChecklist(
  client: BitrixClient,
  taskId: string,
  rootTitle: string,
  items: ChecklistDraft[],
): Promise<{ rootId: string; itemIds: Record<string, string>; errors: BitrixError[] }> {
  const rootId = await addChecklistRoot(client, taskId, rootTitle);
  return { rootId, ...(await addChecklistItems(client, taskId, rootId, items)) };
}

/** Checklists de várias tarefas via `batch`. Tarefas com erro (apagadas, sem acesso) ficam de fora do resultado. */
export async function getChecklists(client: BitrixClient, taskIds: string[]): Promise<Record<string, BitrixChecklistItem[]>> {
  const commands: BatchCommands = {};
  for (const id of new Set(taskIds)) commands[`t${id}`] = { method: "task.checklistitem.getlist", params: { TASKID: Number(id) } };
  if (!Object.keys(commands).length) return {};
  const { results, errors } = await client.batch(commands);
  const rateLimited = Object.values(errors).find((error) => error.rateLimited);
  if (rateLimited) throw rateLimited;
  const checklists: Record<string, BitrixChecklistItem[]> = {};
  for (const [key, value] of Object.entries(results)) {
    const items = Array.isArray(value) ? value : Object.values(asRecord(value));
    checklists[key.slice(1)] = items.map(parseChecklistItem).filter((item) => item.id);
  }
  return checklists;
}

export async function setChecklistItemDone(client: BitrixClient, taskId: string, itemId: string, done: boolean): Promise<void> {
  await client.call(done ? "task.checklistitem.complete" : "task.checklistitem.renew", { TASKID: Number(taskId), ITEMID: Number(itemId) });
}

/* ───────────── CRM (escopo crm) ───────────── */

async function readStages(client: BitrixClient, entityIds: string[]): Promise<Record<string, Array<{ id: string; name: string }>>> {
  const commands: BatchCommands = {};
  entityIds.forEach((entityId, index) => (commands[`s${index}`] = { method: "crm.status.list", params: { order: { SORT: "ASC" }, filter: { ENTITY_ID: entityId } } }));
  if (!entityIds.length) return {};
  const { results, errors } = await client.batch(commands);
  const failure = Object.values(errors)[0];
  if (failure) throw failure;
  return Object.fromEntries(
    entityIds.map((entityId, index) => {
      const raw = results[`s${index}`];
      const items = Array.isArray(raw) ? raw : Object.values(asRecord(raw));
      return [entityId, items.map(asRecord).map((stage) => ({ id: text(stage.STATUS_ID), name: text(stage.NAME) || text(stage.STATUS_ID) })).filter((stage) => stage.id)];
    }),
  );
}

type CrmCategory = { id: number; name: string };

const parseCategories = (raw: unknown): CrmCategory[] =>
  (Array.isArray(raw) ? raw : Object.values(asRecord(raw)))
    .map(asRecord)
    .map((category) => ({ id: toNumber(category.id) ?? 0, name: text(category.name) || "Funil" }))
    .sort((a, b) => a.id - b.id);

const parseFields = (raw: unknown): CrmSourceDTO["fields"] =>
  Object.entries(asRecord(raw))
    .map(([id, value]) => {
      const field = asRecord(value);
      return { id, name: text(field.title) || id, type: text(field.type) || "unknown" };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

/**
 * Funis e campos de várias entidades em lotes de 50 (`batch`), em vez de duas chamadas por entidade.
 * Entidade sem acesso (erro no comando) fica de fora; limite de taxa interrompe a leitura toda.
 */
async function readCategoriesAndFields(
  client: BitrixClient,
  entityTypeIds: number[],
): Promise<Map<number, { categories: CrmCategory[] | null; fields: CrmSourceDTO["fields"] | null }>> {
  const commands: BatchCommands = {};
  for (const entityTypeId of entityTypeIds) {
    // Leads não têm funis (as etapas vêm de STATUS).
    if (entityTypeId !== 1) commands[`c${entityTypeId}`] = { method: "crm.category.list", params: { entityTypeId } };
    commands[`f${entityTypeId}`] = { method: "crm.item.fields", params: { entityTypeId } };
  }
  const { results, errors } = await client.batch(commands);
  const rateLimited = Object.values(errors).find((error) => error.rateLimited);
  if (rateLimited) throw rateLimited;
  const out = new Map<number, { categories: CrmCategory[] | null; fields: CrmSourceDTO["fields"] | null }>();
  for (const entityTypeId of entityTypeIds) {
    const categories = errors[`c${entityTypeId}`] ? null : parseCategories(asRecord(results[`c${entityTypeId}`]).categories);
    const fields = errors[`f${entityTypeId}`] ? null : parseFields(asRecord(results[`f${entityTypeId}`]).fields);
    out.set(entityTypeId, { categories, fields });
  }
  // Um comando do lote devolve só a 1ª página (50): entidade com mais funis que isso é lida por inteiro.
  for (const [entityTypeId, entry] of out) {
    if (entry.categories?.length === 50) {
      const all = await client.list<Record<string, unknown>>("crm.category.list", { entityTypeId }, { itemsKey: "categories", maxPages: 5 });
      entry.categories = parseCategories(all);
    }
  }
  return out;
}

const dealStageEntity = (categoryId: number) => (categoryId === 0 ? "DEAL_STAGE" : `DEAL_STAGE_${categoryId}`);
const dynamicStageEntity = (entityTypeId: number, categoryId: number) => `DYNAMIC_${entityTypeId}_STAGE_${categoryId}`;

/**
 * Funis e etapas de leads (STATUS), negócios (DEAL_STAGE[_cat]) e processos inteligentes (DYNAMIC_<tipo>_STAGE_<cat>), com campos.
 * Tudo em lote: num portal com 80 processos inteligentes são ~6 chamadas, não ~240.
 */
export async function listCrmSources(client: BitrixClient): Promise<CrmSourceDTO[]> {
  const types = (await client.list<Record<string, unknown>>("crm.type.list", {}, { itemsKey: "types", maxPages: 5 }))
    .map(asRecord)
    .map((type) => ({ entityTypeId: toNumber(type.entityTypeId), title: text(type.title) }))
    .filter((type): type is { entityTypeId: number; title: string } => type.entityTypeId !== null && type.entityTypeId > 0);
  const meta = await readCategoriesAndFields(client, [1, 2, ...types.map((type) => type.entityTypeId)]);
  const deal = meta.get(2);
  if (!deal?.categories || !deal.fields) throw new BitrixError("CRM_UNAVAILABLE", {}, "O Bitrix24 não devolveu os funis de negócios. Confira o escopo crm do webhook.");
  const dealCategories = deal.categories;

  const stageEntities = [
    "STATUS",
    ...dealCategories.map((category) => dealStageEntity(category.id)),
    ...types.flatMap((type) => (meta.get(type.entityTypeId)?.categories ?? []).map((category) => dynamicStageEntity(type.entityTypeId, category.id))),
  ];
  const stages = await readStages(client, stageEntities);

  const sources: CrmSourceDTO[] = [
    { entityTypeId: 1, kind: "lead", name: "Leads", categories: [{ id: null, name: "Leads", stages: stages.STATUS ?? [] }], fields: meta.get(1)?.fields ?? [] },
    {
      entityTypeId: 2,
      kind: "deal",
      name: "Negócios",
      categories: dealCategories.map((category) => ({ id: category.id, name: category.name, stages: stages[dealStageEntity(category.id)] ?? [] })),
      fields: deal.fields,
    },
  ];
  for (const type of types) {
    const entry = meta.get(type.entityTypeId);
    if (!entry?.categories || !entry.fields) continue;
    sources.push({
      entityTypeId: type.entityTypeId,
      kind: "smart_process",
      name: type.title || `Processo ${type.entityTypeId}`,
      categories: entry.categories.map((category) => ({ id: category.id, name: category.name, stages: stages[dynamicStageEntity(type.entityTypeId, category.id)] ?? [] })),
      fields: entry.fields,
    });
  }
  return sources;
}

export interface StageHistoryEntry {
  id: number;
  ownerId: number;
  /** STAGE_ID (negócios, processos) ou STATUS_ID (leads). */
  stageId: string;
  /** 1 criado, 2 etapa intermediária, 3 etapa final, 5 troca de funil. */
  typeId: number;
  categoryId: number | null;
  createdTime: string | null;
}

export function parseStageHistory(value: unknown): StageHistoryEntry | null {
  const raw = asRecord(value);
  const id = toNumber(raw.ID);
  const ownerId = toNumber(raw.OWNER_ID);
  const stageId = text(pick(raw, "STAGE_ID", "STATUS_ID"));
  if (id === null || ownerId === null || !stageId) return null;
  return { id, ownerId, stageId, typeId: toNumber(raw.TYPE_ID) ?? 0, categoryId: toNumber(raw.CATEGORY_ID), createdTime: optionalText(raw.CREATED_TIME) };
}

/** Uma página (até 50) do histórico de etapas com ID maior que o cursor, em ordem crescente (paginação por chave). */
export async function listStageHistory(client: BitrixClient, entityTypeId: number, afterId: number): Promise<StageHistoryEntry[]> {
  const result = asRecord(await client.call("crm.stagehistory.list", { entityTypeId, order: { ID: "ASC" }, filter: { ">ID": afterId }, start: 0 }));
  const items = Array.isArray(result.items) ? result.items : [];
  return items
    .map(parseStageHistory)
    .filter((entry): entry is StageHistoryEntry => entry !== null && entry.id > afterId)
    .sort((a, b) => a.id - b.id);
}

/** Maior ID atual do histórico: cursor inicial de um gatilho (não reprocessa o passado). Null se ainda não há histórico. */
export async function maxStageHistoryId(client: BitrixClient, entityTypeId: number): Promise<number | null> {
  const result = asRecord(await client.call("crm.stagehistory.list", { entityTypeId, order: { ID: "DESC" }, select: ["ID"], start: 0 }));
  // Resposta sem `items` não pode virar cursor 0 (reprocessaria todo o histórico).
  if (!Array.isArray(result.items)) throw invalidResponse(true);
  const first: unknown = result.items[0];
  if (first === undefined) return null;
  const id = toNumber(asRecord(first).ID);
  if (id === null) throw invalidResponse(true);
  return id;
}

export async function getCrmItem(client: BitrixClient, entityTypeId: number, id: number): Promise<Record<string, unknown> | null> {
  try {
    const result = asRecord(await client.call("crm.item.get", { entityTypeId, id }));
    const item = asRecord(result.item);
    return Object.keys(item).length ? item : null;
  } catch (error) {
    if (isBitrixError(error) && !error.retryable && (error.code.includes("NOT_FOUND") || error.httpStatus === 404)) return null;
    throw error;
  }
}

/* ───────────── extras (escopos im, calendar, log) ───────────── */

export async function notifyUser(client: BitrixClient, userId: string, message: string): Promise<string> {
  return text(await client.call("im.notify.personal.add", { USER_ID: Number(userId), MESSAGE: message }));
}

/** Mensagem no chat com a pessoa, em nome da conta dona do webhook (aceita BBCode, como [URL=…]…[/URL]). */
export async function sendChatMessage(client: BitrixClient, userId: string, message: string): Promise<string> {
  return text(await client.call("im.message.add", { DIALOG_ID: userId, MESSAGE: message }));
}

export interface MeetingInput {
  ownerId: string;
  name: string;
  description: string;
  /** ISO com fuso. */
  from: string;
  to: string;
  attendees: string[];
}

export async function createMeeting(client: BitrixClient, input: MeetingInput): Promise<string> {
  const id = text(
    await client.call("calendar.event.add", {
      type: "user",
      ownerId: Number(input.ownerId),
      name: input.name,
      description: input.description,
      from: input.from,
      to: input.to,
      skip_time: "N",
      is_meeting: "Y",
      attendees: [...new Set([input.ownerId, ...input.attendees])].map(Number),
      meeting: { notify: true, reinvite: false, allow_invite: false, hide_guests: false },
    }),
  );
  if (!/^\d+$/.test(id)) throw invalidResponse(true);
  return id;
}

export async function postToFeed(client: BitrixClient, input: { title: string; message: string; dest?: string[] }): Promise<string> {
  return text(await client.call("log.blogpost.add", { POST_TITLE: input.title, POST_MESSAGE: input.message, DEST: input.dest ?? ["UA"] }));
}

/* ───────────── documentos no Drive (escopo disk) e anexo na tarefa (escopo task) ───────────── */

/** Envio de arquivo em base64 pode passar de 20 s em conexões lentas. */
const UPLOAD_TIMEOUT_MS = 90_000;

export interface DriveObject {
  id: string;
  name: string;
  /** Abre o arquivo ou a pasta no Bitrix24. */
  detailUrl: string | null;
}

function parseDriveObject(value: unknown): DriveObject {
  const raw = asRecord(value);
  return { id: text(raw.ID), name: text(raw.NAME), detailUrl: optionalText(raw.DETAIL_URL) };
}

/** Pasta raiz do Drive do projeto (grupo de trabalho). Nulo se o webhook não enxerga o Drive do grupo. */
export async function getGroupDriveRoot(client: BitrixClient, groupId: string): Promise<string | null> {
  const storages = await client.list<Record<string, unknown>>("disk.storage.getlist", { filter: { ENTITY_TYPE: "group", ENTITY_ID: groupId } }, { maxPages: 5 });
  const storage = storages.map(asRecord).find((item) => text(item.ENTITY_TYPE) === "group" && text(item.ENTITY_ID) === groupId);
  const root = storage ? text(storage.ROOT_OBJECT_ID) : "";
  return /^\d+$/.test(root) ? root : null;
}

/** Item com exatamente este nome dentro da pasta (o filtro do Bitrix compara sem diferenciar maiúsculas). */
export async function findDriveChild(client: BitrixClient, folderId: string, name: string, type: "folder" | "file"): Promise<DriveObject | null> {
  const items = await client.list<Record<string, unknown>>("disk.folder.getchildren", { id: Number(folderId), filter: { NAME: name } }, { maxPages: 2 });
  const match = items.map(asRecord).find((item) => text(item.NAME) === name && text(item.TYPE) === type);
  return match ? parseDriveObject(match) : null;
}

/** Cria a subpasta; se já existir (DISK_OBJ_22000), devolve a existente. */
export async function ensureDriveFolder(client: BitrixClient, parentId: string, name: string): Promise<DriveObject> {
  const existing = await findDriveChild(client, parentId, name, "folder");
  if (existing) return existing;
  try {
    const created = parseDriveObject(await client.call("disk.folder.addsubfolder", { id: Number(parentId), data: { NAME: name } }));
    if (!/^\d+$/.test(created.id)) throw invalidResponse(true);
    return created;
  } catch (error) {
    if (isBitrixError(error) && error.code === "DISK_OBJ_22000") {
      const found = await findDriveChild(client, parentId, name, "folder");
      if (found) return found;
    }
    throw error;
  }
}

/** Grava o arquivo na pasta. O nome já é único (sufixo do documento), então nunca renomeia por conflito. */
export async function uploadDriveFile(client: BitrixClient, folderId: string, name: string, content: Uint8Array): Promise<DriveObject> {
  const result = await client.call(
    "disk.folder.uploadfile",
    { id: Number(folderId), data: { NAME: name }, fileContent: [name, Buffer.from(content).toString("base64")], generateUniqueName: false },
    { timeoutMs: UPLOAD_TIMEOUT_MS },
  );
  const file = parseDriveObject(result);
  // Sem ID, o arquivo pode ter sido gravado: tratar como incerto (o motor procura pelo nome antes de reenviar).
  if (!/^\d+$/.test(file.id)) throw invalidResponse(true);
  return file;
}

/** Anexa um arquivo do Drive à tarefa. Devolve o id do anexo. */
export async function attachFileToTask(client: BitrixClient, taskId: string, fileId: string): Promise<string> {
  const result = asRecord(await client.call("tasks.task.files.attach", { taskId: Number(taskId), fileId: Number(fileId) }));
  return text(pick(result, "attachmentId", "ATTACHMENT_ID"));
}

/**
 * Anexo da tarefa que aponta para este arquivo do Drive, se já existe (para não anexar duas vezes depois de uma resposta incerta).
 * A tarefa lista os anexos (UF_TASK_WEBDAV_FILES) e cada anexo diz de qual arquivo do Drive veio (OBJECT_ID).
 */
export async function findTaskAttachment(client: BitrixClient, taskId: string, fileId: string): Promise<string | null> {
  const result = asRecord(await client.call("tasks.task.get", { taskId: Number(taskId), select: ["ID", "UF_TASK_WEBDAV_FILES"] }));
  const task = asRecord(result.task ?? result);
  const raw = pick(task, "ufTaskWebdavFiles", "UF_TASK_WEBDAV_FILES");
  const ids = (Array.isArray(raw) ? raw : []).map(text).filter((id) => /^\d+$/.test(id)).slice(-50);
  if (!ids.length) return null;
  const commands: BatchCommands = {};
  for (const id of ids) commands[`a${id}`] = { method: "disk.attachedObject.get", params: { id: Number(id) } };
  const { results, errors } = await client.batch(commands);
  // Sem ler todos os anexos não dá para afirmar que falta: melhor tentar de novo depois do que anexar em dobro.
  const failure = Object.values(errors)[0];
  if (failure) throw failure;
  return ids.find((id) => text(asRecord(results[`a${id}`]).OBJECT_ID) === fileId) ?? null;
}
