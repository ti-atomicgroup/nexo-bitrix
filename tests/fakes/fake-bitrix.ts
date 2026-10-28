/**
 * Portal Bitrix24 em memória para testes (nunca usado no produto). Responde no formato real da API REST:
 * envelope { result, next, total, time }, tarefas em camelCase sob result.task/result.tasks, checklists em MAIÚSCULAS,
 * `batch` com result/result_error, erros HTTP com { error, error_description }.
 */

export type FaultKind = "limit" | "timeout" | "commitThenTimeout" | "denied" | "serverError";

export interface FakeUser {
  id: number;
  name: string;
  lastName: string;
  email: string;
  position: string;
  active: boolean;
  userType: "employee" | "extranet";
}

export interface FakeGroup {
  id: number;
  name: string;
  description: string;
  project: boolean;
  visible: boolean;
  opened: boolean;
  closed: boolean;
  initiatePerms: string;
}

export interface FakeTask {
  id: number;
  title: string;
  description: string;
  responsibleId: number;
  createdBy: number;
  auditors: number[];
  deadline: string | null;
  groupId: number;
  xmlId: string | null;
  status: number;
  closedDate: string | null;
  createdDate: string;
  taskControl: "Y" | "N";
  allowChangeDeadline: "Y" | "N";
  ufCrmTask: string[];
}

export interface FakeChecklistItem {
  id: number;
  taskId: number;
  parentId: number;
  title: string;
  done: boolean;
  sortIndex: number;
}

export interface FakeStageHistory {
  id: number;
  entityTypeId: number;
  typeId: number;
  ownerId: number;
  stageId: string;
  categoryId: number;
  createdTime: string;
}

export interface FakeCrmItem {
  entityTypeId: number;
  id: number;
  title: string;
  stageId: string;
  categoryId: number;
  fields: Record<string, unknown>;
}

export interface FakeDriveObject {
  id: number;
  storageId: number;
  /** 0 na raiz do armazenamento. */
  parentId: number;
  name: string;
  type: "folder" | "file";
  content: Buffer | null;
}

interface FakeResponse {
  status: number;
  body: Record<string, unknown>;
}

class FakeFailure extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    description: string,
  ) {
    super(description);
  }
}

const SCOPE_BY_PREFIX: Array<[RegExp, string[]]> = [
  [/^user\.get$/, ["user", "user_brief", "user_basic"]],
  [/^user\.add$/, ["user"]],
  [/^sonet_group\./, ["sonet_group", "sonet"]],
  [/^tasks?\./, ["task"]],
  [/^crm\./, ["crm"]],
  [/^im\./, ["im"]],
  [/^calendar\./, ["calendar"]],
  [/^log\./, ["log"]],
  [/^disk\./, ["disk"]],
];

const isoSeconds = (date: Date) => `${date.toISOString().slice(0, 19)}+00:00`;
const truthy = (value: unknown) => value === true || value === "Y" || value === "true" || value === "1" || value === 1;
const asObject = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
const asList = (value: unknown): unknown[] => (Array.isArray(value) ? value : value === undefined || value === null ? [] : Object.values(asObject(value)));

/** Leitura no estilo `parse_str` do PHP (inverso do codificador dos comandos de `batch`). */
export function parsePhpQuery(query: string): Record<string, unknown> {
  const root: Record<string, unknown> = {};
  for (const pair of query.split("&")) {
    if (!pair) continue;
    const separator = pair.indexOf("=");
    const rawKey = decodeURIComponent((separator === -1 ? pair : pair.slice(0, separator)).replace(/\+/g, " "));
    const value = separator === -1 ? "" : decodeURIComponent(pair.slice(separator + 1).replace(/\+/g, " "));
    const match = /^([^[]+)((?:\[[^\]]*\])*)$/.exec(rawKey);
    if (!match?.[1]) continue;
    const path = [match[1], ...[...(match[2] ?? "").matchAll(/\[([^\]]*)\]/g)].map((part) => part[1] ?? "")];
    let cursor = root;
    path.forEach((segment, index) => {
      const key = segment === "" ? String(Object.keys(cursor).length) : segment;
      if (index === path.length - 1) cursor[key] = value;
      else {
        if (cursor[key] === null || typeof cursor[key] !== "object") cursor[key] = {};
        cursor = cursor[key] as Record<string, unknown>;
      }
    });
  }
  return toArrays(root) as Record<string, unknown>;
}

function toArrays(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  const entries = Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, toArrays(item)] as const);
  const sequential = entries.length > 0 && entries.every(([key], index) => key === String(index));
  return sequential ? entries.map(([, item]) => item) : Object.fromEntries(entries);
}

export class FakeBitrix {
  readonly host: string;
  readonly portal: string;
  readonly userId: string;
  readonly secret: string;
  scopes: string[];
  ownerId: number;
  /** `user.add` só funciona para administrador do portal. */
  ownerIsAdmin = true;
  /** Departamento (`UF_DEPARTMENT`) de cada conta; sem registro, o departamento 1. */
  departments = new Map<number, number[]>();
  now: () => Date = () => new Date();

  users = new Map<number, FakeUser>();
  groups = new Map<number, FakeGroup>();
  tasks = new Map<number, FakeTask>();
  checklist = new Map<number, FakeChecklistItem>();
  comments: Array<{ id: number; taskId: number; message: string }> = [];
  notifications: Array<{ id: number; userId: number; message: string }> = [];
  events: Array<{ id: number; ownerId: number; name: string; from: string; to: string; attendees: number[] }> = [];
  posts: Array<{ id: number; title: string; message: string; dest: string[] }> = [];
  stageHistory: FakeStageHistory[] = [];
  /** Drive: um armazenamento por grupo (raiz = pasta) e os objetos dentro dele. */
  storages: Array<{ id: number; entityType: "group" | "user"; entityId: number; rootObjectId: number }> = [];
  drive = new Map<number, FakeDriveObject>();
  attachments: Array<{ id: number; taskId: number; fileId: number }> = [];
  crmItems = new Map<string, FakeCrmItem>();
  crmTypes: Array<{ id: number; entityTypeId: number; title: string }> = [];
  categories = new Map<number, Array<{ id: number; name: string }>>();
  statuses = new Map<string, Array<{ id: string; name: string }>>();
  crmFields = new Map<number, Record<string, { type: string; title: string }>>();
  /** Chamadas recebidas, inclusive as que falharam por injeção e as de dentro de `batch`, na ordem. */
  calls: Array<{ method: string; params: Record<string, unknown> }> = [];

  private faults = new Map<string, FaultKind[]>();
  private ids = { task: 100, item: 1000, group: 10, comment: 1, history: 0, event: 1, post: 1, notify: 1, crm: 1, storage: 1, disk: 5000, attachment: 1 };

  constructor(options: { host?: string; userId?: string; secret?: string; scopes?: string[]; owner?: Partial<FakeUser> & { id?: number } } = {}) {
    this.host = options.host ?? "fake.bitrix24.com.br";
    this.portal = `https://${this.host}`;
    this.userId = options.userId ?? "1";
    this.secret = options.secret ?? "s3cr3tw3bh00k";
    this.scopes = options.scopes ?? ["task", "user_brief", "crm", "sonet_group", "im", "calendar", "log"];
    this.ownerId = options.owner?.id ?? Number(this.userId);
    this.addUser({ id: this.ownerId, name: "Marina", lastName: "RH", position: "Analista de RH", ...options.owner });
  }

  webhookUrl(): string {
    return `${this.portal}/rest/${this.userId}/${this.secret}/`;
  }

  /* ───────────── preparação e ajudantes de teste ───────────── */

  addUser(user: Partial<FakeUser> & { id: number; name: string }): FakeUser {
    const full: FakeUser = { lastName: "", email: `${user.name.toLowerCase()}@empresa.test`, position: "", active: true, userType: "employee", ...user };
    this.users.set(full.id, full);
    return full;
  }

  /** A próxima chamada a `method` falha do jeito pedido (`times` vezes). */
  failNext(method: string, kind: FaultKind, times = 1): void {
    const queue = this.faults.get(method) ?? [];
    for (let index = 0; index < times; index++) queue.push(kind);
    this.faults.set(method, queue);
  }

  /** O responsável conclui: vai para 4 (aguardando aprovação) se a tarefa tem controle, senão 5. */
  closeTask(id: number | string): void {
    const task = this.requireTask(Number(id));
    task.status = task.taskControl === "Y" ? 4 : 5;
    task.closedDate = task.status === 5 ? isoSeconds(this.now()) : null;
  }

  setTaskStatus(id: number | string, status: number): void {
    const task = this.requireTask(Number(id));
    task.status = status;
    task.closedDate = status === 5 ? isoSeconds(this.now()) : null;
  }

  deleteTask(id: number | string): void {
    this.tasks.delete(Number(id));
    for (const [itemId, item] of this.checklist) if (item.taskId === Number(id)) this.checklist.delete(itemId);
  }

  /** Marca (ou desmarca) um item pelo ID ou pelo texto. */
  checkItem(taskId: number | string, item: number | string, done = true): void {
    const found =
      typeof item === "number" ? this.checklist.get(item) : [...this.checklist.values()].find((entry) => entry.taskId === Number(taskId) && entry.title === item);
    if (!found) throw new Error(`Item ${item} não existe na tarefa ${taskId}`);
    found.done = done;
  }

  checklistOf(taskId: number | string): FakeChecklistItem[] {
    return [...this.checklist.values()].filter((item) => item.taskId === Number(taskId)).sort((a, b) => a.sortIndex - b.sortIndex || a.id - b.id);
  }

  taskByXmlId(xmlId: string): FakeTask | undefined {
    return [...this.tasks.values()].find((task) => task.xmlId === xmlId);
  }

  /** Arquivos de uma pasta do Drive (ou de todo o Drive, sem `parentId`). */
  driveFiles(parentId?: number): FakeDriveObject[] {
    return [...this.drive.values()].filter((item) => item.type === "file" && (parentId === undefined || item.parentId === parentId));
  }

  driveFolder(name: string): FakeDriveObject | undefined {
    return [...this.drive.values()].find((item) => item.type === "folder" && item.name === name);
  }

  /** Apaga o objeto e o que estiver dentro dele. */
  deleteDriveObject(id: number): void {
    this.drive.delete(id);
    for (const item of [...this.drive.values()]) if (item.parentId === id) this.deleteDriveObject(item.id);
  }

  countCalls(method: string): number {
    return this.calls.filter((call) => call.method === method).length;
  }

  addCrmItem(entityTypeId: number, input: { id?: number; title: string; stageId: string; categoryId?: number; fields?: Record<string, unknown>; history?: boolean }): FakeCrmItem {
    const item: FakeCrmItem = { entityTypeId, id: input.id ?? this.ids.crm++, title: input.title, stageId: input.stageId, categoryId: input.categoryId ?? 0, fields: input.fields ?? {} };
    this.crmItems.set(`${entityTypeId}:${item.id}`, item);
    if (input.history !== false) this.pushHistory(item, 1);
    return item;
  }

  /** Move o registro de etapa e grava o histórico (TYPE_ID 2, ou 3 para etapas finais com WON/LOSE/JUNK/CONVERTED). */
  moveCrmItem(entityTypeId: number, id: number, stageId: string): void {
    const item = this.crmItems.get(`${entityTypeId}:${id}`);
    if (!item) throw new Error(`Registro ${entityTypeId}:${id} não existe`);
    item.stageId = stageId;
    this.pushHistory(item, /(WON|LOSE|JUNK|CONVERTED|SUCCESS|FAIL)$/.test(stageId) ? 3 : 2);
  }

  private pushHistory(item: FakeCrmItem, typeId: number): void {
    this.stageHistory.push({
      id: ++this.ids.history,
      entityTypeId: item.entityTypeId,
      typeId,
      ownerId: item.id,
      stageId: item.stageId,
      categoryId: item.categoryId,
      createdTime: isoSeconds(this.now()),
    });
  }

  /* ───────────── transporte ───────────── */

  asFetch(): typeof fetch {
    const handler = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      if (url.host !== this.host) throw new TypeError("fetch failed");
      const match = /^\/rest\/(\d+)\/([^/]+)\/([\w.]+)\.json$/.exec(url.pathname);
      if (!match || match[1] !== this.userId || match[2] !== this.secret) {
        return json(401, { error: "INVALID_CREDENTIALS", error_description: "Invalid request credentials" });
      }
      const method = match[3] ?? "";
      const params = init?.body ? asObject(JSON.parse(String(init.body))) : {};
      this.calls.push({ method, params });
      const fault = this.takeFault(method);
      if (fault === "timeout") throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
      if (fault === "limit") return json(503, { error: "QUERY_LIMIT_EXCEEDED", error_description: "Too many requests" });
      if (fault === "denied") return json(403, { error: "ACCESS_DENIED", error_description: "Access denied" });
      if (fault === "serverError") return json(500, { error: "INTERNAL_SERVER_ERROR", error_description: "Internal server error" });
      const response = this.execute(method, params);
      if (fault === "commitThenTimeout") throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
      return json(response.status, response.body);
    };
    return handler as typeof fetch;
  }

  private takeFault(method: string): FaultKind | undefined {
    const queue = this.faults.get(method);
    const fault = queue?.shift();
    if (queue && !queue.length) this.faults.delete(method);
    return fault;
  }

  private execute(method: string, params: Record<string, unknown>): FakeResponse {
    try {
      if (method === "batch") return { status: 200, body: { result: this.batch(params), time: {} } };
      this.checkScope(method);
      return { status: 200, body: { ...this.dispatch(method, params), time: {} } };
    } catch (error) {
      if (error instanceof FakeFailure) return { status: error.status, body: { error: error.code, error_description: error.message } };
      throw error;
    }
  }

  private checkScope(method: string): void {
    const rule = SCOPE_BY_PREFIX.find(([pattern]) => pattern.test(method));
    if (rule && !rule[1].some((scope) => this.scopes.includes(scope))) {
      throw new FakeFailure(401, "insufficient_scope", "The request requires higher privileges than provided by the webhook token");
    }
  }

  private batch(params: Record<string, unknown>): Record<string, unknown> {
    const halt = truthy(params.halt);
    const result: Record<string, unknown> = {};
    const errors: Record<string, unknown> = {};
    for (const [key, raw] of Object.entries(asObject(params.cmd))) {
      const command = String(raw);
      const separator = command.indexOf("?");
      const method = separator === -1 ? command : command.slice(0, separator);
      const query = separator === -1 ? {} : parsePhpQuery(command.slice(separator + 1));
      this.calls.push({ method, params: query });
      const fault = this.takeFault(method);
      try {
        if (fault === "limit") throw new FakeFailure(503, "QUERY_LIMIT_EXCEEDED", "Too many requests");
        if (fault === "denied") throw new FakeFailure(403, "ACCESS_DENIED", "Access denied");
        this.checkScope(method);
        result[key] = this.dispatch(method, query).result;
      } catch (error) {
        if (!(error instanceof FakeFailure)) throw error;
        errors[key] = { error: error.code, error_description: error.message };
        if (halt) break;
      }
    }
    // Como o PHP: objeto vazio vira lista vazia.
    return { result: Object.keys(result).length ? result : [], result_error: Object.keys(errors).length ? errors : [], result_total: [], result_next: [], result_time: [] };
  }

  /* ───────────── métodos ───────────── */

  private dispatch(method: string, params: Record<string, unknown>): { result: unknown; next?: number; total?: number } {
    switch (method) {
      case "user.current":
        return { result: this.userPayload(this.requireUser(this.ownerId)) };
      case "scope":
        return { result: [...this.scopes] };
      case "user.get":
        return this.userGet(params);
      case "user.add":
        return { result: this.userAdd(params) };
      case "sonet_group.get":
        return this.groupGet(params);
      case "sonet_group.create":
        return { result: this.groupCreate(params) };
      case "tasks.task.add":
        return { result: { task: this.taskPayload(this.taskAdd(asObject(params.fields))) } };
      case "tasks.task.list":
        return this.taskList(params);
      case "tasks.task.get": {
        const task = this.tasks.get(Number(params.taskId));
        if (!task) throw new FakeFailure(400, "ERROR_CORE", "Task not found or access denied");
        return { result: { task: this.taskPayload(task, asList(params.select).map(String)) } };
      }
      case "tasks.task.complete":
      case "tasks.task.renew":
      case "tasks.task.approve":
      case "tasks.task.disapprove":
        return { result: { task: this.taskPayload(this.taskAction(method.slice("tasks.task.".length), Number(params.taskId))) } };
      case "task.commentitem.add": {
        this.requireTask(Number(params.TASKID));
        const message = String(asObject(params.FIELDS).POST_MESSAGE ?? "");
        if (!message) throw new FakeFailure(400, "ERROR_CORE", "POST_MESSAGE is required");
        const id = this.ids.comment++;
        this.comments.push({ id, taskId: Number(params.TASKID), message });
        return { result: id };
      }
      case "task.checklistitem.add":
        return { result: this.checklistAdd(Number(params.TASKID), asObject(params.FIELDS)) };
      case "task.checklistitem.getlist": {
        this.requireTask(Number(params.TASKID));
        return {
          result: this.checklistOf(Number(params.TASKID)).map((item) => ({
            ID: String(item.id),
            TASK_ID: String(item.taskId),
            PARENT_ID: item.parentId === 0 ? 0 : String(item.parentId),
            TITLE: item.title,
            SORT_INDEX: String(item.sortIndex),
            IS_COMPLETE: item.done ? "Y" : "N",
            IS_IMPORTANT: "N",
          })),
        };
      }
      case "task.checklistitem.complete":
      case "task.checklistitem.renew": {
        this.requireTask(Number(params.TASKID));
        const item = this.checklist.get(Number(params.ITEMID));
        if (!item || item.taskId !== Number(params.TASKID)) throw new FakeFailure(400, "ERROR_CORE", "Checklist item not found");
        item.done = method.endsWith("complete");
        return { result: true };
      }
      case "crm.status.list": {
        const entityId = String(asObject(params.filter).ENTITY_ID ?? "");
        const stages = this.statuses.get(entityId) ?? [];
        return { result: stages.map((stage, index) => ({ ID: String(index + 1), ENTITY_ID: entityId, STATUS_ID: stage.id, NAME: stage.name, SORT: String((index + 1) * 10) })) };
      }
      case "crm.category.list": {
        const categories = this.categories.get(Number(params.entityTypeId)) ?? [{ id: 0, name: "Geral" }];
        return { result: { categories: categories.map((category) => ({ id: category.id, name: category.name, entityTypeId: Number(params.entityTypeId), isDefault: category.id === 0 ? "Y" : "N" })) } };
      }
      case "crm.type.list":
        return { result: { types: this.crmTypes.map((type) => ({ id: type.id, entityTypeId: type.entityTypeId, title: type.title })) } };
      case "crm.item.fields":
        return { result: { fields: this.crmFields.get(Number(params.entityTypeId)) ?? { title: { type: "string", title: "Nome" } } } };
      case "crm.stagehistory.list":
        return this.stageHistoryList(params);
      case "crm.item.get": {
        const item = this.crmItems.get(`${Number(params.entityTypeId)}:${Number(params.id)}`);
        if (!item) throw new FakeFailure(400, "NOT_FOUND", "Element not found");
        return { result: { item: { id: item.id, title: item.title, stageId: item.stageId, categoryId: item.categoryId, ...item.fields } } };
      }
      case "im.notify.personal.add": {
        const userId = Number(params.USER_ID);
        this.requireUser(userId);
        const id = this.ids.notify++;
        this.notifications.push({ id, userId, message: String(params.MESSAGE ?? "") });
        return { result: id };
      }
      case "calendar.event.add": {
        const id = this.ids.event++;
        this.events.push({ id, ownerId: Number(params.ownerId), name: String(params.name), from: String(params.from), to: String(params.to), attendees: asList(params.attendees).map(Number) });
        return { result: id };
      }
      case "disk.storage.getlist": {
        const filter = asObject(params.filter);
        const storages = this.storages.filter(
          (storage) =>
            (filter.ENTITY_TYPE === undefined || storage.entityType === filter.ENTITY_TYPE) &&
            (filter.ENTITY_ID === undefined || String(storage.entityId) === String(filter.ENTITY_ID)),
        );
        const { page, next, total } = this.page(storages, params);
        return {
          result: page.map((storage) => ({ ID: String(storage.id), ENTITY_TYPE: storage.entityType, ENTITY_ID: String(storage.entityId), ROOT_OBJECT_ID: String(storage.rootObjectId) })),
          total,
          ...(next !== undefined ? { next } : {}),
        };
      }
      case "disk.folder.getchildren": {
        const folder = this.requireFolder(Number(params.id));
        const name = asObject(params.filter).NAME;
        const children = [...this.drive.values()].filter((item) => item.parentId === folder.id && (name === undefined || item.name.toLowerCase() === String(name).toLowerCase()));
        const { page, next, total } = this.page(children, params);
        return { result: page.map((item) => this.drivePayload(item)), total, ...(next !== undefined ? { next } : {}) };
      }
      case "disk.folder.addsubfolder": {
        const folder = this.requireFolder(Number(params.id));
        const name = String(asObject(params.data).NAME ?? "").trim();
        if (!name) throw new FakeFailure(400, "ERROR_ARGUMENT", "NAME is required");
        if ([...this.drive.values()].some((item) => item.parentId === folder.id && item.name === name)) {
          throw new FakeFailure(400, "DISK_OBJ_22000", "A folder with this name already exists");
        }
        return { result: this.drivePayload(this.addDriveObject(folder, name, "folder", null)) };
      }
      case "disk.folder.uploadfile": {
        const folder = this.requireFolder(Number(params.id));
        const name = String(asObject(params.data).NAME ?? "").trim();
        const [, base64] = asList(params.fileContent).map(String);
        if (!name || !base64) throw new FakeFailure(400, "ERROR_ARGUMENT", "NAME and fileContent are required");
        if ([...this.drive.values()].some((item) => item.parentId === folder.id && item.name === name)) {
          throw new FakeFailure(400, "DISK_OBJ_22000", "A file with this name already exists");
        }
        return { result: this.drivePayload(this.addDriveObject(folder, name, "file", Buffer.from(base64, "base64"))) };
      }
      case "tasks.task.files.attach": {
        const task = this.requireTask(Number(params.taskId));
        const file = this.drive.get(Number(params.fileId));
        if (!file || file.type !== "file") throw new FakeFailure(400, "ERROR_CORE", "Insufficient permissions");
        const id = this.ids.attachment++;
        this.attachments.push({ id, taskId: task.id, fileId: file.id });
        return { result: { attachmentId: id } };
      }
      case "disk.attachedObject.get": {
        const attachment = this.attachments.find((item) => item.id === Number(params.id));
        if (!attachment) throw new FakeFailure(404, "ERROR_NOT_FOUND", "Could not find entity with id");
        return { result: { ID: String(attachment.id), OBJECT_ID: String(attachment.fileId), ENTITY_TYPE: "tasks_task", ENTITY_ID: String(attachment.taskId) } };
      }
      case "log.blogpost.add": {
        const id = this.ids.post++;
        this.posts.push({ id, title: String(params.POST_TITLE ?? ""), message: String(params.POST_MESSAGE ?? ""), dest: asList(params.DEST).map(String) });
        return { result: id };
      }
      default:
        throw new FakeFailure(404, "ERROR_METHOD_NOT_FOUND", "Method not found!");
    }
  }

  private requireUser(id: number): FakeUser {
    const user = this.users.get(id);
    if (!user) throw new FakeFailure(400, "ERROR_CORE", "User not found");
    return user;
  }

  private requireFolder(id: number): FakeDriveObject {
    const folder = this.drive.get(id);
    if (!folder || folder.type !== "folder") throw new FakeFailure(400, "ERROR_NOT_FOUND", "Could not find entity with id");
    return folder;
  }

  private addDriveObject(parent: FakeDriveObject, name: string, type: FakeDriveObject["type"], content: Buffer | null): FakeDriveObject {
    const item: FakeDriveObject = { id: this.ids.disk++, storageId: parent.storageId, parentId: parent.id, name, type, content };
    this.drive.set(item.id, item);
    return item;
  }

  private drivePayload(item: FakeDriveObject): Record<string, unknown> {
    return {
      ID: String(item.id),
      NAME: item.name,
      TYPE: item.type,
      STORAGE_ID: String(item.storageId),
      PARENT_ID: String(item.parentId),
      DETAIL_URL: `${this.portal}/workgroups/group/drive/${item.id}/`,
      ...(item.content ? { SIZE: String(item.content.length) } : {}),
    };
  }

  private requireTask(id: number): FakeTask {
    const task = this.tasks.get(id);
    if (!task) throw new FakeFailure(400, "ERROR_CORE", "Task not found or access denied");
    return task;
  }

  private userPayload(user: FakeUser): Record<string, unknown> {
    return { ID: String(user.id), ACTIVE: user.active, NAME: user.name, LAST_NAME: user.lastName, EMAIL: user.email, WORK_POSITION: user.position, USER_TYPE: user.userType, UF_DEPARTMENT: this.departments.get(user.id) ?? [1] };
  }

  private page<T>(items: T[], params: Record<string, unknown>): { page: T[]; next?: number; total: number } {
    const start = Math.max(0, Number(params.start ?? 0) || 0);
    const page = items.slice(start, start + 50);
    return { page, total: items.length, ...(start + 50 < items.length ? { next: start + 50 } : {}) };
  }

  private userGet(params: Record<string, unknown>) {
    const filter = asObject(params.FILTER ?? params.filter);
    const users = [...this.users.values()]
      .filter((user) => (filter.ACTIVE === undefined ? true : truthy(filter.ACTIVE) === user.active))
      .filter((user) => filter.ID === undefined || String(filter.ID) === String(user.id))
      .filter((user) => filter.EMAIL === undefined || String(filter.EMAIL).toLowerCase() === user.email.toLowerCase())
      .sort((a, b) => a.id - b.id);
    const { page, next, total } = this.page(users, params);
    return { result: page.map((user) => this.userPayload(user)), total, ...(next !== undefined ? { next } : {}) };
  }

  /** Como o portal: só administrador convida, e-mail repetido é recusado, intranet exige departamento. */
  private userAdd(params: Record<string, unknown>): number {
    if (!this.ownerIsAdmin) throw new FakeFailure(403, "ACCESS_DENIED", "Access denied.");
    const email = String(params.EMAIL ?? "").trim();
    if (!email) throw new FakeFailure(400, "ERROR_CORE", "Email is required");
    if ([...this.users.values()].some((user) => user.email.toLowerCase() === email.toLowerCase())) {
      throw new FakeFailure(400, "ERROR_CORE", "User with this email already exists");
    }
    const departments = asList(params.UF_DEPARTMENT).map(Number).filter((id) => id > 0);
    if (!truthy(params.EXTRANET) && !departments.length) throw new FakeFailure(400, "ERROR_CORE", "UF_DEPARTMENT is required");
    const id = Math.max(...this.users.keys()) + 1;
    this.addUser({ id, name: String(params.NAME ?? ""), lastName: String(params.LAST_NAME ?? ""), email });
    this.departments.set(id, departments);
    return id;
  }

  private groupGet(params: Record<string, unknown>) {
    const filter = asObject(params.FILTER);
    const name = filter.NAME === undefined ? null : String(filter.NAME).toLowerCase();
    const groups = [...this.groups.values()].filter((group) => name === null || group.name.toLowerCase() === name).sort((a, b) => a.id - b.id);
    const { page, next, total } = this.page(groups, params);
    return {
      result: page.map((group) => ({
        ID: String(group.id),
        NAME: group.name,
        DESCRIPTION: group.description,
        PROJECT: group.project ? "Y" : "N",
        VISIBLE: group.visible ? "Y" : "N",
        OPENED: group.opened ? "Y" : "N",
        CLOSED: group.closed ? "Y" : "N",
      })),
      total,
      ...(next !== undefined ? { next } : {}),
    };
  }

  private groupCreate(params: Record<string, unknown>): number {
    const name = String(params.NAME ?? "").trim();
    if (!name) throw new FakeFailure(400, "ERROR_CORE", "Group name is empty");
    const id = this.ids.group++;
    this.groups.set(id, {
      id,
      name,
      description: String(params.DESCRIPTION ?? ""),
      project: truthy(params.PROJECT),
      visible: truthy(params.VISIBLE ?? "Y"),
      opened: truthy(params.OPENED ?? "N"),
      closed: false,
      initiatePerms: String(params.INITIATE_PERMS ?? "K"),
    });
    // Todo grupo nasce com o seu Drive.
    const storageId = this.ids.storage++;
    const root: FakeDriveObject = { id: this.ids.disk++, storageId, parentId: 0, name: name, type: "folder", content: null };
    this.drive.set(root.id, root);
    this.storages.push({ id: storageId, entityType: "group", entityId: id, rootObjectId: root.id });
    return id;
  }

  private taskAdd(fields: Record<string, unknown>): FakeTask {
    const title = String(fields.TITLE ?? "").trim();
    if (!title) throw new FakeFailure(400, "ERROR_CORE", "Task title is empty");
    const responsible = this.users.get(Number(fields.RESPONSIBLE_ID));
    if (!responsible || !responsible.active) throw new FakeFailure(400, "ERROR_CORE", "Responsible user not found");
    const task: FakeTask = {
      id: this.ids.task++,
      title,
      description: String(fields.DESCRIPTION ?? ""),
      responsibleId: responsible.id,
      createdBy: this.ownerId,
      auditors: asList(fields.AUDITORS).map(Number),
      deadline: fields.DEADLINE ? String(fields.DEADLINE) : null,
      groupId: Number(fields.GROUP_ID ?? 0),
      xmlId: fields.XML_ID ? String(fields.XML_ID) : null,
      status: 2,
      closedDate: null,
      createdDate: isoSeconds(this.now()),
      taskControl: fields.TASK_CONTROL === "Y" ? "Y" : "N",
      allowChangeDeadline: fields.ALLOW_CHANGE_DEADLINE === "Y" ? "Y" : "N",
      ufCrmTask: asList(fields.UF_CRM_TASK).map(String),
    };
    this.tasks.set(task.id, task);
    return task;
  }

  private taskPayload(task: FakeTask, select?: string[]): Record<string, unknown> {
    const all: Record<string, [string, unknown]> = {
      ID: ["id", String(task.id)],
      TITLE: ["title", task.title],
      DESCRIPTION: ["description", task.description],
      STATUS: ["status", String(task.status)],
      DEADLINE: ["deadline", task.deadline],
      RESPONSIBLE_ID: ["responsibleId", String(task.responsibleId)],
      CREATED_BY: ["createdBy", String(task.createdBy)],
      CLOSED_DATE: ["closedDate", task.closedDate],
      GROUP_ID: ["groupId", String(task.groupId)],
      XML_ID: ["xmlId", task.xmlId],
      CREATED_DATE: ["createdDate", task.createdDate],
      AUDITORS: ["auditors", task.auditors.map(String)],
      TASK_CONTROL: ["taskControl", task.taskControl],
      UF_CRM_TASK: ["ufCrmTask", task.ufCrmTask],
      UF_TASK_WEBDAV_FILES: ["ufTaskWebdavFiles", this.attachments.filter((attachment) => attachment.taskId === task.id).map((attachment) => attachment.id)],
    };
    const keys = select?.length ? ["ID", ...select.map(String)] : Object.keys(all);
    return Object.fromEntries(keys.filter((key) => all[key]).map((key) => all[key]!));
  }

  private taskList(params: Record<string, unknown>) {
    const filter = asObject(params.filter);
    let tasks = [...this.tasks.values()];
    if (filter.ID !== undefined) {
      const ids = new Set((Array.isArray(filter.ID) ? filter.ID : [filter.ID]).map(Number));
      tasks = tasks.filter((task) => ids.has(task.id));
    }
    if (filter.GROUP_ID !== undefined) tasks = tasks.filter((task) => task.groupId === Number(filter.GROUP_ID));
    if (filter[">=CREATED_DATE"] !== undefined) {
      const since = Date.parse(String(filter[">=CREATED_DATE"]));
      tasks = tasks.filter((task) => Date.parse(task.createdDate) >= since);
    }
    const direction = String(asObject(params.order).ID ?? "desc").toLowerCase() === "asc" ? 1 : -1;
    tasks.sort((a, b) => (a.id - b.id) * direction);
    const { page, next, total } = this.page(tasks, params);
    const select = asList(params.select).map(String);
    return { result: { tasks: page.map((task) => this.taskPayload(task, select)) }, total, ...(next !== undefined ? { next } : {}) };
  }

  private taskAction(action: string, id: number): FakeTask {
    const task = this.requireTask(id);
    if (action === "complete") {
      task.status = 5;
      task.closedDate = isoSeconds(this.now());
    } else if (action === "renew") {
      task.status = 2;
      task.closedDate = null;
    } else if (action === "approve" || action === "disapprove") {
      if (task.status !== 4) throw new FakeFailure(400, "ERROR_CORE", "Action is not available");
      task.status = action === "approve" ? 5 : 2;
      task.closedDate = action === "approve" ? isoSeconds(this.now()) : null;
    }
    return task;
  }

  private checklistAdd(taskId: number, fields: Record<string, unknown>): number {
    this.requireTask(taskId);
    const title = String(fields.TITLE ?? "").trim();
    if (!title) throw new FakeFailure(400, "ERROR_CORE", "TITLE is required");
    const item: FakeChecklistItem = {
      id: this.ids.item++,
      taskId,
      parentId: Number(fields.PARENT_ID ?? 0) || 0,
      title,
      done: truthy(fields.IS_COMPLETE),
      sortIndex: Number(fields.SORT_INDEX ?? 0) || 0,
    };
    this.checklist.set(item.id, item);
    return item.id;
  }

  private stageHistoryList(params: Record<string, unknown>) {
    const entityTypeId = Number(params.entityTypeId);
    const filter = asObject(params.filter);
    let entries = this.stageHistory.filter((entry) => entry.entityTypeId === entityTypeId);
    if (filter[">ID"] !== undefined) entries = entries.filter((entry) => entry.id > Number(filter[">ID"]));
    const direction = String(asObject(params.order).ID ?? "ASC").toUpperCase() === "DESC" ? -1 : 1;
    entries.sort((a, b) => (a.id - b.id) * direction);
    const { page, next, total } = this.page(entries, params);
    const lead = entityTypeId === 1;
    return {
      result: {
        items: page.map((entry) => ({
          ID: entry.id,
          TYPE_ID: entry.typeId,
          OWNER_ID: entry.ownerId,
          CREATED_TIME: entry.createdTime,
          ...(lead ? { STATUS_SEMANTIC_ID: "P", STATUS_ID: entry.stageId } : { CATEGORY_ID: entry.categoryId, STAGE_SEMANTIC_ID: "P", STAGE_ID: entry.stageId }),
        })),
      },
      total,
      ...(next !== undefined ? { next } : {}),
    };
  }
}

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
