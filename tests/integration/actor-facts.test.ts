import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkWebhook } from "@/server/bitrix/methods";
import { getBitrix, setBitrixTransportForTests } from "@/server/engine/runtime";
import { bitrixActorFacts, resetActorFactsForTests } from "@/server/engine/actor-facts";
import { upsertBitrixPeople } from "@/server/db/repos/people";
import { setProject } from "@/server/db/repos/settings";
import { scopeCheck } from "@/server/services/scopes";
import { setupEngine, type EngineEnv } from "../fakes/engine-setup";

let env: EngineEnv;
let projectId: number;

beforeEach(() => {
  env = setupEngine();
  resetActorFactsForTests();
  env.fake.groups.set(42, { id: 42, name: "Nexo · Jornadas", description: "", project: true, visible: false, opened: false, closed: false } as never);
  projectId = 42;
  setProject({ id: String(projectId), name: "Nexo · Jornadas", url: `${env.fake.portal}/workgroups/group/42/` });
  vi.spyOn(console, "log").mockImplementation(() => undefined);
});
afterEach(() => {
  resetActorFactsForTests();
  env.cleanup();
  vi.restoreAllMocks();
});

describe("o que o portal diz sobre quem pede a ação", () => {
  it("consulta a conta e o projeto de verdade: participa, não participa, desativada", async () => {
    env.fake.addGroupMember(projectId, 10);
    expect(await bitrixActorFacts("10", { membership: true })).toEqual({ active: true, member: true });
    expect(await bitrixActorFacts("11", { membership: true })).toEqual({ active: true, member: false });
    // O dono do webhook é o dono do projeto.
    expect(await bitrixActorFacts("1", { membership: true })).toEqual({ active: true, member: true });
    env.fake.users.get(12)!.active = false;
    expect((await bitrixActorFacts("12", { membership: false })).active).toBe(false);
    expect((await bitrixActorFacts("999", { membership: false })).active).toBe(false);
  });

  it("guarda a resposta por 5 minutos e depois percebe a mudança no portal", async () => {
    env.fake.addGroupMember(projectId, 10);
    const t0 = Date.now();
    expect((await bitrixActorFacts("10", { membership: true }, t0)).active).toBe(true);
    const calls = env.fake.calls.length;
    expect((await bitrixActorFacts("10", { membership: true }, t0 + 60_000)).active).toBe(true);
    expect(env.fake.calls.length).toBe(calls);
    env.fake.users.get(10)!.active = false;
    expect((await bitrixActorFacts("10", { membership: true }, t0 + 6 * 60_000)).active).toBe(false);
  });

  it("Bitrix24 fora do ar: vale a última resposta; sem nenhuma, a participação não é presumida", async () => {
    env.fake.addGroupMember(projectId, 10);
    const t0 = Date.now();
    await bitrixActorFacts("10", { membership: true }, t0);
    env.fake.failNext("user.get", "serverError", 20);
    env.fake.failNext("sonet_group.user.get", "serverError", 20);
    expect(await bitrixActorFacts("10", { membership: true }, t0 + 6 * 60_000)).toEqual({ active: true, member: true });
    resetActorFactsForTests();
    upsertBitrixPeople([{ bitrixUserId: "11", name: "Diego", active: true }]);
    await expect(bitrixActorFacts("11", { membership: true }, t0 + 7 * 60_000)).rejects.toThrow();
  });
});

describe("sem segurar a requisição", () => {
  it("portal lento: desiste no prazo, faz uma consulta só e deixa a resposta pronta para a próxima", async () => {
    env.fake.addGroupMember(projectId, 10);
    const realFetch = env.fake.asFetch();
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    let calls = 0;
    setBitrixTransportForTests(async (input, init) => {
      calls++;
      await gate;
      return realFetch(input, init);
    });
    const t0 = Date.now();
    const started = performance.now();
    const answers = await Promise.allSettled([bitrixActorFacts("10", { membership: false }, t0, 30), bitrixActorFacts("10", { membership: false }, t0, 30)]);
    expect(performance.now() - started).toBeLessThan(2_000);
    expect(answers.map((answer) => answer.status)).toEqual(["rejected", "rejected"]);
    expect(calls).toBe(1);
    release();
    await vi.waitFor(async () => {
      expect(await bitrixActorFacts("10", { membership: false }, t0, 30)).toEqual({ active: true, member: true });
    });
    expect(calls).toBe(1);
  });
});

describe("privilégio da conta técnica", () => {
  it("informa se a conta é administradora do portal", async () => {
    env.fake.ownerIsAdmin = true;
    expect((await checkWebhook(getBitrix()!)).ownerIsPortalAdmin).toBe(true);
    env.fake.ownerIsAdmin = false;
    expect((await checkWebhook(getBitrix()!)).ownerIsPortalAdmin).toBe(false);
  });

  it("sem resposta do Bitrix24 sobre isso, a conexão segue: é só um aviso", async () => {
    env.fake.failNext("user.admin", "denied", 5);
    const check = await checkWebhook(getBitrix()!);
    expect(check.ownerIsPortalAdmin).toBeNull();
    expect(check.owner.bitrixUserId).toBe("1");
  });

  it("aponta os escopos que o Nexo não usa", () => {
    expect(scopeCheck(["task", "user", "crm", "sonet_group", "disk", "telephony", "lists"]).extra).toEqual(["lists", "telephony"]);
    expect(scopeCheck(["task", "user_brief", "crm", "sonet"]).extra).toEqual([]);
  });
});
