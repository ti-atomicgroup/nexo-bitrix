import { afterEach, expect, it, vi } from "vitest";
import { api, status } from "../../src/server/http";
afterEach(() => vi.unstubAllEnvs());
it("status público permanece 200 sem ambiente e operação privada falha fechada", async () => {
  vi.stubEnv("NEXO_ENCRYPTION_KEY", ""); vi.stubEnv("NEXO_SETUP_TOKEN", ""); vi.stubEnv("NEXO_APP_URL", ""); vi.stubEnv("BITRIX_PORTAL_URL", "");
  const response = await status();
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ data: { installed: false, configured: false, missingEnvironment: ["NEXO_ENCRYPTION_KEY", "NEXO_SETUP_TOKEN", "NEXO_APP_URL"] } });
  const workspace = await api(new Request("https://nexo.example.com/api/workspace"), "workspace");
  expect(workspace.status).toBe(503);
  expect(await workspace.json()).toMatchObject({ error: { code: "ENVIRONMENT" } });
  expect(workspace.headers.get("Cache-Control")).toContain("no-store");
});
