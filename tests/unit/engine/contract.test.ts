import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/server/db";
import { enqueueJob, takeDueJobs } from "@/server/db/repos/jobs";
import * as engine from "@/server/engine";
import { retryDelay, runJob } from "@/server/engine/jobs";
import { engineContext } from "@/server/engine/runtime";
import { crmBinding, crmItemUrl } from "@/server/engine/triggers";
import { decrypt } from "@/server/security/crypto";
import { setupEngine, type EngineEnv } from "../../fakes/engine-setup";

let env: EngineEnv;
beforeEach(() => {
  env = setupEngine();
});
afterEach(() => env.cleanup());

describe("contrato do motor", () => {
  it("valida o webhook no Bitrix e devolve dono, escopos e URL cifrada, sem gravar o segredo em log", async () => {
    const check = await engine.verifyWebhook(`${env.fake.webhookUrl()}`);
    expect(check).toMatchObject({ portal: env.fake.portal, owner: { bitrixUserId: "1", name: "Marina RH" }, scopes: env.fake.scopes });
    expect(decrypt(check.encryptedUrl)).toBe(env.fake.webhookUrl());
    expect(engine.maskWebhookUrl(env.fake.webhookUrl())).toBe(`${env.fake.portal}/rest/1/••••••/`);
    const logged = JSON.stringify(getDb().prepare("SELECT * FROM api_log").all());
    expect(logged).toContain("user.current");
    expect(logged).not.toContain(env.fake.secret);
  });

  it("explica em português quando o webhook é inválido ou recusado", async () => {
    await expect(engine.verifyWebhook("http://x.bitrix24.com/rest/1/abc/")).rejects.toThrow("O webhook precisa começar com https://.");
    await expect(engine.verifyWebhook(`${env.fake.portal}/rest/1/segredoerrado/`)).rejects.toThrow(/recusou o webhook/);
    env.fake.users.get(1)!.active = false;
    await expect(engine.verifyWebhook(env.fake.webhookUrl())).rejects.toThrow(/inativa/);
  });

  it("expõe trilhas iniciais, biblioteca e estado do limite", () => {
    expect(engine.starterTemplates()).toHaveLength(5);
    expect(engine.activityLibrary().length).toBeGreaterThan(10);
    expect(engine.bitrixRateLimitedUntil()).toBeNull();
    expect(engine.schedulerStatus().running).toBe(false);
    expect(() => engine.kick()).not.toThrow();
    expect(() => engine.ensureScheduler()).not.toThrow();
  });
});

describe("vínculos com o CRM", () => {
  it("monta UF_CRM_TASK e o link do registro por tipo", () => {
    expect([crmBinding(1, 5), crmBinding(2, 7), crmBinding(130, 9)]).toEqual(["L_5", "D_7", "T82_9"]);
    expect(crmItemUrl("https://p.bitrix24.com", 130, 9)).toBe("https://p.bitrix24.com/crm/type/130/details/9/");
  });
});

describe("fila de jobs", () => {
  it("espera 30 s · 2^n até 30 min entre tentativas", () => {
    expect([1, 2, 3, 7, 12].map(retryDelay)).toEqual([30_000, 60_000, 120_000, 1_800_000, 1_800_000]);
  });

  it("job de tipo desconhecido falha sem derrubar a fila", async () => {
    enqueueJob({ kind: "desconhecido" });
    const [job] = takeDueJobs();
    await runJob(job!, engineContext()!);
    const row = getDb().prepare("SELECT status, last_error FROM jobs WHERE id = ?").get<{ status: string; last_error: string }>(job!.id);
    expect(row).toEqual({ status: "failed", last_error: "Tipo de envio desconhecido (desconhecido)." });
  });
});
