import { afterEach, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../../src/server/store";
import { validateEnvironment } from "../../src/server/security";
import { Auth } from "../../src/server/auth";
import { BitrixClient } from "../../src/server/bitrix";
import { Events } from "../../src/server/events";
import { outgoingWebhookSchema } from "../../src/server/models";
const resources: { store: Store; dir: string }[] = [];
afterEach(() => { for (const item of resources.splice(0)) { item.store.close(); rmSync(item.dir, { recursive: true, force: true }); } });
function setup() {
  const env = validateEnvironment({ NEXO_ENCRYPTION_KEY: "ab".repeat(32), NEXO_SETUP_TOKEN: "setup-secret-long-enough", NEXO_APP_URL: "https://nexo.example.com", BITRIX_PORTAL_URL: "https://acme.bitrix24.com" });
  const dir = mkdtempSync(join(tmpdir(), "nexo-events-")), store = new Store(join(dir, "nexo.db")); resources.push({ store, dir });
  const auth = new Auth(store, env, new BitrixClient(store, env, async () => Response.json({ result: {} })));
  return { env, store, events: new Events(store, auth) };
}
it("autentica webhook de saída e enfileira atualização de processo uma única vez", () => {
  const { env, store, events } = setup();
  events.configureOutgoingToken("outgoing-secret-123456789");
  const payload = { event: "ONCRMDYNAMICITEMUPDATE", ts: "123", event_handler_id: "8", auth: { application_token: "outgoing-secret-123456789", domain: env.portalDomain }, data: { FIELDS: { ID: "50", ENTITY_TYPE_ID: "1050" } } };
  expect(events.receive(payload)).toEqual({ queued: true });
  expect(events.receive(payload)).toEqual({ queued: true });
  const jobs = store.nextJobs();
  expect(jobs).toHaveLength(1);
  expect(jobs[0]).toMatchObject({ kind: "event", body: JSON.stringify({ event: "ONCRMDYNAMICITEMUPDATE", itemId: 50, entityTypeId: 1050 }) });
  expect(JSON.stringify(store.get("webhook", "outgoing", outgoingWebhookSchema))).not.toContain("outgoing-secret");
});
it("aceita formato form e rejeita segredo ou portal divergentes", () => {
  const { env, events } = setup();
  events.configureOutgoingToken("outgoing-secret-123456789");
  const form = { event: "ONCRMDYNAMICITEMUPDATE", ts: "123", "auth[application_token]": "outgoing-secret-123456789", "auth[domain]": env.portalDomain, "data[FIELDS][ID]": "51", "data[FIELDS][ENTITY_TYPE_ID]": "1050" };
  expect(events.receive(form)).toEqual({ queued: true });
  expect(() => events.receive({ ...form, "auth[application_token]": "wrong-secret" })).toThrow();
  expect(() => events.receive({ ...form, "auth[domain]": "evil.bitrix24.com" })).toThrow();
});
it("extrai IDs de evento de lead e negócio e mantém a origem do CRM", () => {
  const { env, store, events } = setup();
  events.configureOutgoingToken("outgoing-secret-123456789");
  const auth = { application_token: "outgoing-secret-123456789", domain: env.portalDomain };
  events.receive({ event: "ONCRMDEALUPDATE", ts: "deal-1", auth, data: { FIELDS: { ID: "202" } } });
  events.receive({ event: "ONCRMLEADUPDATE", ts: "lead-1", auth, "data[FIELDS][ID]": "101" });
  const jobs = store.nextJobs().map((job) => JSON.parse(job.body));
  expect(jobs).toEqual(expect.arrayContaining([
    { event: "ONCRMDEALUPDATE", sourceKind: "crm_deal", itemId: 202 },
    { event: "ONCRMLEADUPDATE", sourceKind: "crm_lead", itemId: 101 },
  ]));
  expect(() => events.receive({ event: "ONCRMDEALUPDATE", ts: "missing", auth, data: { FIELDS: {} } })).toThrow();
});
it("extrai ID da tarefa de atualizações e rejeita evento de tarefa sem ID", () => {
  const { env, store, events } = setup();
  events.configureOutgoingToken("outgoing-secret-123456789");
  const auth = { application_token: "outgoing-secret-123456789", domain: env.portalDomain };
  events.receive({ event: "ONTASKUPDATE", ts: "update-1", auth, data: { FIELDS_AFTER: { ID: "321" } } });
  events.receive({ event: "ONTASKUPDATE", ts: "update-1", auth, data: { FIELDS_AFTER: { ID: "321" } } });
  expect(store.nextJobs()).toHaveLength(1);
  expect(JSON.parse(store.nextJobs()[0]?.body ?? "{}")).toEqual({ event: "ONTASKUPDATE", taskId: "321" });
  expect(() => events.receive({ event: "ONTASKDELETE", ts: "delete-1", auth, data: { FIELDS: {} } })).toThrow();
  events.receive({ event: "ONTASKUPDATE", ts: "update-2", auth, "data[FIELDS_AFTER][ID]": "322" });
  expect(store.nextJobs()).toHaveLength(2);
});
