import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as journeyCreateRoute } from "@/app/api/journeys/route";
import { POST as linkPersonRoute } from "@/app/api/journeys/[journeyId]/person/route";
import { GET as todayRoute } from "@/app/api/today/route";
import { BitrixError } from "@/server/bitrix/errors";
import { listAudit } from "@/server/db/repos/audit";
import { upsertBitrixPeople } from "@/server/db/repos/people";
import { setProject, setWebhookRecord } from "@/server/db/repos/settings";
import { findUserById } from "@/server/db/repos/users";
import * as engine from "@/server/engine";
import { useTestDb } from "../support/db";
import { call, seedUser, type ApiErrorBody } from "./support/seed";

vi.mock("@/server/engine", async () => (await import("./support/engine-mock")).engineMock());

const OWNER = { bitrixUserId: "7", name: "Conta Técnica", position: null };
const JOURNEY_BODY = {
  requestId: "7b0e7a2e-3a1b-4a55-9a10-1f2d3c4b5a69",
  kind: "onboarding",
  person: { bitrixUserId: "90" },
  templateId: "t1",
  anchorDate: "2026-11-10",
};

let cleanup: () => void;
beforeEach(() => {
  cleanup = useTestDb().cleanup;
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  setWebhookRecord({ encryptedUrl: "v1.a.b.c", portal: "https://empresa.bitrix24.com.br", owner: OWNER, scopes: ["task", "user", "crm", "sonet_group"], verifiedAt: new Date().toISOString() });
  setProject({ id: "55", name: "Nexo · Jornadas", url: "https://empresa.bitrix24.com.br/workgroups/group/55/" });
  vi.mocked(engine.createJourney).mockClear();
  vi.mocked(engine.bitrixActorFacts).mockReset();
  vi.mocked(engine.bitrixActorFacts).mockImplementation(async () => ({ active: true, member: true }));
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const create = (token: string) => call<ApiErrorBody>(journeyCreateRoute, { path: "/api/journeys", token, body: JOURNEY_BODY });

describe("permissões individuais do Bitrix24 para quem é RH", () => {
  it("sem conta vinculada e sem e-mail que bata: recusa antes de falar com o motor", async () => {
    const { token } = await seedUser({ role: "rh", email: "sem-conta@empresa.com.br" });
    const result = await create(token);
    expect(result.status).toBe(403);
    expect(result.body.error.code).toBe("BITRIX_ACCOUNT_REQUIRED");
    expect(result.body.error.message).toMatch(/Ajustes/);
    expect(engine.createJourney).not.toHaveBeenCalled();
  });

  it("vincula sozinho pelo e-mail quando há uma única pessoa ativa com ele, e registra", async () => {
    upsertBitrixPeople([{ bitrixUserId: "21", name: "Rita RH", email: "Rita@Empresa.com.br", active: true }]);
    const { token, user } = await seedUser({ role: "rh", email: "rita@empresa.com.br" });
    expect((await create(token)).status).toBe(200);
    expect(findUserById(user.id)?.bitrixUserId).toBe("21");
    expect(listAudit({ entity: "user", entityId: user.id })[0]).toMatchObject({ action: "Conta do Bitrix24 vinculada" });
    expect(engine.bitrixActorFacts).toHaveBeenCalledWith("21", { membership: true });
  });

  it("e-mail que bate com duas pessoas não vincula ninguém", async () => {
    upsertBitrixPeople([
      { bitrixUserId: "21", name: "Rita A", email: "rita@empresa.com.br", active: true },
      { bitrixUserId: "22", name: "Rita B", email: "rita@empresa.com.br", active: true },
    ]);
    const { token, user } = await seedUser({ role: "rh", email: "rita@empresa.com.br" });
    expect((await create(token)).body.error.code).toBe("BITRIX_ACCOUNT_REQUIRED");
    expect(findUserById(user.id)?.bitrixUserId).toBeNull();
  });

  it("conta desativada no Bitrix24 não age, mesmo que o cache local ainda diga ativa", async () => {
    upsertBitrixPeople([{ bitrixUserId: "21", name: "Rita RH", email: "rita@empresa.com.br", active: true }]);
    const { token } = await seedUser({ role: "rh", email: "rita@empresa.com.br" });
    vi.mocked(engine.bitrixActorFacts).mockImplementation(async () => ({ active: false, member: true }));
    const result = await create(token);
    expect(result.status).toBe(403);
    expect(result.body.error.code).toBe("BITRIX_ACCOUNT_INACTIVE");
    expect(engine.createJourney).not.toHaveBeenCalled();
  });

  it("quem não participa do projeto no Bitrix24 não cria tarefas nele", async () => {
    upsertBitrixPeople([{ bitrixUserId: "21", name: "Rita RH", email: "rita@empresa.com.br", active: true }]);
    const { token } = await seedUser({ role: "rh", email: "rita@empresa.com.br" });
    vi.mocked(engine.bitrixActorFacts).mockImplementation(async () => ({ active: true, member: false }));
    const result = await create(token);
    expect(result.status).toBe(403);
    expect(result.body.error.code).toBe("BITRIX_PROJECT_REQUIRED");
    expect(result.body.error.message).toContain("Nexo · Jornadas");
  });

  it("Bitrix24 fora do ar e sem resposta guardada: nega, sem deixar passar", async () => {
    upsertBitrixPeople([{ bitrixUserId: "21", name: "Rita RH", email: "rita@empresa.com.br", active: true }]);
    const { token } = await seedUser({ role: "rh", email: "rita@empresa.com.br" });
    vi.mocked(engine.bitrixActorFacts).mockImplementation(async () => {
      throw new BitrixError("TRANSPORT_ERROR", { retryable: true });
    });
    const result = await create(token);
    expect(result.status).toBe(503);
    expect(result.body.error.code).toBe("BITRIX_ACCESS_UNVERIFIED");
    expect(engine.createJourney).not.toHaveBeenCalled();
  });

  it("operação que fica só no Nexo não exige vínculo", async () => {
    const { token } = await seedUser({ role: "rh", email: "sem-conta@empresa.com.br" });
    expect((await call(todayRoute, { path: "/api/today", token })).status).toBe(200);
    expect(engine.bitrixActorFacts).not.toHaveBeenCalled();
  });

  it("a administração age com o mandato da conta técnica, sem vínculo", async () => {
    const { token } = await seedUser({ role: "admin", email: "admin@empresa.com.br" });
    expect((await create(token)).status).toBe(200);
    expect(engine.bitrixActorFacts).not.toHaveBeenCalled();
  });
});

describe("convite para o Bitrix24 (cria conta no portal)", () => {
  const linkedRh = async () => {
    upsertBitrixPeople([{ bitrixUserId: "21", name: "Rita RH", email: "rita@empresa.com.br", active: true }]);
    return seedUser({ role: "rh", email: "rita@empresa.com.br" });
  };

  it("o RH não convida, nem ao vincular nem ao criar a jornada", async () => {
    const { token } = await linkedRh();
    const viaLink = await call<ApiErrorBody, "journeyId">(linkPersonRoute, { path: "/api/journeys/j1/person", params: { journeyId: "j1" }, token, body: { inviteEmail: "nova@empresa.com.br" } });
    expect(viaLink.status).toBe(403);
    expect(viaLink.body.error.code).toBe("FORBIDDEN");
    expect(engine.inviteJourneyPerson).not.toHaveBeenCalled();

    const viaCreate = await call<ApiErrorBody>(journeyCreateRoute, {
      path: "/api/journeys",
      token,
      body: { ...JOURNEY_BODY, person: { name: "Nova", email: "nova@empresa.com.br", invite: true } },
    });
    expect(viaCreate.status).toBe(403);
    expect(engine.createJourney).not.toHaveBeenCalled();
    // Sem convite, a mesma jornada passa.
    expect((await call(journeyCreateRoute, { path: "/api/journeys", token, body: { ...JOURNEY_BODY, person: { name: "Nova" } } })).status).toBe(200);
  });
});
