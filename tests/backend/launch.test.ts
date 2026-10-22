import { afterEach, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { Store } from "../../src/server/store";
import { validateEnvironment, type Environment } from "../../src/server/security";
import { Auth } from "../../src/server/auth";
import { BitrixClient } from "../../src/server/bitrix";
const runtime = vi.hoisted(() => ({ get: vi.fn<() => { env: Environment; auth: Auth }>() }));
vi.mock("../../src/server/runtime", () => ({ getRuntime: runtime.get }));
import { launch } from "../../src/server/http";
const resources: { store: Store; dir: string }[] = [];
afterEach(() => { for (const resource of resources.splice(0)) { resource.store.close(); rmSync(resource.dir, { recursive: true, force: true }); } });
function setup() {
  const env = validateEnvironment({ NEXO_ENCRYPTION_KEY: "ab".repeat(32), NEXO_SETUP_TOKEN: "setup-secret-long-enough", NEXO_APP_URL: "https://nexo.example.com", BITRIX_PORTAL_URL: "https://acme.bitrix24.com" });
  const dir = mkdtempSync(join(tmpdir(), "nexo-launch-")), store = new Store(join(dir, "nexo.db")); resources.push({ store, dir });
  const transport: typeof fetch = async input => {
    const method = String(input);
    if (method.includes("user.current")) return Response.json({ result: { ID: "1", NAME: "Admin", ACTIVE: true } });
    if (method.includes("user.admin")) return Response.json({ result: true });
    if (method.includes("app.info")) return Response.json({ result: { ID: "7", CODE: "local.nexo" } });
    throw new Error("unexpected remote call");
  };
  const auth = new Auth(store, env, new BitrixClient(store, env, transport));
  runtime.get.mockReturnValue({ env, auth });
  return { env, store };
}
const fields = { AUTH_ID: "good", REFRESH_ID: "refresh", APPLICATION_TOKEN: "application", member_id: "member1", AUTH_EXPIRES: "3600" };
it("abertura oficial aceita DOMAIN da query com OAuth no corpo", async () => {
  const { env } = setup();
  const response = await launch(new Request(`${env.appUrl}/api/bitrix/install?DOMAIN=${env.portalDomain}`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(fields) }));
  expect(response.status).toBe(303);
  expect(response.headers.get("Location")).toMatch(/^https:\/\/nexo.example.com\/#bootstrap=[\w-]+$/);
});
it("abertura rejeita divergência entre domínio da query e do corpo", async () => {
  const { env, store } = setup();
  const response = await launch(new Request(`${env.appUrl}/api/bitrix/launch?DOMAIN=evil.bitrix24.com`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ ...fields, DOMAIN: env.portalDomain }) }));
  expect(response.status).toBe(403);
  expect(store.list("bootstrap", z.object({ appId: z.string() }))).toEqual([]);
});
