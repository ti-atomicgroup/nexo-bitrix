import { afterEach, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../../src/server/store";
import { validateEnvironment } from "../../src/server/security";
import { BitrixClient } from "../../src/server/bitrix";

const resources: { store: Store; dir: string }[] = [];
afterEach(() => { for (const item of resources.splice(0)) { item.store.close(); rmSync(item.dir, { recursive: true, force: true }); } });

it("não tenta autenticação OAuth quando o webhook não está configurado", async () => {
  const env = validateEnvironment({ NEXO_ENCRYPTION_KEY: "ab".repeat(32), NEXO_SETUP_TOKEN: "setup-secret-long-enough", NEXO_APP_URL: "https://nexo.example.com", BITRIX_PORTAL_URL: "https://acme.bitrix24.com" });
  const dir = mkdtempSync(join(tmpdir(), "nexo-auth-webhook-only-")), store = new Store(join(dir, "nexo.db")); resources.push({ store, dir });
  let outboundRequests = 0;
  const client = new BitrixClient(store, env, async () => { outboundRequests++; return Response.json({ result: true }); });
  await expect(client.call("1", "user.current")).rejects.toMatchObject({ code: "WEBHOOK_NOT_CONFIGURED" });
  expect(outboundRequests).toBe(0);
});
