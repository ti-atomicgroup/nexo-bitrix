import { describe, expect, it } from "vitest";
import { stageReleaseAt, stagesState, stagesToRelease } from "@/server/domain/release";
import { makeActivity, makeJourney, sampleOnboarding } from "../../fakes/builders";

const SP = "America/Sao_Paulo";

/** Atividades da trilha de exemplo: 3 na etapa 0, 1 na etapa 1, 1 na etapa 2. */
function rows(overrides: Array<Partial<Parameters<typeof makeActivity>[0]>>) {
  const base = [
    { stagePosition: 0, position: 0, title: "Criar acessos", required: true },
    { stagePosition: 0, position: 1, title: "Enviar documentos", role: "colaborador" as const, required: true },
    { stagePosition: 0, position: 2, title: "Preparar contrato", role: "rh" as const, required: false },
    { stagePosition: 1, position: 0, title: "Boas-vindas do gestor", role: "gestor" as const, required: true },
    { stagePosition: 2, position: 0, title: "1:1 de 30 dias", role: "gestor" as const, required: true },
  ];
  return base.map((item, index) => makeActivity({ id: `a${index}`, status: "locked", releasedAt: null, ...item, ...overrides[index] }));
}

describe("stageReleaseAt", () => {
  it("libera etapas por data às 08:00 locais e não tem data para início/etapa anterior", () => {
    const [start, offset, after] = sampleOnboarding().stages;
    expect(stageReleaseAt(start!, "2026-11-02", SP)).toBeNull();
    expect(stageReleaseAt(offset!, "2026-11-02", SP)).toBe("2026-11-02T08:00:00-03:00");
    expect(stageReleaseAt({ ...offset!, releaseOffsetDays: -5, releaseOffsetUnit: "business" }, "2026-11-02", SP)).toBe("2026-10-26T08:00:00-03:00");
    expect(stageReleaseAt(after!, "2026-11-02", SP)).toBeNull();
  });
});

describe("stagesToRelease", () => {
  const journey = makeJourney();

  it("libera a etapa inicial na criação e espera a data das outras", () => {
    expect(stagesToRelease(journey, rows([]), SP, new Date("2026-10-26T15:00:00Z"))).toEqual([0]);
  });

  it("libera a etapa por data quando chega o dia", () => {
    const released = rows([{ status: "open", releasedAt: "x" }, { status: "open", releasedAt: "x" }, { status: "open", releasedAt: "x" }]);
    expect(stagesToRelease(journey, released, SP, new Date("2026-11-02T10:59:00Z"))).toEqual([]);
    expect(stagesToRelease(journey, released, SP, new Date("2026-11-02T11:00:00Z"))).toEqual([1]);
  });

  it("libera a etapa seguinte quando as obrigatórias da anterior terminam (opcional não segura)", () => {
    const now = new Date("2026-11-03T12:00:00Z");
    const done = { status: "done" as const, releasedAt: "x" };
    const notYet = rows([done, done, { status: "open", releasedAt: "x" }, { status: "open", releasedAt: "x" }]);
    expect(stagesToRelease(journey, notYet, SP, now)).toEqual([]);
    const ready = rows([done, done, { status: "open", releasedAt: "x" }, done]);
    expect(stagesToRelease(journey, ready, SP, now)).toEqual([2]);
  });

  it("não libera nada em jornada pausada", () => {
    expect(stagesToRelease(makeJourney({ status: "paused" }), rows([]), SP, new Date("2026-11-03T12:00:00Z"))).toEqual([]);
  });
});

describe("stagesState", () => {
  it("marca concluída, atual e próxima, com previsão de liberação", () => {
    const done = { status: "done" as const, releasedAt: "x" };
    const state = stagesState(makeJourney(), rows([done, done, { status: "open", releasedAt: "x" }]), SP);
    expect(state.map((stage) => stage.state)).toEqual(["done", "current", "upcoming"]);
    expect(state[1]).toMatchObject({ name: "Primeiro dia", releaseMode: "offset", releasesAt: "2026-11-02T08:00:00-03:00" });
    expect(state[0]?.releasesAt).toBeNull();
    expect(state[2]?.releasesAt).toBeNull();
  });

  it("mostra todas como concluídas quando a jornada foi concluída", () => {
    const state = stagesState(makeJourney({ status: "completed" }), rows([]), SP);
    expect(state.every((stage) => stage.state === "done")).toBe(true);
  });
});
