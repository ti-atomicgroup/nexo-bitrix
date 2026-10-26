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
  const types: Record<string, unknown>[] = [], fields: Record<string, unknown>[] = [], stages: Record<string, unknown>[] = [
    { ID: "90", STATUS_ID: "DT1098_0:SUCCESS", NAME: "Bem sucedido", SORT: "40", SEMANTICS: "S" },
    { ID: "91", STATUS_ID: "DT1098_0:FAIL", NAME: "Mal sucedido", SORT: "50", SEMANTICS: "F" },
  ];
  const groups: Record<string, unknown>[] = [];
  const fieldMetadata: Record<string, unknown> = {};
  const transport: typeof fetch = async (input, init) => {
    if (String(input).includes("oauth.bitrix.info")) return Response.json({ access_token: "good", refresh_token: "rotated-refresh", expires_in: 3600, member_id: "member1", user_id: "1" });
    const method = new URL(String(input)).pathname.split("/").pop()?.replace(".json", ""), body = z.record(z.string(), z.unknown()).parse(JSON.parse(String(init?.body)));
    if (method === "user.current") return Response.json({ result: { ID: "1", NAME: "Admin", ACTIVE: true } });
    if (method === "user.admin") return Response.json({ result: true });
    if (method === "app.info") return Response.json({ result: { ID: "7", CODE: "local.nexo" } });
    if (method === "user.get") return Response.json({ result: [{ ID: String(body.ID), NAME: "Admin", ACTIVE: true }] });
    if (method === "scope") return Response.json({ result: ["task", "user_brief", "crm", "userfieldconfig", "sonet_group"] });
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
    if (method === "sonet_group.get") return Response.json({ result: groups.filter(group => (body.FILTER as Record<string, unknown> | undefined)?.NAME === undefined || group.NAME === (body.FILTER as Record<string, unknown>).NAME) });
    if (method === "sonet_group.create") { const fields = z.record(z.string(), z.unknown()).parse(body); expect(fields.PROJECT).toBe("Y"); expect(fields.VISIBLE).toBe("N"); expect(fields.OPENED).toBe("N"); groups.push({ ...fields, ID: "52" }); return Response.json({ result: 52 }); }
    throw new Error(`Unexpected ${method}`);
  };
  const bitrix = new BitrixClient(store, env, transport), auth = new Auth(store, env, bitrix), journeys = new Journeys(store, auth, bitrix), setup = new Setup(store, auth, bitrix, journeys);
  bitrix.configureWebhook(`https://${env.portalDomain}/rest/1/test-secret/`, "1");
  const { session } = await auth.bootstrapLocalAdmin(env.setupToken, "rh@example.com", "Senha-de-teste-segura-2026", "1");
  const mapping = await setup.provision(session);
  expect(mapping).toMatchObject({ entityTypeId: 1098, categoryId: 0, employeeField: "ufCrm23NexoEmployee", dateField: "ufCrm23NexoDate", onboardingStageId: "DT1098_0:NEXO_ONBOARD", completedStageId: "DT1098_0:SUCCESS", cancelledStageId: "DT1098_0:FAIL" });
  expect(await setup.triggerSources(session)).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "crm_lead", entityTypeId: 1 }), expect.objectContaining({ kind: "crm_deal", entityTypeId: 2 }), expect.objectContaining({ kind: "smart_process", entityTypeId: 1098 })]));
  expect(auth.settings().rhProject).toMatchObject({ id: "52", name: "Nexo · RH" });
  expect(await setup.discovery(session, "categories", 1098)).toEqual([{ id: "0", name: "Geral", type: "category" }]);
  expect(await setup.provision(session)).toEqual(mapping);
  expect(types).toHaveLength(1); expect(fields).toHaveLength(2); expect(stages).toHaveLength(5); expect(groups).toHaveLength(1);
  journeys.saveTemplate(session, { id: "model-on", name: "Integração", description: "", type: "onboarding", stages: [{ id: "stage-on", title: "Chegada", activities: [{ id: "activity-on", title: "Orientações", description: "", assigneeRole: "colaborador", offsetDays: 0, required: true, critical: false, visibility: "employee", checklist: [], documents: [] }] }] });
  store.put("settings", "current", { ...auth.settings(), setupComplete: true, automationUserId: "1" });
  const configured = await setup.configure(session, auth.settings(), [{ id: "r1", name: "Aprovação", type: "onboarding", templateId: "model-on", stageId: mapping.onboardingStageId, enabled: false }]);
  expect(configured.setupComplete).toBe(true);
  const sourceRule = { id: "deal-rule", name: "Contratação no funil", type: "onboarding" as const, templateId: "model-on", stageId: "C2:WON", enabled: true, source: { kind: "crm_deal" as const, entityTypeId: 2, categoryId: 0, stageId: "C2:WON" }, fieldMapping: { nameField: "title", dateField: "startDate", bitrixUserField: null, positionField: null, departmentField: null } };
  bitrix.discoverTriggerSources = async () => [{ kind: "crm_deal", entityTypeId: 2, name: "Negócios", categories: [{ id: "0", name: "Vendas", stages: [{ id: "C2:WON", name: "Contratado" }] }], fields: [{ id: "title", name: "Nome", type: "string" }, { id: "startDate", name: "Data de início", type: "date" }] }];
  await setup.configure(session, auth.settings(), [sourceRule]);
  expect(store.get("rules", "current", z.array(z.object({ id: z.string() })))?.[0]?.id).toBe("deal-rule");
});
