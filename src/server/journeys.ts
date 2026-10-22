import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import type { Journey, JourneyTask, JourneyTemplate, SessionInfo, CreateJourneyInput, RadarAlert } from "../shared/contracts";
import { journeySchema, processSchema as savedProcessSchema, templateSchema as savedTemplateSchema } from "../shared/validation";
import { Auth } from "./auth";
import { BitrixClient } from "./bitrix";
import { canCompleteJourney, deadlineAt, summarizeJourney, taskDone, taskStatus } from "./domain";
import { AppError, BitrixError } from "./errors";
import { auditSchema, issueSchema, journeyOwnerSchema, operationSchema, record, text } from "./models";
import { Store } from "./store";
import { createJourneySchema, templateSchema, taskActionSchema } from "./validation";
const checklistSchema = z.object({ ID: z.union([z.string(), z.number()]).transform(String), TITLE: z.string(), IS_COMPLETE: z.union([z.string(), z.boolean()]).optional(), PARENT_ID: z.union([z.string(), z.number()]).optional() });
const remoteTaskSchema = z.object({ task: z.object({ id: z.union([z.string(), z.number()]).transform(String) }).passthrough() });
const remoteSourceSchema = z.object({ item: z.object({ id: z.union([z.string(), z.number()]).transform(String) }).passthrough() });
export class Journeys {
  constructor(readonly store: Store, readonly auth: Auth, readonly bitrix: BitrixClient) {}
  get(id: string): Journey {
    const journey = this.store.get("journey", id, journeySchema);
    if (!journey) throw new AppError("JOURNEY_NOT_FOUND", "Jornada não encontrada.", 404);
    return journey;
  }
  save(journey: Journey): Journey { const summarized = summarizeJourney(journey); this.store.put("journey", journey.id, summarized); return summarized; }
  saveTemplate(session: SessionInfo, body: unknown, updateId?: string): JourneyTemplate {
    this.auth.requireManage(session);
    const parsed = templateSchema.parse(body);
    if (updateId && parsed.id !== updateId) throw new AppError("TEMPLATE_ID", "ID do modelo não corresponde à URL.");
    const previous = this.store.get("template", parsed.id, savedTemplateSchema);
    if (updateId && !previous) throw new AppError("TEMPLATE_NOT_FOUND", "Modelo não encontrado.", 404);
    if (!updateId && previous) throw new AppError("TEMPLATE_EXISTS", "Já existe um modelo com este ID.", 409);
    const result: JourneyTemplate = { ...parsed, version: (previous?.version ?? 0) + 1, updatedAt: new Date().toISOString() };
    this.store.put("template", result.id, result);
    this.audit("template.saved", `Modelo ${result.name}, versão ${result.version}.`, session.user.name);
    return result;
  }
  audit(action: string, message: string, actorName: string, journeyId?: string) {
    const id = randomUUID(); this.store.put("audit", id, { id, action, message, actorName, createdAt: new Date().toISOString(), ...(journeyId ? { journeyId } : {}) });
  }
  issue(id: string, title: string, message: string, retryable: boolean, sourceItemId?: number) {
    this.store.put("issue", id, { id, title, message, retryable, createdAt: new Date().toISOString(), ...(sourceItemId ? { sourceItemId } : {}) });
  }
  sourceKey(entityTypeId: number, itemId: number): string {
    const installation = this.auth.installation();
    if (!installation) throw new AppError("NOT_INSTALLED", "Instalação ausente.", 503);
    return `approval:${installation.memberId}:${entityTypeId}:${itemId}`;
  }
  sourceJourney(entityTypeId: number, itemId: number, marker?: unknown): Journey | null {
    const reserved = this.store.reservationId(this.sourceKey(entityTypeId, itemId));
    if (reserved) return this.get(reserved);
    const matches = this.store.list("journey", journeySchema).filter(journey => journey.sourceItemId === itemId && this.store.get("journey-process", journey.id, z.object({ entityTypeId: z.number() }))?.entityTypeId === entityTypeId);
    if (matches.length > 1) throw new AppError("SOURCE_DUPLICATE", "Há mais de uma jornada vinculada à movimentação. Consulte o suporte.", 409);
    const existing = matches[0];
    if (!existing) {
      if (typeof marker !== "string" || !/^nexo:[a-f\d-]{36}$/i.test(marker)) return null;
      const candidate = this.store.get("journey", marker.slice(5), journeySchema);
      if (!candidate || candidate.source !== "manual" || candidate.status !== "creating" || candidate.sourceItemId !== null) return null;
      const process = this.store.get("journey-process", candidate.id, savedProcessSchema);
      const operation = this.store.get("operation", `spa:${candidate.id}`, operationSchema);
      if (process?.entityTypeId !== entityTypeId || !operation || (operation.remoteId !== undefined && operation.remoteId !== String(itemId))) return null;
      return this.linkSource(candidate, entityTypeId, itemId);
    }
    const key = this.sourceKey(entityTypeId, itemId), binding = this.store.reserve(key, key, existing.id);
    return this.get(binding.id);
  }
  private linkSource(journey: Journey, entityTypeId: number, itemId: number): Journey {
    return this.store.transaction(() => {
      const current = this.get(journey.id);
      if (current.sourceItemId !== null && current.sourceItemId !== itemId) throw new AppError("SOURCE_MISMATCH", "A jornada já está vinculada a outra movimentação.", 409);
      const key = this.sourceKey(entityTypeId, itemId), binding = this.store.reserve(key, key, journey.id);
      if (binding.id !== journey.id) throw new AppError("SOURCE_ALREADY_BOUND", "Esta movimentação já está vinculada a outra jornada.", 409);
      return this.save({ ...current, sourceItemId: itemId, sourceUrl: `${this.auth.env.portalUrl}/crm/type/${entityTypeId}/details/${itemId}/` });
    });
  }
  private cancelLocked(id: string): Journey {
    return this.store.transaction(() => {
      const current = this.get(id);
      if (current.status === "completed" || current.status === "cancelled") return current;
      const cancelled = this.save({ ...current, status: "cancelled" });
      this.store.finishJob(`journey:${id}`);
      this.store.remove("issue", `sync:${id}`);
      this.store.remove("issue", `job:journey:${id}`);
      for (const task of current.tasks) this.store.remove("issue", `task:${task.id}`);
      this.audit("journey.cancelled", "Movimentação cancelada no Bitrix24. Novas criações foram interrompidas.", "Automação autorizada", id);
      return cancelled;
    });
  }
  async cancel(id: string): Promise<Journey> {
    const owner = randomUUID();
    if (!this.store.lease(`journey:${id}`, owner, 120000)) throw new BitrixError("JOURNEY_BUSY", true);
    try { return this.cancelLocked(id); } finally { this.store.release(`journey:${id}`, owner); }
  }
  private async sourceCancelled(userId: string, journey: Journey, process: { entityTypeId: number; cancelledStageId: string }): Promise<boolean> {
    if (!journey.sourceItemId) return false;
    const item = await this.remoteSource(userId, process.entityTypeId, journey.sourceItemId);
    if (item.stageId !== process.cancelledStageId) return false;
    this.cancelLocked(journey.id);
    return true;
  }
  async remoteSource(userId: string, entityTypeId: number, itemId: number): Promise<Record<string, unknown>> {
    const response = remoteSourceSchema.safeParse(await this.bitrix.call(userId, "crm.item.get", { entityTypeId, id: itemId }));
    if (!response.success || response.data.item.id !== String(itemId)) throw new AppError("ACCESS_DENIED", "O Bitrix24 não confirmou acesso à movimentação solicitada.", 403);
    return response.data.item;
  }
  private process(id: string) {
    const process = this.store.get("journey-process", id, savedProcessSchema);
    if (!process) throw new AppError("PROCESS_REQUIRED", "Vínculo de processo ausente.");
    return process;
  }
  async reconcileJourney(id: string, userId: string): Promise<Journey> {
    const owner = randomUUID();
    if (!this.store.lease(`journey:${id}`, owner, 120000)) throw new BitrixError("JOURNEY_BUSY", true);
    const heartbeat = setInterval(() => this.store.lease(`journey:${id}`, owner, 120000), 30000);
    try {
      const journey = this.get(id);
      if (journey.status === "cancelled" || journey.status === "completed") return journey;
      if (await this.sourceCancelled(userId, journey, this.process(id))) return this.get(id);
      journey.tasks = await Promise.all(journey.tasks.map(task => this.refreshTask(userId, task)));
      return this.save(journey);
    } finally { clearInterval(heartbeat); this.store.release(`journey:${id}`, owner); }
  }
  async create(session: SessionInfo, body: unknown, approval?: { source: string; itemId: number }): Promise<Journey> {
    this.auth.requireManage(session);
    const input: CreateJourneyInput = createJourneySchema.parse(body), settings = this.auth.settings();
    if (!settings.setupComplete || !settings.process) throw new AppError("SETUP_REQUIRED", "Conclua a configuração antes de criar jornadas.", 409);
    if (!settings.automationUserId) throw new AppError("AUTOMATION_REQUIRED", "Autorize uma conta de automação nas configurações.", 409);
    this.bitrix.credentials(settings.automationUserId);
    const template = this.store.get("template", input.templateId, savedTemplateSchema);
    if (!template || template.type !== input.type) throw new AppError("TEMPLATE_INVALID", "Selecione um modelo compatível.");
    const employee = await this.bitrix.user(session.user.id, input.employeeId);
    if (!employee.active) throw new AppError("EMPLOYEE_INACTIVE", "Selecione um colaborador ativo.");
    const users = new Map([[employee.id, employee]]);
    const assigned = { ...settings.defaultAssignees, ...input.assignees, colaborador: employee.id };
    for (const activity of template.stages.flatMap(stage => stage.activities)) {
      const userId = assigned[activity.assigneeRole];
      if (!userId) throw new AppError("ASSIGNEE_REQUIRED", `Defina o responsável de ${activity.assigneeRole} para ${activity.title}.`);
      if (!users.has(userId)) users.set(userId, await this.bitrix.user(session.user.id, userId));
      if (!users.get(userId)?.active) throw new AppError("ASSIGNEE_INACTIVE", "Há um responsável inativo.");
    }
    const source = approval?.source ?? `manual:${session.memberId}:${session.user.id}:${input.requestId}`;
    const fingerprint = createHash("sha256").update(JSON.stringify(input)).digest("hex");
    return this.store.transaction(() => {
      const reservation = this.store.reserve(source, approval ? source : fingerprint, randomUUID());
      if (!reservation.fresh) return this.get(reservation.id);
      const id = reservation.id;
      const tasks: JourneyTask[] = template.stages.flatMap((stage, stageOrder) => stage.activities.map(activity => ({ id: randomUUID(), journeyId: id, title: activity.title, description: activity.description, stageTitle: stage.title, stageOrder, assigneeRole: activity.assigneeRole, assignee: users.get(assigned[activity.assigneeRole] ?? "") ?? null, dueAt: deadlineAt(input.referenceDate, activity.offsetDays, settings.timezone), required: activity.required, critical: activity.critical, visibility: activity.visibility, bitrixTaskId: null, bitrixUrl: null, status: "pending", syncState: "queued", checklist: activity.checklist.map(item => ({ ...item, completed: false })), documents: activity.documents })));
      const journey: Journey = { id, type: input.type, employee, templateId: template.id, templateName: template.name, templateVersion: template.version, referenceDate: input.referenceDate, status: "creating", source: approval ? "approval" : "manual", sourceItemId: approval?.itemId ?? null, sourceUrl: approval ? `${this.auth.env.portalUrl}/crm/type/${settings.process?.entityTypeId}/details/${approval.itemId}/` : null, createdAt: new Date().toISOString(), completedAt: null, progress: 0, taskCount: tasks.length, completedCount: 0, radar: "unknown", tasks };
      this.store.put("snapshot", id, template);
      this.store.put("journey-owner", id, { userId: session.user.id, managerId: assigned.gestor ?? null, source });
      this.store.put("journey-process", id, settings.process);
      this.save(journey);
      this.store.enqueue(`journey:${id}`, "journey", { journeyId: id });
      this.audit("journey.created", `Jornada de ${employee.name} solicitada.`, session.user.name, id);
      return journey;
    });
  }
  async creation(id: string, find: () => Promise<string | null>, send: () => Promise<string>): Promise<string> {
    const previous = this.store.get("operation", id, operationSchema);
    if (previous?.state === "confirmed" && previous.remoteId) return previous.remoteId;
    if (previous) {
      const found = await find();
      if (found) { this.store.put("operation", id, { state: "confirmed", remoteId: found }); return found; }
      this.store.put("operation", id, { state: "uncertain" });
      throw new BitrixError("CREATE_UNCERTAIN", true, true);
    }
    this.store.put("operation", id, { state: "sending" });
    try {
      const remoteId = await send();
      this.store.put("operation", id, { state: "confirmed", remoteId });
      return remoteId;
    } catch (error) {
      if (error instanceof BitrixError && !error.uncertain) this.store.remove("operation", id);
      else this.store.put("operation", id, { state: "uncertain" });
      throw error;
    }
  }
  async runJourney(id: string): Promise<Journey> {
    const owner = randomUUID();
    if (!this.store.lease(`journey:${id}`, owner, 120000)) throw new BitrixError("JOURNEY_BUSY", true);
    const heartbeat = setInterval(() => this.store.lease(`journey:${id}`, owner, 120000), 30000);
    try {
      let journey = this.get(id);
      if (journey.status === "cancelled" || journey.status === "completed") return journey;
      const settings = this.auth.settings(), userId = settings.automationUserId;
      if (!userId) throw new AppError("AUTOMATION_REQUIRED", "A conta de automação precisa autorizar o aplicativo.");
      const process = this.process(id);
      if (!journey.sourceItemId) {
        const xmlId = `nexo:${id}`;
        const remoteId = await this.creation(`spa:${id}`, async () => {
          const items = await this.bitrix.list(userId, "crm.item.list", { entityTypeId: process.entityTypeId, filter: { xmlId }, select: ["id", "xmlId"] }, "items");
          const matches = items.map(record).filter(item => item.xmlId === xmlId);
          if (matches.length > 1) throw new AppError("DUPLICATE_REMOTE", "Mais de uma movimentação possui o marcador Nexo.", 409);
          return matches[0] ? text(matches[0].id) : null;
        }, async () => {
          const response = record(await this.bitrix.call(userId, "crm.item.add", { entityTypeId: process.entityTypeId, fields: { title: `${journey.type === "onboarding" ? "Onboarding" : "Offboarding"} · ${journey.employee.name}`, xmlId, categoryId: process.categoryId, stageId: process.inProgressStageId, assignedById: userId, opened: "N", [process.employeeField]: journey.employee.id, [process.dateField]: journey.referenceDate } }));
          return text(record(response.item).id);
        });
        journey = this.linkSource(journey, process.entityTypeId, Number(remoteId));
      }
      journey = this.linkSource(journey, process.entityTypeId, Number(journey.sourceItemId));
      if (await this.sourceCancelled(userId, journey, process)) return this.get(id);
      for (let index = 0; index < journey.tasks.length; index++) {
        let task = journey.tasks[index];
        if (!task) continue;
        try {
          if (await this.sourceCancelled(userId, journey, process)) return this.get(id);
          if (!task.assignee) throw new AppError("ASSIGNEE_REQUIRED", "Responsável da atividade não está definido.");
          const taskId = task.id, remoteTitle = `${task.title} [Nexo:${taskId}]`;
          const remoteId = task.bitrixTaskId ?? await this.creation(`task:${taskId}`, async () => {
            const results = await this.bitrix.list(userId, "tasks.task.list", { filter: { TITLE: remoteTitle }, select: ["ID", "TITLE"] }, "tasks");
            const matches = results.map(record).filter(item => item.title === remoteTitle);
            if (matches.length > 1) throw new AppError("DUPLICATE_REMOTE", "Mais de uma tarefa possui o marcador da atividade.", 409);
            return matches[0] ? text(matches[0].id) : null;
          }, async () => {
            const documents = task.documents.map(document => `${document.title}: ${document.url}`).join("\n");
            const response = record(await this.bitrix.call(userId, "tasks.task.add", { fields: { TITLE: remoteTitle, DESCRIPTION: `${task.description}\n\n${documents}\n\nNexo ${taskId}`, RESPONSIBLE_ID: Number(task.assignee?.id), DEADLINE: task.dueAt, TASK_CONTROL: "Y", UF_CRM_TASK: [`T${process.entityTypeId.toString(16)}_${journey.sourceItemId}`] } }));
            return text(record(response.task).id);
          });
          task = { ...task, bitrixTaskId: remoteId, bitrixUrl: `${this.auth.env.portalUrl}/company/personal/user/${task.assignee.id}/tasks/task/view/${remoteId}/`, syncState: "syncing" };
          journey.tasks[index] = task; this.save(journey);
          for (let itemIndex = 0; itemIndex < task.checklist.length; itemIndex++) {
            const item = task.checklist[itemIndex];
            if (!item || item.bitrixId) continue;
            if (await this.sourceCancelled(userId, journey, process)) return this.get(id);
            const itemTitle = `${item.title} [Nexo:${item.id}]`;
            const bitrixId = await this.creation(`checklist:${task.id}:${item.id}`, async () => {
              const all = await this.checklist(userId, remoteId);
              const matches = all.filter(entry => entry.TITLE === itemTitle);
              if (matches.length > 1) throw new AppError("DUPLICATE_REMOTE", "Checklist remoto duplicado.", 409);
              return matches[0]?.ID ?? null;
            }, async () => text(await this.bitrix.call(userId, "task.checklistitem.add", { TASKID: Number(remoteId), FIELDS: { TITLE: itemTitle, IS_COMPLETE: "N", IS_IMPORTANT: item.required ? "Y" : "N" } })));
            task.checklist[itemIndex] = { ...item, bitrixId };
            journey.tasks[index] = task; this.save(journey);
          }
          task = await this.refreshTask(userId, task);
          journey.tasks[index] = task; this.save(journey);
          this.store.remove("issue", `task:${task.id}`);
        } catch (error) {
          const uncertain = error instanceof BitrixError && error.uncertain;
          journey.tasks[index] = { ...task, syncState: uncertain ? "uncertain" : "error", errorMessage: error instanceof AppError ? error.message : "Falha interna de integração. Consulte o suporte." };
          this.save(journey);
          this.issue(`task:${task.id}`, "Atividade requer atenção", journey.tasks[index]?.errorMessage ?? "Falha de integração.", error instanceof BitrixError && error.retryable, journey.sourceItemId ?? undefined);
          throw error;
        }
      }
      if (await this.sourceCancelled(userId, journey, process)) return this.get(id);
      await this.bitrix.call(userId, "crm.item.update", { entityTypeId: process.entityTypeId, id: journey.sourceItemId, fields: { stageId: process.inProgressStageId } });
      return this.save({ ...journey, status: "active" });
    } finally { clearInterval(heartbeat); this.store.release(`journey:${id}`, owner); }
  }
  private async checklist(userId: string, taskId: string) {
    return z.array(checklistSchema).parse(await this.bitrix.call(userId, "task.checklistitem.getlist", { TASKID: Number(taskId) }));
  }
  private async remoteTask(userId: string, taskId: string, select: string[]): Promise<Record<string, unknown>> {
    const response = remoteTaskSchema.safeParse(await this.bitrix.call(userId, "tasks.task.get", { taskId, select }));
    if (!response.success || response.data.task.id !== taskId) throw new AppError("ACCESS_DENIED", "O Bitrix24 não confirmou acesso à atividade solicitada.", 403);
    return response.data.task;
  }
  async refreshTask(userId: string, task: JourneyTask): Promise<JourneyTask> {
    if (!task.bitrixTaskId) return task;
    const remote = await this.remoteTask(userId, task.bitrixTaskId, ["ID", "STATUS", "DEADLINE", "RESPONSIBLE_ID"]);
    const items = await this.checklist(userId, task.bitrixTaskId);
    const checklist = task.checklist.map(item => {
      const found = items.find(entry => entry.ID === item.bitrixId);
      return { ...item, completed: found?.IS_COMPLETE === "Y" || found?.IS_COMPLETE === true };
    });
    const dueAt = typeof remote.deadline === "string" && !Number.isNaN(Date.parse(remote.deadline)) ? new Date(remote.deadline).toISOString() : task.dueAt;
    const assignee = remote.responsibleId !== undefined && text(remote.responsibleId) !== task.assignee?.id ? await this.bitrix.user(userId, text(remote.responsibleId)) : task.assignee;
    return { ...task, assignee, dueAt, status: taskStatus(text(remote.status)), syncState: "synced", checklist, errorMessage: undefined };
  }
  async visible(session: SessionInfo, journey: Journey): Promise<Journey | null> {
    const owner = this.store.get("journey-owner", journey.id, journeyOwnerSchema);
    const manager = session.role === "gestor" && owner?.managerId === session.user.id;
    const employee = journey.employee.id === session.user.id;
    const candidates = journey.tasks.filter(task => session.canManage || (manager && task.visibility !== "hr") || (employee && task.visibility === "employee") || (session.role === "executor" && task.assignee?.id === session.user.id && task.visibility !== "hr"));
    if (!candidates.length) return null;
    if (session.canManage || manager) {
      if (!journey.sourceItemId) {
        if (owner?.userId !== session.user.id) return null;
      } else {
        const process = this.store.get("journey-process", journey.id, z.object({ entityTypeId: z.number() }));
        if (!process) return null;
        try { await this.remoteSource(session.user.id, process.entityTypeId, journey.sourceItemId); }
        catch (error) { if (error instanceof AppError && ["ACCESS_DENIED", "ERROR_NOT_FOUND", "NOT_FOUND"].includes(error.code)) return null; throw error; }
      }
    }
    const tasks: JourneyTask[] = [];
    for (const task of candidates) {
      if (!task.bitrixTaskId) { if (session.canManage && owner?.userId === session.user.id) tasks.push(task); continue; }
      try { await this.remoteTask(session.user.id, task.bitrixTaskId, ["ID"]); tasks.push(task); }
      catch (error) { if (!(error instanceof AppError) || !["ACCESS_DENIED", "ERROR_NOT_FOUND", "NOT_FOUND"].includes(error.code)) throw error; }
    }
    if (!tasks.length) return null;
    return summarizeJourney({ ...journey, tasks, sourceItemId: session.canManage || manager ? journey.sourceItemId : null, sourceUrl: session.canManage || manager ? journey.sourceUrl : null });
  }
  async action(session: SessionInfo, taskId: string, body: unknown): Promise<JourneyTask> {
    const action = taskActionSchema.parse(body);
    let journey = this.store.list("journey", journeySchema).find(item => item.tasks.some(task => task.id === taskId));
    if (!journey) throw new AppError("TASK_NOT_FOUND", "Atividade não encontrada.", 404);
    const journeyId = journey.id, owner = randomUUID();
    if (!this.store.lease(`journey:${journeyId}`, owner, 120000)) throw new AppError("JOURNEY_BUSY", "Jornada está em atualização. Tente novamente.", 409);
    const heartbeat = setInterval(() => this.store.lease(`journey:${journeyId}`, owner, 120000), 30000);
    try {
    journey = this.get(journeyId);
    if (journey.status === "completed" || journey.status === "cancelled") throw new AppError("JOURNEY_CLOSED", "A jornada está encerrada.", 409);
    const automationUserId = this.auth.settings().automationUserId;
    if (!automationUserId) throw new AppError("AUTOMATION_REQUIRED", "Autorize a conta de automação para verificar a movimentação.", 409);
    if (await this.sourceCancelled(automationUserId, journey, this.process(journeyId))) throw new AppError("JOURNEY_CLOSED", "A movimentação foi cancelada no Bitrix24.", 409);
    const visible = await this.visible(session, journey), task = visible?.tasks.find(item => item.id === taskId);
    if (!task?.bitrixTaskId) throw new AppError("TASK_UNAVAILABLE", "Atividade não disponível para esta conta.", 403);
    if (action.action === "check" || action.action === "uncheck") {
      const item = task.checklist.find(item => item.id === action.checklistId);
      if (!item?.bitrixId) throw new AppError("CHECKLIST_NOT_FOUND", "Item de checklist não encontrado.", 404);
      await this.bitrix.call(session.user.id, action.action === "check" ? "task.checklistitem.complete" : "task.checklistitem.renew", { TASKID: Number(task.bitrixTaskId), ITEMID: Number(item.bitrixId) });
    } else {
      const method = action.action === "start" ? "tasks.task.start" : action.action === "complete" ? "tasks.task.complete" : "tasks.task.renew";
      if (action.action === "complete") {
        const latest = await this.refreshTask(session.user.id, task);
        if (latest.checklist.some(item => item.required && !item.completed)) throw new AppError("CHECKLIST_INCOMPLETE", "Conclua o checklist obrigatório antes de finalizar.", 409);
      }
      await this.bitrix.call(session.user.id, method, { taskId: task.bitrixTaskId });
    }
    const latest = await this.refreshTask(session.user.id, task);
    journey.tasks = journey.tasks.map(item => item.id === taskId ? latest : item); this.save(journey);
    this.audit(`task.${action.action}`, `Atividade ${task.title} atualizada no Bitrix24.`, session.user.name, journey.id);
    return latest;
    } finally { clearInterval(heartbeat); this.store.release(`journey:${journeyId}`, owner); }
  }
  async complete(session: SessionInfo, id: string): Promise<Journey> {
    this.auth.requireManage(session);
    const owner = randomUUID();
    if (!this.store.lease(`journey:${id}`, owner, 120000)) throw new AppError("JOURNEY_BUSY", "Jornada está em atualização. Tente novamente.", 409);
    const heartbeat = setInterval(() => this.store.lease(`journey:${id}`, owner, 120000), 30000);
    try {
      const journey = this.get(id);
      if (journey.status === "cancelled") throw new AppError("JOURNEY_CLOSED", "A jornada está encerrada.", 409);
      if (await this.sourceCancelled(session.user.id, journey, this.process(id))) throw new AppError("JOURNEY_CLOSED", "A movimentação foi cancelada no Bitrix24.", 409);
      const visible = await this.visible(session, journey);
      if (!visible || visible.tasks.length !== journey.tasks.length) throw new AppError("JOURNEY_FORBIDDEN", "Esta conta precisa ter acesso a todas as atividades para concluir a jornada.", 403);
      if (journey.status === "completed") return journey;
      if (journey.status !== "active") throw new AppError("JOURNEY_NOT_ACTIVE", "A jornada ainda não está pronta para conclusão.", 409);
      journey.tasks = await Promise.all(journey.tasks.map(task => this.refreshTask(session.user.id, task)));
      this.save(journey);
      if (!canCompleteJourney(journey)) throw new AppError("JOURNEY_INCOMPLETE", "Há atividades obrigatórias, checklists ou aprovações pendentes.", 409);
      const process = this.store.get("journey-process", id, z.object({ entityTypeId: z.number(), completedStageId: z.string() }));
      if (!process || !journey.sourceItemId) throw new AppError("PROCESS_REQUIRED", "Movimentação CRM não vinculada.", 409);
      await this.bitrix.call(session.user.id, "crm.item.update", { entityTypeId: process.entityTypeId, id: journey.sourceItemId, fields: { stageId: process.completedStageId } });
      const completed = this.save({ ...journey, status: "completed", completedAt: new Date().toISOString() });
      this.store.remove("issue", `sync:${id}`);
      this.audit("journey.completed", "Jornada concluída após verificação no Bitrix24.", session.user.name, id);
      return completed;
    } finally { clearInterval(heartbeat); this.store.release(`journey:${id}`, owner); }
  }
  alerts(journeys: Journey[]): RadarAlert[] {
    return journeys.filter(journey => journey.status === "active" || journey.status === "creating").flatMap(journey => journey.tasks.filter(task => !taskDone(task) && Date.parse(task.dueAt) < Date.now()).map(task => ({ id: task.id, journeyId: journey.id, taskId: task.id, title: task.title, employeeName: journey.employee.name, reason: task.syncState !== "synced" ? "Integração requer atenção" : task.status === "awaiting_review" ? "Aguardando revisão no Bitrix24" : "Prazo ultrapassado", severity: task.critical ? "critical" : "attention", dueAt: task.dueAt })));
  }
  audits() { return this.store.list("audit", auditSchema); }
  issues() { return this.store.list("issue", issueSchema); }
}
