import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createUser } from "@/server/db/repos/users";
import { createCollaboratorLink, loadCollaboratorView } from "@/server/services/collaborator";
import { buildJourneyDTO } from "@/server/services/read/journeys";
import { buildToday } from "@/server/services/read/today";
import { activityRow, seedActivities, seedBitrixPerson, seedJourney, seedTemplate } from "../../api/support/seed";
import { useTestDb } from "../../support/db";

// Só o motor é substituído: os modelos de leitura rodam com o domínio real do E1.
vi.mock("@/server/engine", async () => (await import("../../api/support/engine-mock")).engineMock());

const NOW = new Date("2026-10-26T15:00:00.000Z");
const RH = { type: "user" as const, id: "u1", name: "Marina RH" };

let cleanup: () => void;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  cleanup = useTestDb().cleanup;
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function seed() {
  const journey = seedJourney({ person: seedBitrixPerson("50", "Bruno Lima"), template: seedTemplate("onboarding"), anchorDate: "2026-11-03" });
  const [first, mine, later] = seedActivities([
    activityRow({ journeyId: journey.id, stagePosition: 0, role: "ti", title: "Criar acessos", dueAt: "2026-10-24T18:00:00-03:00" }),
    activityRow({ journeyId: journey.id, stagePosition: 1, role: "colaborador", visibility: "employee", status: "locked", releasedAt: null, title: "Conhecer o time", dueAt: "2026-11-05T18:00:00-03:00" }),
    activityRow({ journeyId: journey.id, stagePosition: 2, role: "gestor", status: "locked", releasedAt: null, title: "Conversa de 30 dias", dueAt: "2026-12-03T18:00:00-03:00" }),
  ]);
  return { journey, first: first!, mine: mine!, later: later! };
}

describe("modelos de leitura com o domínio real", () => {
  it("jornada: estações, previsão de liberação, risco, próxima parada e bloqueios", () => {
    const { journey, first, mine, later } = seed();
    const dto = buildJourneyDTO(journey.id, NOW);
    expect(dto.stages.map((stage) => [stage.position, stage.state])).toEqual([
      [0, "current"],
      [1, "upcoming"],
      [2, "upcoming"],
    ]);
    const all = dto.stages.flatMap((stage) => stage.activities);
    expect(all.find((activity) => activity.id === first.id)).toMatchObject({ overdue: true, releasesAt: null });
    expect(all.find((activity) => activity.id === mine.id)?.releasesAt).toBe("2026-11-03T08:00:00-03:00");
    expect(all.find((activity) => activity.id === later.id)?.releasesAt).toBeNull();
    expect(dto.summary).toMatchObject({ risk: "critical", progress: { done: 0, total: 3, percent: 0 }, nextStop: { label: "Criar acessos", at: first.dueAt } });
    expect(dto.completion.ok).toBe(false);
    expect(dto.completion.blockers[0]).toContain("Criar acessos");
  });

  it("painel de hoje: cobra a obrigatória atrasada de outro papel", () => {
    const { first } = seed();
    const user = createUser({ name: "Marina Souza", email: "marina@empresa.com.br", passwordHash: "x", role: "rh" });
    const today = buildToday(user, NOW);
    expect(today.date).toBe("2026-10-26");
    expect(today.board).toEqual([expect.objectContaining({ id: `risk:${first.id}`, action: { type: "nudge", label: "Cobrar TI", targetId: first.id } })]);
    expect(today.counters).toEqual({ actions: 1, arriving: 1, leaving: 0 });
    expect(today.upcoming[0]?.daysUntil).toBe(8);
    expect(today.lines[0]).toMatchObject({ risk: "critical", line: [{ state: "current" }, { state: "upcoming" }, { state: "upcoming" }] });
  });

  it("página do colaborador: só a etapa com atividade visível, ainda não liberada", () => {
    const { journey, mine } = seed();
    const link = createCollaboratorLink(journey.id, RH);
    const view = loadCollaboratorView(link.url!.slice(3), NOW)!;
    expect(view.daysUntilAnchor).toBe(8);
    expect(view.progress).toEqual({ done: 0, total: 1, percent: 0 });
    expect(view.stages).toEqual([
      { position: 1, name: "Primeira semana", state: "upcoming", activities: [expect.objectContaining({ id: mine.id, status: "waiting", mine: true, ownerLabel: "Colaborador" })] },
    ]);
  });
});
