import { expect, it } from "vitest";
import { BitrixError } from "../../src/server/errors";

it("includes the Bitrix API code in generic integration errors", () => {
  const error = new BitrixError("CRM_STAGE_ERROR");
  expect(error.message).toContain("CRM_STAGE_ERROR");
});
