import { afterEach, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../../src/server/store";
import { validateEnvironment } from "../../src/server/security";
import { BitrixClient } from "../../src/server/bitrix";
import { Auth } from "../../src/server/auth";
import { hashPassword, verifyPassword } from "../../src/server/security";
const resources: { store: Store; dir: string }[] = [];
afterEach(() => { for (const item of resources.splice(0)) { item.store.close(); rmSync(item.dir, { recursive: true, force: true }); } });
it("hashes local RH passwords with unique salts and verifies them", () => {
  const first = hashPassword("RH-forte-senha-2026");
  const second = hashPassword("RH-forte-senha-2026");
  expect(first).not.toBe(second);
  expect(first).not.toContain("RH-forte-senha-2026");
  expect(verifyPassword("RH-forte-senha-2026", first)).toBe(true);
  expect(verifyPassword("outra-senha", first)).toBe(false);
  expect(verifyPassword("RH-forte-senha-2026", "malformado")).toBe(false);
});
it("allows an RH admin to disable a local account and immediately revokes its session", async () => {
  const env = validateEnvironment({ NEXO_ENCRYPTION_KEY: "ab".repeat(32), NEXO_SETUP_TOKEN: "setup-secret-long-enough", NEXO_APP_URL: "https://nexo.example.com", BITRIX_PORTAL_URL: "https://acme.bitrix24.com" });
  const dir = mkdtempSync(join(tmpdir(), "nexo-local-auth-")), store = new Store(join(dir, "nexo.db")); resources.push({ store, dir });
  const transport: typeof fetch = async (input, init) => {
    const url = String(input), body = JSON.parse(String(init?.body)) as { ID?: string };
    if (url.endsWith("/user.get.json")) return Response.json({ result: [{ ID: body.ID ?? "1", NAME: body.ID === "2" ? "Pessoa" : "Admin", ACTIVE: true }] });
    throw new Error(`unexpected ${url}`);
  };
  const client = new BitrixClient(store, env, transport);
  client.configureWebhook("https://acme.bitrix24.com/rest/1/secret-code/", "1");
  const auth = new Auth(store, env, client);
  const admin = await auth.bootstrapLocalAdmin(env.setupToken, "admin@example.com", "Senha-forte-de-admin-2026", "1");
  const person = await auth.createLocalUser(admin.session, { email: "pessoa@example.com", password: "Senha-forte-da-pessoa-2026", bitrixUserId: "2", role: "executor" });
  const login = await auth.loginLocal("pessoa@example.com", "Senha-forte-da-pessoa-2026");
  expect(auth.session(login.token).role).toBe("executor");
  await auth.deactivateLocalUser(admin.session, person.id);
  expect(() => auth.session(login.token)).toThrow();
  await expect(auth.loginLocal("pessoa@example.com", "Senha-forte-da-pessoa-2026")).rejects.toMatchObject({ code: "LOGIN_INVALID" });
});
