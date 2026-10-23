import { z } from "zod";
import type {
  Workspace,
  Journey,
  JourneyTask,
  JourneyTemplate,
  PublicStatus,
  SessionInfo,
  Settings,
  ProcessMapping,
  DiscoveryOption,
  ApprovedTrailSnapshot,
  TrailSuggestion,
  AutomationRule,
  AutomationRun,
  JourneyOrigin,
  JourneyPerson,
  JourneyStageSnapshot,
  StageRelease,
  TriggerFieldMapping,
  TriggerSource,
  TriggerSourceDiscovery,
} from "./contracts";

const role = z.enum(["admin", "rh", "gestor", "executor", "colaborador"]);
const assigneeRole = z.enum(["rh", "gestor", "ti", "colaborador", "outros"]);
const type = z.enum(["onboarding", "offboarding"]);
const user = z.object({
  id: z.string(),
  name: z.string(),
  position: z.string(),
  department: z.string(),
  avatar: z.string().optional(),
  active: z.boolean(),
});
const document = z.object({
  id: z.string(),
  title: z.string(),
  url: z.string(),
});
const checklist = z.object({
  id: z.string(),
  title: z.string(),
  required: z.boolean(),
});
export const stageReleaseSchema: z.ZodType<StageRelease> = z.object({
  mode: z.enum(["immediate", "date", "previous_stage_completed"]),
  offsetDays: z.number().int().min(-365).max(365).default(0),
  offsetUnit: z.enum(["calendar_days", "business_days"]).default("calendar_days"),
});
const triggerSourceSchema: z.ZodType<TriggerSource> = z.object({
  kind: z.enum(["crm_lead", "crm_deal", "smart_process"]),
  entityTypeId: z.number().int().positive(),
  categoryId: z.number().int().nonnegative().nullable(),
  stageId: z.string().trim().min(1).max(100),
});
const triggerFieldMappingSchema: z.ZodType<TriggerFieldMapping> = z.object({
  nameField: z.string().trim().min(1).max(120),
  dateField: z.string().trim().min(1).max(120),
  bitrixUserField: z.string().trim().max(120).nullable(),
  positionField: z.string().trim().max(120).nullable(),
  departmentField: z.string().trim().max(120).nullable(),
});
export const automationRuleSchema: z.ZodType<AutomationRule> = z.object({
  id: z.string(),
  name: z.string(),
  type,
  templateId: z.string(),
  stageId: z.string(),
  source: triggerSourceSchema.nullable().default(null),
  fieldMapping: triggerFieldMappingSchema.nullable().default(null),
  enabled: z.boolean(),
});
const journeyPersonSchema: z.ZodType<JourneyPerson> = z.object({
  bitrixUserId: z.string().nullable(),
  name: z.string(),
  position: z.string(),
  department: z.string(),
  active: z.boolean(),
});
const journeyOriginSchema: z.ZodType<JourneyOrigin> = z.object({
  entityTypeId: z.number().int().positive(),
  itemId: z.number().int().positive(),
  categoryId: z.number().int().nonnegative().nullable(),
  url: z.string(),
});
const journeyStageSnapshotSchema: z.ZodType<JourneyStageSnapshot> = z.object({
  id: z.string(),
  title: z.string(),
  order: z.number().int().nonnegative(),
  release: stageReleaseSchema,
  state: z.enum(["waiting", "released", "completed"]),
  releasedAt: z.string().nullable(),
});
const activity = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  assigneeRole,
  offsetDays: z.number(),
  offsetUnit: z.enum(["calendar_days", "business_days"]).optional(),
  required: z.boolean(),
  critical: z.boolean(),
  visibility: z.enum(["team", "employee", "hr"]),
  checklist: z.array(checklist),
  documents: z.array(document),
  competencies: z.array(z.string().trim().min(1).max(100)).max(40).default([]),
});
const trailCompetency = z.object({ name: z.string().trim().min(1).max(100), importance: z.enum(["essential", "important", "additional"]), activityIds: z.array(z.string()).max(100) });
const trailActivityRecommendation = z.object({ activityId: z.string(), stageId: z.string(), order: z.number().int().nonnegative().max(1000), offsetDays: z.number().int().min(-365).max(365), offsetUnit: z.enum(["calendar_days", "business_days"]).optional(), assigneeRole, reason: z.string().trim().min(1).max(300) });
export const trailSuggestionSchema: z.ZodType<TrailSuggestion> = z.object({ templateId: z.string(), templateVersion: z.number().int().positive(), profile: z.string().trim().min(1).max(100), competencies: z.array(trailCompetency).max(40), gaps: z.array(z.string().trim().min(1).max(100)).max(40), activities: z.array(trailActivityRecommendation).min(1).max(100) });
export const approvedTrailSchema: z.ZodType<ApprovedTrailSnapshot> = z.object({ templateId: z.string(), templateVersion: z.number().int().positive(), profile: z.string().trim().min(1).max(100), competencies: z.array(trailCompetency).max(40), gaps: z.array(z.string().trim().min(1).max(100)).max(40), activities: z.array(trailActivityRecommendation).min(1).max(100), source: z.literal("ai"), approvedAt: z.string() });
export const templateSchema: z.ZodType<JourneyTemplate> = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  type,
  profile: z.string().trim().default("Geral"),
  version: z.number(),
  stages: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      release: stageReleaseSchema.default({ mode: "immediate", offsetDays: 0, offsetUnit: "calendar_days" }),
      activities: z.array(activity),
    }),
  ),
  updatedAt: z.string(),
});
export const taskSchema: z.ZodType<JourneyTask> = z.object({
  id: z.string(),
  journeyId: z.string(),
  title: z.string(),
  description: z.string(),
  stageTitle: z.string(),
  stageId: z.string().default("legacy"),
  stageOrder: z.number(),
  releaseState: z.enum(["waiting", "released"]).default("released"),
  assigneeRole,
  assignee: user.nullable(),
  dueAt: z.string(),
  required: z.boolean(),
  critical: z.boolean(),
  visibility: z.enum(["team", "employee", "hr"]),
  bitrixTaskId: z.string().nullable(),
  bitrixUrl: z.string().nullable(),
  bitrixStageId: z.string().nullable().default(null),
  bitrixStageTitle: z.string().nullable().default(null),
  remoteDeleted: z.boolean().default(false),
  status: z.enum([
    "pending",
    "in_progress",
    "awaiting_review",
    "completed",
    "deferred",
  ]),
  syncState: z.enum(["queued", "syncing", "synced", "error", "uncertain"]),
  checklist: z.array(
    checklist.extend({
      completed: z.boolean(),
      bitrixId: z.string().optional(),
    }),
  ),
  documents: z.array(document),
  errorMessage: z.string().optional(),
});
const journeyBaseSchema = z.object({
  id: z.string(),
  type,
  employee: user,
  person: journeyPersonSchema.optional(),
  origin: journeyOriginSchema.nullable().optional(),
  stages: z.array(journeyStageSnapshotSchema).optional(),
  templateId: z.string(),
  templateName: z.string(),
  templateVersion: z.number(),
  templateProfile: z.string().default("Geral"),
  approvedTrail: approvedTrailSchema.nullable().default(null),
  referenceDate: z.string(),
  status: z.enum(["creating", "active", "paused", "completed", "cancelled"]),
  source: z.enum(["manual", "approval", "trigger"]),
  sourceItemId: z.number().nullable(),
  sourceUrl: z.string().nullable(),
  createdAt: z.string(),
  completedAt: z.string().nullable(),
  progress: z.number(),
  taskCount: z.number(),
  completedCount: z.number(),
  radar: z.enum(["ok", "attention", "critical", "unknown"]),
  tasks: z.array(taskSchema),
});
export const journeySchema: z.ZodType<Journey> = journeyBaseSchema.transform((value) => ({
  ...value,
  person: value.person ?? { bitrixUserId: value.employee.id, name: value.employee.name, position: value.employee.position, department: value.employee.department, active: value.employee.active },
  origin: value.origin ?? null,
  stages: value.stages ?? [{ id: "legacy", title: "Jornada existente", order: 0, release: { mode: "immediate", offsetDays: 0, offsetUnit: "calendar_days" }, state: "released", releasedAt: value.createdAt }],
}));
export const processSchema: z.ZodType<ProcessMapping> = z.object({
  entityTypeId: z.number(),
  categoryId: z.number(),
  employeeField: z.string(),
  dateField: z.string(),
  onboardingStageId: z.string(),
  offboardingStageId: z.string(),
  inProgressStageId: z.string(),
  completedStageId: z.string(),
  cancelledStageId: z.string(),
});
export const settingsSchema: z.ZodType<Settings> = z.object({
  companyName: z.string(),
  timezone: z.string(),
  portalDomain: z.string(),
  applicationClientId: z.string(),
  automationUserId: z.string().nullable(),
  roleAssignments: z.object({
    admin: z.array(z.string()),
    rh: z.array(z.string()),
    gestor: z.array(z.string()),
    executor: z.array(z.string()),
    colaborador: z.array(z.string()),
  }),
  defaultAssignees: z.partialRecord(assigneeRole, z.string()),
  process: processSchema.nullable(),
  rhProject: z.object({ id: z.string(), name: z.string(), url: z.string() }).nullable().default(null),
  setupComplete: z.boolean(),
});
export const sessionSchema: z.ZodType<SessionInfo> = z.object({
  user,
  role,
  portalDomain: z.string(),
  memberId: z.string(),
  expiresAt: z.string(),
  canManage: z.boolean(),
  canConfigure: z.boolean(),
});
export const statusSchema: z.ZodType<PublicStatus> = z.object({
  installed: z.boolean(),
  configured: z.boolean(),
  portalDomain: z.string().nullable(),
  appUrl: z.string(),
  missingEnvironment: z.array(z.string()),
  version: z.string(),
  webhookConnected: z.boolean().optional(),
  firstAdminCreated: z.boolean().optional(),
  outgoingWebhookConfigured: z.boolean().optional(),
  aiConfigured: z.boolean().optional(),
});
export const discoverySchema: z.ZodType<DiscoveryOption[]> = z.array(
  z.object({ id: z.string(), name: z.string(), type: z.string().optional() }),
);
export const triggerSourceDiscoverySchema: z.ZodType<TriggerSourceDiscovery[]> = z.array(z.object({
  kind: z.enum(["crm_lead", "crm_deal", "smart_process"]),
  entityTypeId: z.number().int().positive(),
  name: z.string(),
  categories: z.array(z.object({ id: z.string().nullable(), name: z.string(), stages: z.array(z.object({ id: z.string(), name: z.string(), type: z.string().optional() })) })),
  fields: z.array(z.object({ id: z.string(), name: z.string(), type: z.string().optional() })),
}));
export const workspaceSchema: z.ZodType<Workspace> = z.object({
  session: sessionSchema,
  settings: settingsSchema,
  journeys: z.array(journeySchema),
  templates: z.array(templateSchema),
  users: z.array(user),
  rules: z.array(automationRuleSchema),
  automationRuns: z.array(z.object({ ruleId: z.string(), sourceKey: z.string(), outcome: z.enum(["started", "pending_data", "ignored", "failed"]), message: z.string(), journeyId: z.string().nullable(), occurredAt: z.string() }) satisfies z.ZodType<AutomationRun>).default([]),
  alerts: z.array(
    z.object({
      id: z.string(),
      journeyId: z.string(),
      taskId: z.string(),
      title: z.string(),
      employeeName: z.string(),
      reason: z.string(),
      severity: z.enum(["attention", "critical"]),
      dueAt: z.string(),
    }),
  ),
  audit: z.array(
    z.object({
      id: z.string(),
      action: z.string(),
      message: z.string(),
      actorName: z.string(),
      createdAt: z.string(),
      journeyId: z.string().optional(),
    }),
  ),
  issues: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      message: z.string(),
      createdAt: z.string(),
      sourceItemId: z.number().optional(),
      retryable: z.boolean(),
    }),
  ),
  lastSyncAt: z.string().nullable(),
  syncRunning: z.boolean(),
});
