import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { SessionInfo } from "../shared/contracts";
import { journeySchema } from "../shared/validation";
import type { AutomationRule, Journey, TriggerSource } from "../shared/contracts";
import { Auth } from "./auth";
import { BitrixClient } from "./bitrix";
import { AppError, BitrixError } from "./errors";
import { eventJobSchema, type EventJob } from "./events";
import { Journeys } from "./journeys";
import { integer, metadataSchema, record, text, webhookConfigurationSchema } from "./models";
import { Store } from "./store";
import { rulesSchema } from "./validation";
import { realDate } from "./domain";
export class Worker {
  private readonly owner = randomUUID();
  constructor(readonly store: Store, readonly auth: Auth, readonly bitrix: BitrixClient, readonly journeys: Journeys) {}
  async processEvent(job: EventJob) {
    const settings = this.auth.settings();
    if (!settings.setupComplete || !settings.automationUserId) throw new AppError("AUTOMATION_REQUIRED", "Conclua a instalação e autorize a automação.", 409);
    if (job.event.startsWith("ONTASK")) {
      if (job.taskId) {
        await this.journeys.refreshByBitrixTaskId(job.taskId, job.event === "ONTASKDELETE");
        const journey = this.store.list("journey", journeySchema).find(item => item.tasks.some(task => task.bitrixTaskId === job.taskId));
        if (journey && job.event !== "ONTASKDELETE") await this.journeys.runJourney(journey.id);
      }
      return;
    }
    if (job.sourceKind || job.event.startsWith("ONCRMDYNAMIC")) await this.processSourceEvent(job);
    else this.store.enqueue(`sync:event:${Date.now()}`, "sync", {});
  }
  async processSourceEvent(job: EventJob): Promise<Journey | null> {
    const settings = this.auth.settings(), serviceUserId = settings.automationUserId;
    if (!settings.setupComplete || !serviceUserId) throw new AppError("AUTOMATION_REQUIRED", "Conclua a instalação e autorize a automação.", 409);
    if (!job.itemId) throw new AppError("SOURCE_ID_REQUIRED", "O evento não contém o ID do registro de origem.", 400);
    const sourceKind = job.sourceKind ?? "smart_process";
    const rules = (this.store.get("rules", "current", rulesSchema) ?? []).filter(rule => rule.enabled);
    const legacyProcess = settings.process;
    if (sourceKind === "smart_process" && legacyProcess && (job.entityTypeId === undefined || job.entityTypeId === legacyProcess.entityTypeId)) {
      const source: TriggerSource = { kind: "smart_process", entityTypeId: legacyProcess.entityTypeId, categoryId: legacyProcess.categoryId, stageId: legacyProcess.cancelledStageId };
      const item = await this.bitrix.getTriggerSource(serviceUserId, source, job.itemId);
      const prior = this.journeys.sourceJourney(source.entityTypeId, job.itemId, item.xmlId);
      if (text(item.stageId ?? item.statusId) === legacyProcess.cancelledStageId && prior) return this.journeys.cancel(prior.id);
    }
    const candidates = rules.flatMap(rule => {
      if (rule.source) return rule.source.kind === sourceKind && (job.entityTypeId === undefined || job.entityTypeId === rule.source.entityTypeId) ? [{ rule, source: rule.source, mapping: rule.fieldMapping, legacy: false }] : [];
      if (sourceKind !== "smart_process" || !legacyProcess || (job.entityTypeId !== undefined && job.entityTypeId !== legacyProcess.entityTypeId)) return [];
      return [{ rule, source: { kind: "smart_process" as const, entityTypeId: legacyProcess.entityTypeId, categoryId: legacyProcess.categoryId, stageId: rule.stageId }, mapping: { nameField: legacyProcess.employeeField, dateField: legacyProcess.dateField, bitrixUserField: legacyProcess.employeeField, positionField: null, departmentField: null }, legacy: true }];
    });
    for (const candidate of candidates) {
      const { rule, source, mapping, legacy } = candidate;
      let item: Record<string, unknown>;
      try { item = await this.bitrix.getTriggerSource(serviceUserId, source, job.itemId); }
      catch (error) {
        if (error instanceof AppError && error.code === "SOURCE_CATEGORY") { this.recordAutomationRun(rule, this.journeys.originKey(source.entityTypeId, job.itemId), "ignored", "O registro pertence a outro funil.", null); continue; }
        throw error;
      }
      const categoryId = item.categoryId === undefined || item.categoryId === null ? null : Number(item.categoryId);
      const currentStageId = text(item.stageId ?? item.statusId);
      const sourceKey = this.journeys.originKey(source.entityTypeId, job.itemId);
      const directMovement = source.kind === "smart_process" && legacyProcess?.entityTypeId === source.entityTypeId && legacyProcess.categoryId === source.categoryId;
      const prior = this.journeys.findByOrigin(source.entityTypeId, job.itemId) ?? (directMovement ? this.journeys.sourceJourney(source.entityTypeId, job.itemId, item.xmlId) : null);
      if (directMovement && currentStageId === legacyProcess?.cancelledStageId && prior) { await this.journeys.cancel(prior.id); return prior; }
      if (categoryId !== source.categoryId || currentStageId !== source.stageId) { this.recordAutomationRun(rule, sourceKey, "ignored", "O registro não está na etapa configurada.", prior?.id ?? null); continue; }
      if (prior) { this.recordAutomationRun(rule, sourceKey, "started", "Esta origem já está vinculada a uma jornada.", prior.id); return prior; }
      const fieldMap = mapping ?? { nameField: legacyProcess?.employeeField ?? "", dateField: legacyProcess?.dateField ?? "", bitrixUserField: legacyProcess?.employeeField ?? null, positionField: null, departmentField: null };
      const value = (field: string | null) => field ? item[field] : undefined;
      const asFieldText = (field: string | null) => { const result = value(field); return result === undefined || result === null || result === "" ? "" : text(Array.isArray(result) ? result[0] : result); };
      const date = asFieldText(fieldMap.dateField).slice(0, 10);
      const mappedEmployeeId = asFieldText(fieldMap.bitrixUserField);
      if (!fieldMap.nameField || !fieldMap.dateField || !realDate(date)) {
        const message = "Confira nome, data principal e mapeamento da origem no Bitrix.";
        this.journeys.issue(`trigger:${rule.id}:${sourceKey}`, "Gatilho requer ajuste", message, false, job.itemId);
        this.recordAutomationRun(rule, sourceKey, "pending_data", message, null);
        continue;
      }
      const employeeId = mappedEmployeeId || serviceUserId;
      const employee = await this.bitrix.user(serviceUserId, employeeId);
      if (mappedEmployeeId && !employee.active) {
        const message = "O usuário associado ao registro está inativo no Bitrix.";
        this.journeys.issue(`trigger:${rule.id}:${sourceKey}`, "Gatilho requer ajuste", message, false, job.itemId);
        this.recordAutomationRun(rule, sourceKey, "pending_data", message, null);
        continue;
      }
      const mappedName = asFieldText(fieldMap.nameField), personName = legacy || !mappedName || mappedName === employeeId ? employee.name : mappedName;
      if (!mappedName && !legacy) {
        const message = "Informe o nome da pessoa no registro de origem.";
        this.journeys.issue(`trigger:${rule.id}:${sourceKey}`, "Gatilho requer ajuste", message, false, job.itemId);
        this.recordAutomationRun(rule, sourceKey, "pending_data", message, null);
        continue;
      }
      const originUrl = source.kind === "smart_process" ? `${this.auth.env.portalUrl}/crm/type/${source.entityTypeId}/details/${job.itemId}/` : `${this.auth.env.portalUrl}/crm/${source.kind === "crm_lead" ? "lead" : "deal"}/details/${job.itemId}/`;
      const origin = { entityTypeId: source.entityTypeId, itemId: job.itemId, categoryId, url: originUrl };
      const user = await this.bitrix.user(serviceUserId, serviceUserId);
      const admin = settings.roleAssignments.admin.includes(serviceUserId), hr = settings.roleAssignments.rh.includes(serviceUserId);
      if (!admin && !hr) throw new AppError("AUTOMATION_ROLE", "A conta de automação deve ser RH ou administrador autorizado.", 403);
      const session: SessionInfo = { user, role: admin ? "admin" : "rh", portalDomain: this.auth.env.portalDomain, memberId: this.auth.env.portalDomain, expiresAt: new Date(Date.now() + 60000).toISOString(), canManage: true, canConfigure: false };
      let journey = await this.journeys.create(session, { requestId: `trigger-${source.entityTypeId}-${job.itemId}`, type: rule.type, templateId: rule.templateId, employeeId, referenceDate: date, assignees: {} }, { source: sourceKey, ...(directMovement ? { itemId: job.itemId } : {}), origin: legacy ? null : origin, trigger: !legacy });
      const position = fieldMap.positionField ? asFieldText(fieldMap.positionField) || employee.position : employee.position;
      const department = fieldMap.departmentField ? asFieldText(fieldMap.departmentField) || employee.department : employee.department;
      journey.employee = { ...journey.employee, name: personName, position, department };
      journey.person = { bitrixUserId: mappedEmployeeId || null, name: personName, position, department, active: mappedEmployeeId ? employee.active : true };
      if (!mappedEmployeeId) journey.tasks = journey.tasks.map(task => task.assigneeRole === "colaborador" ? { ...task, assignee: null } : task);
      journey = this.journeys.save(journey);
      this.store.remove("issue", `trigger:${rule.id}:${sourceKey}`);
      this.recordAutomationRun(rule, sourceKey, "started", `Jornada ${rule.type === "onboarding" ? "onboarding" : "offboarding"} iniciada.`, journey.id);
      return journey;
    }
    return null;
  }
  private recordAutomationRun(rule: AutomationRule, sourceKey: string, outcome: "started" | "pending_data" | "ignored" | "failed", message: string, journeyId: string | null) {
    this.store.put("automation-run", `${rule.id}:${sourceKey}`, { ruleId: rule.id, sourceKey, outcome, message, journeyId, occurredAt: new Date().toISOString() });
  }
  async reconcile() {
    const settings = this.auth.settings(), userId = settings.automationUserId;
    if (!settings.setupComplete || !userId) return;
    let hasErrors = false;
    for (const journey of this.store.list("journey", journeySchema)) {
      if (journey.status === "cancelled" || journey.status === "completed") { this.store.remove("issue", `sync:${journey.id}`); continue; }
      try {
        if (journey.status === "creating" || journey.tasks.some(task => task.syncState !== "synced" && !task.remoteDeleted)) await this.journeys.runJourney(journey.id);
        else await this.journeys.reconcileJourney(journey.id, userId);
        this.store.remove("issue", `sync:${journey.id}`);
      } catch (error) {
        if (this.globalError(error)) throw error;
        hasErrors = true;
        this.journeys.issue(`sync:${journey.id}`, "Sincronização pendente", error instanceof AppError ? error.message : "Falha interna de sincronização.", error instanceof BitrixError && error.retryable, journey.sourceItemId ?? undefined);
      }
    }
    const rules = (this.store.get("rules", "current", rulesSchema) ?? []).filter(rule => rule.enabled);
    for (const rule of rules) {
      const source = rule.source ?? (settings.process ? { kind: "smart_process" as const, entityTypeId: settings.process.entityTypeId, categoryId: settings.process.categoryId, stageId: rule.stageId } : null);
      if (!source) continue;
      const filter: Record<string, unknown> = { stageId: source.stageId };
      if (source.categoryId !== null) filter.categoryId = source.categoryId;
      const items = await this.bitrix.list(userId, "crm.item.list", { entityTypeId: source.entityTypeId, filter, select: ["id"] }, "items");
      for (const value of items) {
        const itemId = integer(record(value).id), sourceKey = this.journeys.originKey(source.entityTypeId, itemId), issueId = `trigger:${rule.id}:${sourceKey}`;
        try {
          const journey = await this.processSourceEvent({ event: source.kind === "smart_process" ? "ONCRMDYNAMICITEMUPDATE" : source.kind === "crm_deal" ? "ONCRMDEALUPDATE" : "ONCRMLEADUPDATE", ...(source.kind === "smart_process" ? { entityTypeId: source.entityTypeId } : { sourceKind: source.kind }), itemId });
          if (journey) this.store.remove("issue", issueId);
        } catch (error) {
          if (this.globalError(error) || (!(error instanceof AppError) && !(error instanceof z.ZodError))) throw error;
          hasErrors = true;
          this.journeys.issue(issueId, `Registro ${itemId} requer correção`, error instanceof AppError ? error.message : "Revise os campos e responsáveis configurados para esta origem.", false, itemId);
          this.recordAutomationRun(rule, sourceKey, "failed", error instanceof AppError ? error.message : "Falha ao processar origem.", null);
        }
      }
    }
    if (!hasErrors) this.store.put("sync-meta", "current", { lastSyncAt: new Date().toISOString(), syncRunning: false });
  }
  private globalError(error: unknown): boolean {
    return error instanceof BitrixError && ((error.retryable && !["JOURNEY_BUSY", "CREATE_UNCERTAIN"].includes(error.code)) || ["insufficient_scope", "INVALID_CREDENTIALS", "NO_AUTH_FOUND"].includes(error.code));
  }
  async tick(): Promise<void> {
    if (!this.store.lease("worker", this.owner, 120000)) return;
    const heartbeat = setInterval(() => this.store.lease("worker", this.owner, 120000), 30000);
    const metadata = this.store.get("sync-meta", "current", metadataSchema);
    try {
      if (!this.store.get("webhook", "incoming", webhookConfigurationSchema)) return;
      this.store.put("sync-meta", "current", { lastSyncAt: metadata?.lastSyncAt ?? null, syncRunning: true, syncStartedAt: Date.now() });
      this.store.enqueue(`periodic:${Math.floor(Date.now() / 60000)}`, "sync", {});
      for (const job of this.store.nextJobs()) {
        try {
          const body: unknown = JSON.parse(job.body);
          if (job.kind === "journey") await this.journeys.runJourney(z.object({ journeyId: z.string() }).parse(body).journeyId);
          else if (job.kind === "event") await this.processEvent(eventJobSchema.parse(body));
          else if (job.kind === "sync") await this.reconcile();
          else throw new AppError("JOB_KIND", "Tipo de trabalho desconhecido.", 500);
          this.store.finishJob(job.id);
          this.store.remove("issue", `job:${job.id}`);
        } catch (error) {
          const code = error instanceof AppError ? error.code : "INTERNAL";
          const retryable = error instanceof BitrixError && error.retryable;
          this.store.failJob(job, code, retryable);
          this.journeys.issue(`job:${job.id}`, "Operação pendente", error instanceof AppError ? error.message : "Falha interna. Consulte o suporte.", retryable);
          console.error(JSON.stringify({ event: "worker.job.failed", jobId: job.id, code }));
        }
      }
    } finally {
      clearInterval(heartbeat);
      const current = this.store.get("sync-meta", "current", metadataSchema);
      this.store.put("sync-meta", "current", { lastSyncAt: current?.lastSyncAt ?? null, syncRunning: false });
      this.store.release("worker", this.owner);
    }
  }
}
