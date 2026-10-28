import { describe, expect, it } from "vitest";
import { GET as apiHealth } from "@/app/api/health/route";
import { dynamic, GET as health } from "@/app/health/route";

describe("teste de saúde", () => {
  it("/health responde como /api/health, sem abrir o banco", async () => {
    expect(dynamic).toBe("force-dynamic");
    for (const get of [health, apiHealth]) {
      const response = get();
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(await response.json()).toMatchObject({ ok: true, node: process.version });
    }
  });
});
