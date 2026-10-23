import type { Workspace, SessionInfo } from "../shared/contracts";
import { journeySchema, templateSchema } from "../shared/validation";
import { parseUser } from "./bitrix";
import { automationRunSchema, metadataSchema } from "./models";
import { rulesSchema } from "./validation";
import type { createRuntime } from "./runtime";
export async function workspace(runtime: ReturnType<typeof createRuntime>, session: SessionInfo): Promise<Workspace> {
  const { store, auth, bitrix, journeys } = runtime;
  const visible = [];
  for (const stored of store.list("journey", journeySchema)) { const journey = await journeys.visible(session, stored); if (journey) visible.push(journey); }
  const actualSettings = auth.settings();
  const settings = session.canConfigure ? actualSettings : session.canManage ? { ...actualSettings, roleAssignments: { admin: [], rh: [], gestor: [], executor: [], colaborador: [] } } : { ...actualSettings, automationUserId: null, roleAssignments: { admin: [], rh: [], gestor: [], executor: [], colaborador: [] }, defaultAssignees: {}, process: null };
  const ids = new Set(visible.map(journey => journey.id));
  const sourceIds = new Set(visible.flatMap(journey => journey.sourceItemId ? [journey.sourceItemId] : []));
  const users = session.canManage ? (await bitrix.list(session.user.id, "user.get", { FILTER: { ACTIVE: "Y" } })).map(parseUser).filter(user => user.active) : [...new Map([session.user, ...visible.map(journey => journey.employee), ...visible.flatMap(journey => journey.tasks.flatMap(task => task.assignee ? [task.assignee] : []))].map(user => [user.id, user])).values()];
  const metadata = store.get("sync-meta", "current", metadataSchema);
  return { session, settings, journeys: visible.sort((a, b) => b.createdAt.localeCompare(a.createdAt)), templates: session.canManage ? store.list("template", templateSchema) : [], users, rules: session.canManage ? store.get("rules", "current", rulesSchema) ?? [] : [], automationRuns: session.canConfigure ? store.list("automation-run", automationRunSchema).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)).slice(0, 100) : [], alerts: journeys.alerts(visible), audit: session.canManage ? journeys.audits().filter(entry => !entry.journeyId ? session.canConfigure : ids.has(entry.journeyId)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 100) : [], issues: session.canManage ? journeys.issues().filter(issue => issue.sourceItemId ? sourceIds.has(issue.sourceItemId) : session.canConfigure) : [], lastSyncAt: session.canManage ? metadata?.lastSyncAt ?? null : null, syncRunning: session.canManage ? Boolean(metadata?.syncRunning && metadata.syncStartedAt && metadata.syncStartedAt > Date.now() - 180000) : false };
}
