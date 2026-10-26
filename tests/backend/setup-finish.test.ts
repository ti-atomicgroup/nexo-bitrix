import { afterEach, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../../src/server/store";
import { validateEnvironment } from "../../src/server/security";
import { Auth } from "../../src/server/auth";
import { BitrixClient } from "../../src/server/bitrix";
import { Journeys } from "../../src/server/journeys";
import { Setup } from "../../src/server/setup";
const resources: { store: Store; dir: string }[] = [];
afterEach(() => { for (const resource of resources.splice(0)) { resource.store.close(); rmSync(resource.dir, { recursive: true, force: true }); } });

it("permite concluir sem webhook de eventos nem responsáveis padrão", async () => {
  const dir = mkdtempSync(join(tmpdir(), "nexo-finish-")), store = new Store(join(dir, "nexo.db")); resources.push({ store, dir });
  const env = validateEnvironment({ NEXO_ENCRYPTION_KEY: "ab".repeat(32), NEXO_SETUP_TOKEN: "setup-secret-long-enough", NEXO_APP_URL: "https://nexo.example.com", BITRIX_PORTAL_URL: "https://acme.bitrix24.com" });
  const bitrix = new BitrixClient(store, env, async input => String(input).includes("user.get") ? Response.json({ result: [{ ID: "1", NAME: "RH", ACTIVE: true }] }) : Response.json({ result: true }));
  const auth = new Auth(store, env, bitrix), journeys = new Journeys(store, auth, bitrix), setup = new Setup(store, auth, bitrix, journeys);
  bitrix.configureWebhook(`https://${env.portalDomain}/rest/1/test-secret/`, "1");
  const { session } = await auth.bootstrapLocalAdmin(env.setupToken, "rh@example.com", "Senha-de-teste-segura-2026", "1");
  journeys.saveTemplate(session, { id: "onboarding", name: "Onboarding", description: "", type: "onboarding", stages: [{ id: "day-one", title: "Primeiro dia", activities: [{ id: "welcome", title: "Boas-vindas", description: "", assigneeRole: "rh", offsetDays: 0, required: true, critical: false, visibility: "hr", checklist: [], documents: [] }] }] });
  store.put("settings", "current", { ...auth.settings(), automationUserId: "1", rhProject: { id: "1272", name: "Nexo · RH", url: "https://acme.bitrix24.com/workgroups/group/1272/" }, process: { entityTypeId: 1456, categoryId: 396, employeeField: "employee", dateField: "date", onboardingStageId: "on", offboardingStageId: "off", inProgressStageId: "progress", completedStageId: "done", cancelledStageId: "cancel" } });
  setup.discover = async () => ({ scopes: ["task", "user_brief", "crm", "sonet_group"], missingScopes: [], canProvision: false, methods: [] });
  bitrix.user = async () => ({ id: "1", name: "RH", position: "", department: "", active: true });
  setup.configure = async (_session, input) => { const configured = { ...input as ReturnType<typeof auth.settings>, setupComplete: true }; store.put("settings", "current", configured); return configured; };

  await expect(setup.finish(session)).resolves.toMatchObject({ setupComplete: true });
});
