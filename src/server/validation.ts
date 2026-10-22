import { z } from "zod";
import { realDate } from "./domain";
const id = z.string().trim().min(1).max(120).regex(/^[\w.-]+$/);
export const userId = z.string().regex(/^[1-9]\d{0,15}$/);
const title = z.string().trim().min(1).max(200);
const description = z.string().max(20000);
const assignees = z.object({ rh: userId.optional(), gestor: userId.optional(), ti: userId.optional(), colaborador: userId.optional(), outros: userId.optional() });
const stageId = z.string().min(1).max(100).regex(/^[\w:.-]+$/);
export const processSchema = z.object({ entityTypeId: z.number().int().positive(), categoryId: z.number().int().nonnegative(), employeeField: id, dateField: id, onboardingStageId: stageId, offboardingStageId: stageId, inProgressStageId: stageId, completedStageId: stageId, cancelledStageId: stageId });
const activity = z.object({ id, title, description, assigneeRole: z.enum(["rh", "gestor", "ti", "colaborador", "outros"]), offsetDays: z.number().int().min(-365).max(365), required: z.boolean(), critical: z.boolean(), visibility: z.enum(["team", "employee", "hr"]), checklist: z.array(z.object({ id, title, required: z.boolean() })).max(100), documents: z.array(z.object({ id, title, url: z.url().max(2048).refine(value => { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password; }, "Documentos devem usar HTTPS.") })).max(30) });
export const templateSchema = z.object({ id, name: title, description, type: z.enum(["onboarding", "offboarding"]), version: z.number().int().positive().optional(), updatedAt: z.string().optional(), stages: z.array(z.object({ id, title, activities: z.array(activity).max(100) })).min(1).max(30) }).superRefine((value, context) => {
  const ids = value.stages.flatMap(stage => [stage.id, ...stage.activities.flatMap(a => [a.id, ...a.checklist.map(c => c.id)])]);
  if (new Set(ids).size !== ids.length) context.addIssue({ code: "custom", message: "IDs repetidos no modelo." });
  if (!value.stages.some(stage => stage.activities.length)) context.addIssue({ code: "custom", message: "Inclua ao menos uma atividade." });
});
export const createJourneySchema = z.object({ requestId: z.string().min(8).max(120).regex(/^[\w-]+$/), type: z.enum(["onboarding", "offboarding"]), templateId: id, employeeId: userId, referenceDate: z.string().refine(realDate, "Data inválida."), assignees });
export const settingsSchema = z.object({ companyName: title, timezone: z.string().refine(value => { try { new Intl.DateTimeFormat("pt-BR", { timeZone: value }); return true; } catch { return false; } }), portalDomain: z.string().max(200), applicationClientId: z.string().max(200), automationUserId: userId.nullable(), roleAssignments: z.object({ admin: z.array(userId).max(200), rh: z.array(userId).max(200), gestor: z.array(userId).max(200), executor: z.array(userId).max(10000), colaborador: z.array(userId).max(10000) }), defaultAssignees: assignees, process: processSchema.nullable(), setupComplete: z.boolean() });
export const rulesSchema = z.array(z.object({ id, name: title, type: z.enum(["onboarding", "offboarding"]), templateId: id, stageId: z.string().min(1).max(100), enabled: z.boolean() })).max(50);
export const taskActionSchema = z.object({ action: z.enum(["start", "complete", "reopen", "check", "uncheck"]), checklistId: id.optional() });
