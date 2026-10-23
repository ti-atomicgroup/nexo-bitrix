import { afterEach, expect, it, vi } from "vitest";
import { api, status } from "../../src/server/http";
afterEach(() => vi.unstubAllEnvs());
it("abre o instalador sem variáveis de instalação fornecidas pelo cliente", async () => {
  vi.stubEnv("NEXO_ENCRYPTION_KEY", ""); vi.stubEnv("NEXO_SETUP_TOKEN", ""); vi.stubEnv("NEXO_APP_URL", ""); vi.stubEnv("BITRIX_PORTAL_URL", "");
  const response = await status(new Request("http://localhost:3000/api/status"));
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ data: { installed: false, configured: false, missingEnvironment: [], appUrl: "http://localhost:3000" } });
  const workspace = await api(new Request("http://localhost:3000/api/workspace"), "workspace");
  expect(workspace.status).toBe(401);
  expect(await workspace.json()).toMatchObject({ error: { code: "SESSION_REQUIRED" } });
  expect(workspace.headers.get("Cache-Control")).toContain("no-store");
});
