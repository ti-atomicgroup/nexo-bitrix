import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as activityActionRoute } from "@/app/api/activities/[activityId]/actions/route";
import { POST as linkRoute } from "@/app/api/journeys/[journeyId]/link/route";
import { GET as journeyRoute } from "@/app/api/journeys/[journeyId]/route";
import { GET as journeysRoute } from "@/app/api/journeys/route";
import { insertLedgerItem } from "@/server/db/repos/ledger";
import { setProject, setWebhookRecord } from "@/server/db/repos/settings";
import * as engine from "@/server/engine";
import { buildJourneyDTO } from "@/server/services/read/journeys";
import type { ActivityDTO, CollaboratorLinkDTO, JourneyDTO, JourneySummaryDTO } from "@/shared/contracts";
import { FAKE_RELEASES_AT } from "../../api/support/domain-fake";
import { activityRow, call, seedActivities, seedBitrixPerson, seedJourney, seedTemplate, seedUser, type ApiErrorBody } from "../../api/support/seed";
import { useTestDb } from "../../support/db";

vi.mock("@/server/engine", async () => (await import("../../api/support/engine-mock")).engineMock());
vi.mock("@/server/domain", async () => (await import("../../api/support/domain-fake")).domainFake());

let cleanup: () => void;
let token: string;
beforeEach(async () => {
  cleanup = useTestDb().cleanup;
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  token = (await seedUser({ role: "rh", name: "Marina RH" })).token;
  setWebhookRecord({ encryptedUrl: "v1.x.y.z", portal: "empresa.bitrix24.com.br", owner: { bitrixUserId: "7", name: "Integração", position: null }, scopes: [], verifiedAt: "2026-10-26T12:00:00.000Z" });
  setProject({ id: "42", name: "Nexo · Jornadas", url: "https://empresa.bitrix24.com.br/workgroups/group/42/" });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function seedOffboarding() {
  const person = seedBitrixPerson("50", "Bruno Lima");
  seedBitrixPerson("11", "Diego Araújo", "Analista de TI");
  const journey = seedJourney({ person, template: seedTemplate("offboarding"), offboardingReason: "voluntary", sourceLabel: "Negócio #77", sourceType: "trigger" });
  const [synced, locked, missing] = seedActivities([
    activityRow({ journeyId: journey.id, stagePosition: 0, assigneeBitrixId: "11", assigneeName: "Diego Araújo", bitrixTaskId: "900", syncState: "synced" }),
    activityRow({ journeyId: journey.id, stagePosition: 2, status: "locked", releasedAt: null }),
    activityRow({ journeyId: journey.id, stagePosition: 1, bitrixTaskId: "901", bitrixMissing: true }),
  ]);
  insertLedgerItem({ personId: person.id, kind: "equipment", name: "Notebook", status: "active", source: "manual" });
  return { person, journey, synced: synced!, locked: locked!, missing: missing! };
}

describe("jornada completa (JourneyDTO)", () => {
  it("monta etapas, links do Bitrix, inventário, conclusão e histórico", async () => {
    const { journey, synced, locked, missing } = seedOffboarding();
    const created = await call<CollaboratorLinkDTO, "journeyId">(linkRoute, { token, params: { journeyId: journey.id }, body: { action: "create" } });
    expect(created.body.url).toMatch(/^\/j\/[A-Za-z0-9_-]{43}$/);
    const secret = created.body.url!.slice(3);

    const result = await call<JourneyDTO, "journeyId">(journeyRoute, { token, params: { journeyId: journey.id } });
    expect(result.status).toBe(200);
    const dto = result.body;
    expect(dto.summary).toMatchObject({ id: journey.id, kind: "offboarding", person: { name: "Bruno Lima" }, templateName: "Desligamento", progress: { done: 0, total: 3 } });
    expect(dto.stages.map((stage) => stage.position)).toEqual([0, 1, 2]);
    const all = dto.stages.flatMap((stage) => stage.activities);
    expect(all.find((activity) => activity.id === synced.id)).toMatchObject({
      assignee: { bitrixUserId: "11", name: "Diego Araújo", position: "Analista de TI" },
      bitrixUrl: "https://empresa.bitrix24.com.br/workgroups/group/42/tasks/task/view/900/",
      releasesAt: null,
    });
    expect(all.find((activity) => activity.id === locked.id)).toMatchObject({ status: "locked", releasesAt: FAKE_RELEASES_AT, assignee: null });
    expect(all.find((activity) => activity.id === missing.id)).toMatchObject({ bitrixMissing: true, bitrixUrl: null });
    expect(dto.ledger.map((item) => item.name)).toEqual(["Notebook"]);
    expect(dto.completion.ok).toBe(false);
    expect(dto.completion.blockers).toContain('Recolher "Notebook"');
    expect(dto.offboardingReason).toBe("voluntary");
    expect(dto.source).toEqual({ type: "trigger", label: "Negócio #77", crmUrl: null });
    expect(dto.projectUrl).toBe("https://empresa.bitrix24.com.br/workgroups/group/42/");
    expect(dto.link).toEqual({ active: true, expiresAt: null });
    expect(dto.history[0]).toMatchObject({ actor: "Marina RH", action: "Link do colaborador criado" });
    expect(result.text).not.toContain(secret);

    const revoked = await call<CollaboratorLinkDTO, "journeyId">(linkRoute, { token, params: { journeyId: journey.id }, body: { action: "revoke" } });
    expect(revoked.body).toEqual({ active: false, expiresAt: null });
    expect(buildJourneyDTO(journey.id).link.active).toBe(false);
  });

  it("jornada inexistente → 404 com mensagem", async () => {
    const result = await call<ApiErrorBody, "journeyId">(journeyRoute, { token, params: { journeyId: "nao-existe" } });
    expect(result.status).toBe(404);
    expect(result.body.error).toEqual({ code: "NOT_FOUND", message: "Não encontramos esta jornada." });
  });

  it("lista resumos com filtro por tipo e situação", async () => {
    seedOffboarding();
    seedJourney({ person: seedBitrixPerson("60", "Carla Nova"), template: seedTemplate("onboarding"), status: "paused" });
    const all = await call<JourneySummaryDTO[]>(journeysRoute, { token, path: "/api/journeys" });
    expect(all.body.map((item) => item.person.name).sort()).toEqual(["Bruno Lima", "Carla Nova"]);
    const leaving = await call<JourneySummaryDTO[]>(journeysRoute, { token, path: "/api/journeys?kind=offboarding&status=" });
    expect(leaving.body.map((item) => item.person.name)).toEqual(["Bruno Lima"]);
    const paused = await call<JourneySummaryDTO[]>(journeysRoute, { token, path: "/api/journeys?status=paused" });
    expect(paused.body.map((item) => item.person.name)).toEqual(["Carla Nova"]);
    const invalid = await call<ApiErrorBody>(journeysRoute, { token, path: "/api/journeys?status=talvez" });
    expect(invalid.status).toBe(400);
  });
});

describe("ações de atividade", () => {
  it("chama o motor com a entrada validada e devolve a atividade relida", async () => {
    const { synced } = seedOffboarding();
    const result = await call<ActivityDTO, "activityId">(activityActionRoute, { token, params: { activityId: synced.id }, body: { action: "nudge", message: " Pode ver hoje? " } });
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ id: synced.id, bitrixTaskId: "900" });
    expect(engine.applyActivityAction).toHaveBeenCalledWith(synced.id, { action: "nudge", message: "Pode ver hoje?" }, expect.objectContaining({ type: "user", name: "Marina RH" }));

    const unknown = await call<ApiErrorBody, "activityId">(activityActionRoute, { token, params: { activityId: "nao-existe" }, body: { action: "complete" } });
    expect(unknown.status).toBe(404);
    expect(unknown.body.error.message).toBe("Não encontramos esta atividade.");
  });
});
