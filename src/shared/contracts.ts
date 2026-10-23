export type JourneyType = "onboarding" | "offboarding";
export type AppRole = "admin" | "rh" | "gestor" | "executor" | "colaborador";
export type AssigneeRole = "rh" | "gestor" | "ti" | "colaborador" | "outros";
export type TaskStatus =
  "pending" | "in_progress" | "awaiting_review" | "completed" | "deferred";
export type SyncState = "queued" | "syncing" | "synced" | "error" | "uncertain";
export type Visibility = "team" | "employee" | "hr";
export interface BitrixUser {
  id: string;
  name: string;
  position: string;
  department: string;
  avatar?: string;
  active: boolean;
}
export interface DocumentLink {
  id: string;
  title: string;
  url: string;
}
export interface ChecklistDefinition {
  id: string;
  title: string;
  required: boolean;
}
export interface ActivityDefinition {
  id: string;
  title: string;
  description: string;
  assigneeRole: AssigneeRole;
  offsetDays: number;
  offsetUnit?: "calendar_days" | "business_days";
  required: boolean;
  critical: boolean;
  visibility: Visibility;
  checklist: ChecklistDefinition[];
  documents: DocumentLink[];
  competencies?: string[];
}
export interface StageDefinition {
  id: string;
  title: string;
  release?: StageRelease;
  activities: ActivityDefinition[];
}
export interface StageRelease {
  mode: "immediate" | "date" | "previous_stage_completed";
  offsetDays: number;
  offsetUnit: "calendar_days" | "business_days";
}
export interface JourneyTemplate {
  id: string;
  name: string;
  description: string;
  type: JourneyType;
  profile: string;
  version: number;
  stages: StageDefinition[];
  updatedAt: string;
}
export interface JourneyTask {
  id: string;
  journeyId: string;
  title: string;
  description: string;
  stageTitle: string;
  stageId: string;
  stageOrder: number;
  releaseState: "waiting" | "released";
  assigneeRole: AssigneeRole;
  assignee: BitrixUser | null;
  dueAt: string;
  required: boolean;
  critical: boolean;
  visibility: Visibility;
  bitrixTaskId: string | null;
  bitrixUrl: string | null;
  bitrixStageId: string | null;
  bitrixStageTitle: string | null;
  remoteDeleted: boolean;
  status: TaskStatus;
  syncState: SyncState;
  checklist: (ChecklistDefinition & {
    completed: boolean;
    bitrixId?: string;
  })[];
  documents: DocumentLink[];
  errorMessage?: string;
}
export interface RadarAlert {
  id: string;
  journeyId: string;
  taskId: string;
  title: string;
  employeeName: string;
  reason: string;
  severity: "attention" | "critical";
  dueAt: string;
}
export interface Journey {
  id: string;
  type: JourneyType;
  employee: BitrixUser;
  person: JourneyPerson;
  origin: JourneyOrigin | null;
  stages: JourneyStageSnapshot[];
  templateId: string;
  templateName: string;
  templateVersion: number;
  templateProfile: string;
  approvedTrail?: ApprovedTrailSnapshot | null;
  referenceDate: string;
  status: "creating" | "active" | "paused" | "completed" | "cancelled";
  source: "manual" | "approval" | "trigger";
  sourceItemId: number | null;
  sourceUrl: string | null;
  createdAt: string;
  completedAt: string | null;
  progress: number;
  taskCount: number;
  completedCount: number;
  radar: "ok" | "attention" | "critical" | "unknown";
  tasks: JourneyTask[];
}
export interface JourneyPerson {
  bitrixUserId: string | null;
  name: string;
  position: string;
  department: string;
  active: boolean;
}
export interface JourneyOrigin {
  entityTypeId: number;
  itemId: number;
  categoryId: number | null;
  url: string;
}
export interface JourneyStageSnapshot {
  id: string;
  title: string;
  order: number;
  release: StageRelease;
  state: "waiting" | "released" | "completed";
  releasedAt: string | null;
}
export interface TrailCompetency {
  name: string;
  importance: "essential" | "important" | "additional";
  activityIds: string[];
}
export interface TrailActivityRecommendation {
  activityId: string;
  stageId: string;
  order: number;
  offsetDays: number;
  offsetUnit?: "calendar_days" | "business_days";
  assigneeRole: AssigneeRole;
  reason: string;
}
export interface TrailSuggestion {
  templateId: string;
  templateVersion: number;
  profile: string;
  competencies: TrailCompetency[];
  gaps: string[];
  activities: TrailActivityRecommendation[];
}
export interface ApprovedTrailSnapshot extends TrailSuggestion {
  source: "ai";
  approvedAt: string;
}
export interface ProcessMapping {
  entityTypeId: number;
  categoryId: number;
  employeeField: string;
  dateField: string;
  onboardingStageId: string;
  offboardingStageId: string;
  inProgressStageId: string;
  completedStageId: string;
  cancelledStageId: string;
}
export interface AutomationRule {
  id: string;
  name: string;
  type: JourneyType;
  templateId: string;
  stageId: string;
  source: TriggerSource | null;
  fieldMapping: TriggerFieldMapping | null;
  enabled: boolean;
}
export interface TriggerSource {
  kind: "crm_lead" | "crm_deal" | "smart_process";
  entityTypeId: number;
  categoryId: number | null;
  stageId: string;
}
export interface TriggerFieldMapping {
  nameField: string;
  dateField: string;
  bitrixUserField: string | null;
  positionField: string | null;
  departmentField: string | null;
}
export interface AutomationRun {
  ruleId: string;
  sourceKey: string;
  outcome: "started" | "pending_data" | "ignored" | "failed";
  message: string;
  journeyId: string | null;
  occurredAt: string;
}
export interface Settings {
  companyName: string;
  timezone: string;
  portalDomain: string;
  applicationClientId: string;
  automationUserId: string | null;
  roleAssignments: Record<AppRole, string[]>;
  defaultAssignees: Partial<Record<AssigneeRole, string>>;
  process: ProcessMapping | null;
  rhProject: { id: string; name: string; url: string } | null;
  setupComplete: boolean;
}
export interface SessionInfo {
  user: BitrixUser;
  role: AppRole;
  portalDomain: string;
  memberId: string;
  expiresAt: string;
  canManage: boolean;
  canConfigure: boolean;
}
export interface AuditEntry {
  id: string;
  action: string;
  message: string;
  actorName: string;
  createdAt: string;
  journeyId?: string;
}
export interface OperationIssue {
  id: string;
  title: string;
  message: string;
  createdAt: string;
  sourceItemId?: number;
  retryable: boolean;
}
export interface Workspace {
  session: SessionInfo;
  settings: Settings;
  journeys: Journey[];
  templates: JourneyTemplate[];
  users: BitrixUser[];
  rules: AutomationRule[];
  automationRuns: AutomationRun[];
  alerts: RadarAlert[];
  audit: AuditEntry[];
  issues: OperationIssue[];
  lastSyncAt: string | null;
  syncRunning: boolean;
}
export interface PublicStatus {
  installed: boolean;
  configured: boolean;
  portalDomain: string | null;
  appUrl: string;
  missingEnvironment: string[];
  version: string;
  webhookConnected?: boolean;
  firstAdminCreated?: boolean;
  outgoingWebhookConfigured?: boolean;
  aiConfigured?: boolean;
}
export interface DiscoveryOption {
  id: string;
  name: string;
  type?: string;
}
export interface TriggerCategoryOption {
  id: string | null;
  name: string;
  stages: DiscoveryOption[];
}
export interface TriggerSourceDiscovery {
  kind: "crm_lead" | "crm_deal" | "smart_process";
  entityTypeId: number;
  name: string;
  categories: TriggerCategoryOption[];
  fields: DiscoveryOption[];
}
export interface CreateJourneyInput {
  requestId: string;
  type: JourneyType;
  templateId: string;
  employeeId: string;
  referenceDate: string;
  assignees: Partial<Record<AssigneeRole, string>>;
  approvedTrail?: TrailSuggestion;
}
export interface ApiError {
  code: string;
  message: string;
}
export type ApiResponse<T> = { data: T } | { error: ApiError };
