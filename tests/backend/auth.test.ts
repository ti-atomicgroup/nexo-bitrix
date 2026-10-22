import { afterEach, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../../src/server/store";
import { validateEnvironment } from "../../src/server/security";
import { Auth } from "../../src/server/auth";
import { BitrixClient } from "../../src/server/bitrix";
const resources: { store: Store; dir: string }[] = [];
afterEach(() => { for (const resource of resources.splice(0)) { if (resource.store.sqlite.open) resource.store.close(); rmSync(resource.dir, { recursive: true, force: true }); } });
const env = validateEnvironment({ NEXO_ENCRYPTION_KEY: "ab".repeat(32), NEXO_SETUP_TOKEN: "setup-secret-long-enough", NEXO_APP_URL: "https://nexo.example.com", BITRIX_PORTAL_URL: "https://acme.bitrix24.com", NEXO_DATA_DIR: "./data" });
function setup() {
  const dir = mkdtempSync(join(tmpdir(), "nexo-auth-"));
  const store = new Store(join(dir, "nexo.db"));
  resources.push({ store, dir });
  let oauthFailure = false;
  let expired = false;
  let limited = false;
  const transport: typeof fetch = async (input, init) => {
    const url = String(input);
    if (url.includes("oauth.bitrix.info")) {
      const grant = new URLSearchParams(String(init?.body));
      return oauthFailure || grant.get("client_secret") === "wrong" ? Response.json({ error: "invalid_grant" }) : Response.json({ access_token: "good", refresh_token: "rotated-refresh", expires_in: 3600, member_id: "member1", user_id: "1" });
    }
    const body = JSON.parse(String(init?.body));
    if (limited) { limited = false; return new Response("{}", { status: 429, headers: { "Retry-After": "60" } }); }
    if (expired) { expired = false; return Response.json({ error: "expired_token" }, { status: 401 }); }
    if (body.auth !== "good" && body.auth !== "user2") return Response.json({ error: "expired_token" });
    if (url.includes("user.current")) return Response.json({ result: { ID: body.auth === "good" ? "1" : "2", NAME: "Ana", LAST_NAME: "Silva", ACTIVE: true } });
    if (url.includes("user.admin")) return Response.json({ result: body.auth === "good" });
    if (url.includes("app.info")) return Response.json({ result: { ID: "7", CODE: "local.nexo", SCOPE: "task,user_brief,crm,userfieldconfig" } });
    if (url.includes("user.get")) return Response.json({ result: [{ ID: "1", NAME: "Ana", ACTIVE: true }] });
    throw new Error(`Unexpected endpoint ${url}`);
  };
  const client = new BitrixClient(store, env, transport), auth = new Auth(store, env, client);
  return { store, client, auth, failOAuth: () => { oauthFailure = true; }, expireNext: () => { expired = true; }, limitNext: () => { limited = true; } };
}
const form = { DOMAIN: "acme.bitrix24.com", AUTH_ID: "good", REFRESH_ID: "refresh-private", APPLICATION_TOKEN: "application-private", member_id: "member1", AUTH_EXPIRES: "3600" };
it("contexto bootstrap não acessa workspace e setup inválido não instala", async () => {
  const { store, auth } = setup();
  const launch = await auth.launch(form);
  expect(launch.kind).toBe("bootstrap");
  expect(() => auth.session(launch.token)).toThrow();
  await expect(auth.bootstrap(launch.token, "wrong", "local.nexo", "client-secret")).rejects.toThrow();
  expect(auth.installation()).toBe(null);
  const result = await auth.bootstrap(launch.token, env.setupToken, "local.nexo", "client-secret");
  expect(result.session.role).toBe("admin");
  expect(JSON.stringify(result)).not.toContain("refresh-private");
  expect(() => auth.session(launch.token)).toThrow();
  expect(auth.session(result.token).user.id).toBe("1");
  store.close();
});
it("bloqueia domínio, application_token e identidade forjados", async () => {
  const { store, auth } = setup();
  await expect(auth.launch({ ...form, DOMAIN: "127.0.0.1" })).rejects.toThrow();
  await expect(auth.launch({ ...form, AUTH_ID: "forged" })).rejects.toThrow();
  const initial = await auth.launch(form);
  await auth.bootstrap(initial.token, env.setupToken, "local.nexo", "secret");
  await expect(auth.launch({ ...form, APPLICATION_TOKEN: "forged" })).rejects.toThrow();
  await expect(auth.launch({ ...form, member_id: "another" })).rejects.toThrow();
  store.close();
});
it("refresh falho de um usuário não remove credenciais de outro", async () => {
  const { store, auth, client, failOAuth } = setup();
  const first = await auth.launch(form);
  await auth.bootstrap(first.token, env.setupToken, "local.nexo", "secret");
  const second = await auth.launch({ ...form, AUTH_ID: "user2" });
  expect(auth.session(second.token).user.id).toBe("2");
  const credentials = client.credentials("1");
  client.saveCredentials({ ...credentials, expiresAt: 1 });
  failOAuth();
  await expect(client.call("1", "user.current", {})).rejects.toThrow();
  expect(auth.session(second.token).user.id).toBe("2");
  const user = await client.call("2", "user.current", {});
  expect(user).toMatchObject({ ID: "2" });
  store.close();
});
it("não grava instalação com client secret não validado pelo OAuth", async () => {
  const { store, auth } = setup();
  const context = await auth.launch(form);
  await expect(auth.bootstrap(context.token, env.setupToken, "local.nexo", "wrong")).rejects.toThrow();
  expect(auth.installation()).toBe(null);
  store.close();
});
it("paginação também renova um access token expirado externamente", async () => {
  const { store, auth, client, expireNext } = setup();
  const context = await auth.launch(form);
  await auth.bootstrap(context.token, env.setupToken, "local.nexo", "secret");
  expireNext();
  expect(await client.list("1", "user.get", {})).toMatchObject([{ ID: "1" }]);
  store.close();
});
it("limite 429 pausa chamadas subsequentes mesmo com um cliente reiniciado", async () => {
  const { store, auth, client, limitNext } = setup();
  const context = await auth.launch(form);
  await auth.bootstrap(context.token, env.setupToken, "local.nexo", "secret");
  limitNext();
  await expect(client.call("1", "user.current", {})).rejects.toMatchObject({ code: "RATE_LIMIT" });
  const restarted = new BitrixClient(store, env, async () => { throw new Error("must respect persisted cooldown"); });
  await expect(restarted.call("1", "user.current", {})).rejects.toMatchObject({ code: "RATE_LIMIT" });
  store.close();
});
