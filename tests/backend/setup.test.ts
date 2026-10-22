import { afterEach, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { Store } from "../../src/server/store";
import { validateEnvironment } from "../../src/server/security";
import { Auth } from "../../src/server/auth";
import { BitrixClient } from "../../src/server/bitrix";
import { Journeys } from "../../src/server/journeys";
import { Setup } from "../../src/server/setup";
const resources: { store: Store; dir: string }[] = [];
afterEach(() => { for (const resource of resources.splice(0)) { resource.store.close(); rmSync(resource.dir, { recursive: true, force: true }); } });
it("provisiona IDs dinâmicos e usa CRM_<id interno>, preservando categoria zero", async () => {
  const env = validateEnvironment({ NEXO_ENCRYPTION_KEY: "ab".repeat(32), NEXO_SETUP_TOKEN: "setup-secret-long-enough", NEXO_APP_URL: "https://nexo.example.com", BITRIX_PORTAL_URL: "https://acme.bitrix24.com" });
  const dir = mkdtempSync(join(tmpdir(), "nexo-provision-")), store = new Store(join(dir, "nexo.db")); resources.push({ store, dir });
  const types: Record<string, unknown>[] = [], fields: Record<string, unknown>[] = [], stages: Record<string, unknown>[] = [];
  const fieldMetadata: Record<string, unknown> = {};
  const transport: typeof fetch = async (input, init) => {
    if (String(input).includes("oauth.bitrix.info")) return Response.json({ access_token: "good", refresh_token: "rotated-refresh", expires_in: 3600, member_id: "member1", user_id: "1" });
    const method = String(input).split("/rest/")[1]?.replace(".json", ""), body = z.record(z.string(), z.unknown()).parse(JSON.parse(String(init?.body)));
    if (method === "user.current") return Response.json({ result: { ID: "1", NAME: "Admin", ACTIVE: true } });
    if (method === "user.admin") return Response.json({ result: true });
    if (method === "app.info") return Response.json({ result: { ID: "7", CODE: "local.nexo" } });
    if (method === "user.get") return Response.json({ result: [{ ID: String(body.ID), NAME: "Admin", ACTIVE: true }] });
    if (method === "scope") return Response.json({ result: ["task", "user_brief", "crm", "userfieldconfig"] });
    if (method === "methods") return Response.json({ result: ["crm.type.add", "userfieldconfig.add", "event.bind", "tasks.task.add", "task.checklistitem.add"] });
    if (method === "crm.type.list") return Response.json({ result: { types } });
    if (method === "crm.type.add") { const entry = { ...z.record(z.string(), z.unknown()).parse(body.fields), id: 23, entityTypeId: 1098 }; types.push(entry); return Response.json({ result: { type: entry } }); }
    if (method === "crm.type.get") return Response.json({ result: { type: types[0] } });
    if (method === "crm.category.list") return Response.json({ result: { categories: [{ id: 0, name: "Geral", isDefault: "Y" }] } });
    if (method === "userfieldconfig.list") return Response.json({ result: { fields } });
    if (method === "userfieldconfig.add") {
      expect(body.moduleId).toBe("crm");
      const field = z.record(z.string(), z.unknown()).parse(body.field);
      expect(field.entityId).toBe("CRM_23");
      const id = fields.length + 1; fields.push({ ...field, id });
      const name = field.userTypeId === "employee" ? "ufCrm23NexoEmployee" : "ufCrm23NexoDate";
      fieldMetadata[name] = { upperName: field.fieldName, type: field.userTypeId, title: name };
      return Response.json({ result: { field: { ...field, id } } });
    }
    if (method === "crm.item.fields") return Response.json({ result: { fields: fieldMetadata } });
    if (method === "crm.status.list") return Response.json({ result: stages });
    if (method === "crm.status.add") { const stage = z.record(z.string(), z.unknown()).parse(body.fields); expect(stage.ENTITY_ID).toBe("DYNAMIC_1098_STAGE_0"); stages.push({ ...stage, ID: stages.length + 1 }); return Response.json({ result: stages.length }); }
    throw new Error(`Unexpected ${method}`);
  };
  const bitrix = new BitrixClient(store, env, transport), auth = new Auth(store, env, bitrix), journeys = new Journeys(store, auth, bitrix), setup = new Setup(store, auth, bitrix, journeys);
  const boot = await auth.launch({ DOMAIN: env.portalDomain, AUTH_ID: "good", REFRESH_ID: "refresh", APPLICATION_TOKEN: "application", member_id: "member1", AUTH_EXPIRES: "3600" });
  const { session } = await auth.bootstrap(boot.token, env.setupToken, "local.nexo", "secret");
  const mapping = await setup.provision(session);
  expect(mapping).toMatchObject({ entityTypeId: 1098, categoryId: 0, employeeField: "ufCrm23NexoEmployee", dateField: "ufCrm23NexoDate", onboardingStageId: "DT1098_0:NEXO_ONBOARD" });
  expect(await setup.discovery(session, "categories", 1098)).toEqual([{ id: "0", name: "Geral", type: "category" }]);
  expect(await setup.provision(session)).toEqual(mapping);
  expect(types).toHaveLength(1); expect(fields).toHaveLength(2); expect(stages).toHaveLength(5);
  journeys.saveTemplate(session, { id: "model-on", name: "Integração", description: "", type: "onboarding", stages: [{ id: "stage-on", title: "Chegada", activities: [{ id: "activity-on", title: "Orientações", description: "", assigneeRole: "colaborador", offsetDays: 0, required: true, critical: false, visibility: "employee", checklist: [], documents: [] }] }] });
  store.put("settings", "current", { ...auth.settings(), setupComplete: true, automationUserId: "1" });
  const configured = await setup.configure(session, auth.settings(), [{ id: "r1", name: "Aprovação", type: "onboarding", templateId: "model-on", stageId: mapping.onboardingStageId, enabled: false }]);
  expect(configured.setupComplete).toBe(true);
});
