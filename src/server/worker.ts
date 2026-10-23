import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { SessionInfo } from "../shared/contracts";
import { journeySchema } from "../shared/validation";
import { Auth } from "./auth";
import { BitrixClient } from "./bitrix";
import { AppError, BitrixError } from "./errors";
import { eventJobSchema, type EventJob } from "./events";
import { Journeys } from "./journeys";
import { integer, metadataSchema, record, text, webhookConfigurationSchema } from "./models";
import { Store } from "./store";
import { rulesSchema } from "./validation";
export class Worker {
  private readonly owner = randomUUID();
  constructor(readonly store: Store, readonly auth: Auth, readonly bitrix: BitrixClient, readonly journeys: Journeys) {}
  async processEvent(job: EventJob) {
    const settings = this.auth.settings();
    if (!settings.setupComplete || !settings.automationUserId) throw new AppError("AUTOMATION_REQUIRED", "Conclua a instalação e autorize a automação.", 409);
    if (job.event.startsWith("ONTASK")) {
      if (job.taskId) await this.journeys.refreshByBitrixTaskId(job.taskId, job.event === "ONTASKDELETE");
      return;
    }
    if (!job.event.startsWith("ONCRMDYNAMIC")) { this.store.enqueue(`sync:event:${Date.now()}`, "sync", {}); return; }
    const process = settings.process;
    if (!process || job.entityTypeId !== process.entityTypeId || !job.itemId) return;
    const userId = settings.automationUserId, item = await this.journeys.remoteSource(userId, process.entityTypeId, job.itemId);
    if (integer(item.categoryId) !== process.categoryId) return;
    const existing = this.journeys.sourceJourney(process.entityTypeId, job.itemId, item.xmlId);
    if (item.stageId === process.cancelledStageId) { if (existing) await this.journeys.cancel(existing.id); return; }
    if (existing) return;
    const rule = (this.store.get("rules", "current", rulesSchema) ?? []).find(rule => rule.enabled && rule.stageId === item.stageId);
    if (!rule) return;
    const employeeValue = item[process.employeeField];
    const employeeId = text(Array.isArray(employeeValue) ? employeeValue[0] : employeeValue);
    const referenceDate = text(item[process.dateField]).slice(0, 10);
    const user = await this.bitrix.user(userId, userId);
    const admin = settings.roleAssignments.admin.includes(userId), hr = settings.roleAssignments.rh.includes(userId);
    if (!admin && !hr) throw new AppError("AUTOMATION_ROLE", "A conta de automação deve ser RH ou administrador autorizado.", 403);
    const session: SessionInfo = { user, role: admin ? "admin" : "rh", portalDomain: this.auth.env.portalDomain, memberId: this.auth.env.portalDomain, expiresAt: new Date(Date.now() + 60000).toISOString(), canManage: true, canConfigure: false };
    await this.journeys.create(session, { requestId: `approval-${process.entityTypeId}-${job.itemId}`, type: rule.type, templateId: rule.templateId, employeeId, referenceDate, assignees: {} }, { source: `approval:${this.auth.env.portalDomain}:${process.entityTypeId}:${job.itemId}`, itemId: job.itemId });
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
    if (settings.process) {
      const rules = (this.store.get("rules", "current", rulesSchema) ?? []).filter(rule => rule.enabled);
      for (const rule of rules) {
        const items = await this.bitrix.list(userId, "crm.item.list", { entityTypeId: settings.process.entityTypeId, filter: { categoryId: settings.process.categoryId, stageId: rule.stageId }, select: ["id"] }, "items");
        for (const value of items) {
          const itemId = integer(record(value).id), issueId = `approval:${settings.process.entityTypeId}:${itemId}`;
          try {
            await this.processEvent({ event: "ONCRMDYNAMICITEMUPDATE", entityTypeId: settings.process.entityTypeId, itemId });
            this.store.remove("issue", issueId);
          } catch (error) {
            if (this.globalError(error) || (!(error instanceof AppError) && !(error instanceof z.ZodError))) throw error;
            hasErrors = true;
            this.journeys.issue(issueId, `Movimentação ${itemId} requer correção`, error instanceof AppError ? error.message : "Revise colaborador, data e responsáveis da movimentação.", false, itemId);
          }
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
