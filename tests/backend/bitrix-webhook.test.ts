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
    if (url.endsWith("/profile.json")) return Response.json({ result: { ID: "42", NAME: "RH Serviço", ACTIVE: true } });
    if (url.endsWith("/scope.json")) return Response.json({ result: ["task", "user_brief", "crm", "userfieldconfig"] });
    throw new Error(`unexpected request ${url}`);
  });
  const result = await client.testWebhook("https://acme.bitrix24.com/rest/42/secret-code/");
  expect(result).toEqual({ userId: "42", userName: "RH Serviço", scopes: ["task", "user_brief", "crm", "userfieldconfig"] });
  client.configureWebhook("https://acme.bitrix24.com/rest/42/secret-code/", result.userId);
  expect(JSON.stringify(store.get("webhook", "incoming", (await import("../../src/server/models")).webhookConfigurationSchema))).not.toContain("secret-code");
  expect(calls).toEqual(["https://acme.bitrix24.com/rest/42/secret-code/profile.json", "https://acme.bitrix24.com/rest/42/secret-code/scope.json"]);
  expect(env.portalUrl).toBe("https://acme.bitrix24.com");
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
