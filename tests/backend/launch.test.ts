import { expect, it } from "vitest";
import { launch } from "../../src/server/http";

it("desativa os endpoints antigos de abertura OAuth", async () => {
  for (const path of ["/api/bitrix/install", "/api/bitrix/launch"]) {
    const response = await launch(new Request(`https://nexo.example.com${path}`, { method: "POST" }));
    expect(response.status).toBe(410);
    expect(await response.json()).toMatchObject({ error: { code: "LEGACY_ROUTE_DISABLED" } });
  }
});
