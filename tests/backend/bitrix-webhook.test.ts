import { afterEach, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../../src/server/store";
import { validateEnvironment } from "../../src/server/security";
import { BitrixClient } from "../../src/server/bitrix";
const resources: { store: Store; dir: string }[] = [];
afterEach(() => { for (const item of resources.splice(0)) { item.store.close(); rmSync(item.dir, { recursive: true, force: true }); } });
function setup(transport: typeof fetch) {
  const env = validateEnvironment({ NEXO_ENCRYPTION_KEY: "ab".repeat(32), NEXO_SETUP_TOKEN: "setup-secret-long-enough", NEXO_APP_URL: "https://nexo.example.com", BITRIX_PORTAL_URL: "https://acme.bitrix24.com" });
  const dir = mkdtempSync(join(tmpdir(), "nexo-webhook-")), store = new Store(join(dir, "nexo.db")); resources.push({ store, dir });
  return { env, store, client: new BitrixClient(store, env, transport) };
}
it("valida webhook, identifica a conta e guarda a URL cifrada", async () => {
  const calls: string[] = [];
  const { env, store, client } = setup(async (input) => {
    const url = String(input); calls.push(url);
    if (url.endsWith("/user.current.json")) return Response.json({ result: { ID: "42", NAME: "RH Serviço", ACTIVE: true } });
    if (url.endsWith("/scope.json")) return Response.json({ result: ["task", "user_brief", "crm", "userfieldconfig"] });
    throw new Error(`unexpected request ${url}`);
  });
  const result = await client.testWebhook("https://acme.bitrix24.com/rest/42/secret-code/");
  expect(result).toEqual({ userId: "42", userName: "RH Serviço", scopes: ["task", "user_brief", "crm", "userfieldconfig"] });
  client.configureWebhook("https://acme.bitrix24.com/rest/42/secret-code/", result.userId);
  expect(JSON.stringify(store.get("webhook", "incoming", (await import("../../src/server/models")).webhookConfigurationSchema))).not.toContain("secret-code");
  expect(calls).toEqual(["https://acme.bitrix24.com/rest/42/secret-code/user.current.json", "https://acme.bitrix24.com/rest/42/secret-code/scope.json"]);
  expect(env.portalUrl).toBe("https://acme.bitrix24.com");
});
it("fixa o portal do cliente ao conectar e recupera esse portal após reinício", async () => {
  const { store } = setup(async () => Response.json({ result: {} }));
  const config = { NEXO_ENCRYPTION_KEY: "ab".repeat(32), NEXO_SETUP_TOKEN: "setup-secret-long-enough", NEXO_APP_URL: "https://nexo.example.com" };
  const firstEnv = validateEnvironment(config);
  const first = new BitrixClient(store, firstEnv, async () => Response.json({ result: {} }));
  first.configureWebhook("https://cliente.bitrix24.com.br/rest/42/secret-code/", "42");
  expect(firstEnv.portalDomain).toBe("cliente.bitrix24.com.br");
  expect(() => first.configureWebhook("https://outro.bitrix24.com.br/rest/42/secret-code/", "42")).toThrow();
  const restartedEnv = validateEnvironment(config);
  new BitrixClient(store, restartedEnv, async () => Response.json({ result: {} }));
  expect(restartedEnv.portalUrl).toBe("https://cliente.bitrix24.com.br");
});
it("usa webhook no caminho da API e nunca envia OAuth auth", async () => {
  let seen: { url: string; body: Record<string, unknown> } | undefined;
  const { env, client } = setup(async (input, init) => {
    seen = { url: String(input), body: JSON.parse(String(init?.body)) as Record<string, unknown> };
    return Response.json({ result: [{ ID: "1" }] });
  });
  client.configureWebhook("https://acme.bitrix24.com/rest/42/secret-code/", "42");
  await client.call("7", "user.get", { ID: "7" });
  expect(seen).toEqual({ url: "https://acme.bitrix24.com/rest/42/secret-code/user.get.json", body: { ID: "7" } });
  expect(seen?.body).not.toHaveProperty("auth");
  expect(env.portalUrl).toBe("https://acme.bitrix24.com");
});
it("rejeita URL de webhook fora do portal ou com query", async () => {
  const { client } = setup(async () => Response.json({ result: {} }));
  await expect(client.testWebhook("https://evil.test/rest/42/token/")).rejects.toMatchObject({ code: "WEBHOOK_URL_INVALID" });
  await expect(client.testWebhook("https://acme.bitrix24.com/rest/42/token/?x=1")).rejects.toMatchObject({ code: "WEBHOOK_URL_INVALID" });
  await expect(client.testWebhook("http://acme.bitrix24.com/rest/42/token/")).rejects.toMatchObject({ code: "WEBHOOK_URL_INVALID" });
});
it("descobre leads, negócios e processos inteligentes com campos e etapas", async () => {
  const requestedStages: string[] = [];
  const { client } = setup(async (input, init) => {
    const method = new URL(String(input)).pathname.split("/").pop()?.replace(".json", "");
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    if (method === "crm.type.list") return Response.json({ result: { types: [{ entityTypeId: 1098, title: "Movimentações de Pessoas" }] } });
    if (method === "crm.category.list") return Response.json({ result: { categories: [{ id: 0, name: "Geral" }, { id: 4, name: "Comercial" }] } });
    if (method === "crm.item.fields") return Response.json({ result: { fields: { TITLE: { title: "Nome", type: "string" }, DATE: { title: "Data", type: "date" } } } });
    if (method === "crm.status.list") {
      const entityId = String((body.filter as Record<string, unknown>).ENTITY_ID);
      requestedStages.push(entityId);
      return Response.json({ result: [{ STATUS_ID: `${entityId}:WON`, NAME: "Aprovado" }] });
    }
    throw new Error(`unexpected method ${method}`);
  });
  client.configureWebhook("https://acme.bitrix24.com/rest/42/secret-code/", "42");

  const sources = await client.discoverTriggerSources("42");

  expect(sources.map((source) => source.kind)).toEqual(["crm_lead", "crm_deal", "smart_process"]);
  expect(sources.find((source) => source.kind === "crm_lead")?.categories[0]).toMatchObject({ id: null, stages: [{ id: "STATUS:WON", name: "Aprovado" }] });
  expect(sources.find((source) => source.kind === "crm_deal")?.categories).toEqual(expect.arrayContaining([expect.objectContaining({ id: "0" }), expect.objectContaining({ id: "4" })]));
  expect(sources.find((source) => source.kind === "smart_process")?.fields).toEqual(expect.arrayContaining([expect.objectContaining({ id: "TITLE" }), expect.objectContaining({ id: "DATE" })]));
  expect(requestedStages).toContain("DYNAMIC_1098_STAGE_4");
});
