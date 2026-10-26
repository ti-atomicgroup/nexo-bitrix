import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { insertDetectionIfNew, updateDetection } from "@/server/db/repos/detections";
import { createTrigger } from "@/server/db/repos/triggers";
import { createUser } from "@/server/db/repos/users";
import { buildToday } from "@/server/services/read/today";
import { activityRow, seedActivities, seedBitrixPerson, seedJourney, seedManualPerson, seedTemplate } from "../../api/support/seed";
import { useTestDb } from "../../support/db";

vi.mock("@/server/engine", async () => (await import("../../api/support/engine-mock")).engineMock());
vi.mock("@/server/domain", async () => (await import("../../api/support/domain-fake")).domainFake());

/** Segunda, 26/10/2026, 12:00 em São Paulo. */
const NOW = new Date("2026-10-26T15:00:00.000Z");

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

function seedBoard() {
  const onboarding = seedTemplate("onboarding");
  const offboarding = seedTemplate("offboarding");

  const trigger = createTrigger({ name: "Contratados", journeyKind: "onboarding", entityTypeId: 2, categoryId: 0, stageId: "C0:WON", stageName: "Contratado", templateId: onboarding.id, fieldMap: {}, enabled: true, cursor: 1 });
  const detection = insertDetectionIfNew({ triggerId: trigger.id, entityTypeId: 2, entityId: 77, title: "Negócio #77", personName: "Ana Souza", personEmail: null, bitrixUserId: null, suggestedDate: null, crmUrl: null })!;
  const dismissed = insertDetectionIfNew({ triggerId: trigger.id, entityTypeId: 2, entityId: 78, title: "Negócio #78", personName: "Outro", personEmail: null, bitrixUserId: null, suggestedDate: null, crmUrl: null })!;
  updateDetection(dismissed.id, { status: "dismissed" });

  // D: pausada (sem cobranças), mas a tarefa sumida do Bitrix aparece.
  const paused = seedJourney({ person: seedBitrixPerson("52", "Paula Pausa"), template: onboarding, anchorDate: "2026-10-28", status: "paused" });
  const [, pausedMissing] = seedActivities([
    activityRow({ journeyId: paused.id, role: "rh", dueAt: "2026-10-20T18:00:00-03:00" }),
    activityRow({ journeyId: paused.id, role: "ti", bitrixTaskId: "300", bitrixMissing: true, dueAt: "2026-10-30T18:00:00-03:00" }),
  ]);

  // A: candidata sem conta no Bitrix com atividade do colaborador liberada.
  const noAccount = seedJourney({ person: seedManualPerson("Carla Nova"), template: onboarding, anchorDate: "2026-10-30" });
  seedActivities([activityRow({ journeyId: noAccount.id, role: "colaborador", visibility: "employee", dueAt: "2026-10-27T18:00:00-03:00" })]);

  // B: uma jornada com cada tipo de linha.
  const busy = seedJourney({ person: seedBitrixPerson("50", "Bruno Lima"), template: onboarding, anchorDate: "2026-11-03" });
  const [risk, hrToday, hrLate, approval, syncError] = seedActivities([
    activityRow({ journeyId: busy.id, role: "ti", assigneeName: "Diego Araújo", dueAt: "2026-10-24T18:00:00-03:00" }),
    activityRow({ journeyId: busy.id, role: "rh", dueAt: "2026-10-26T18:00:00-03:00" }),
    activityRow({ journeyId: busy.id, role: "rh", status: "in_progress", assigneeName: "Marina", dueAt: "2026-10-25T10:00:00-03:00" }),
    activityRow({ journeyId: busy.id, role: "gestor", status: "awaiting_approval", assigneeName: "Gil Gestor", dueAt: "2026-10-29T18:00:00-03:00" }),
    activityRow({
      journeyId: busy.id,
      role: "ti",
      syncState: "error",
      syncError: "Bitrix recusou em https://empresa.bitrix24.com.br/rest/1/segredo99/ (ACCESS_DENIED)",
      dueAt: "2026-10-23T18:00:00-03:00",
    }),
    activityRow({ journeyId: busy.id, role: "ti", dueAt: "2026-10-30T18:00:00-03:00" }),
    activityRow({ journeyId: busy.id, role: "rh", dueAt: "2026-10-28T18:00:00-03:00" }),
    activityRow({ journeyId: busy.id, role: "gestor", required: false, dueAt: "2026-10-20T18:00:00-03:00" }),
    activityRow({ journeyId: busy.id, role: "rh", status: "locked", dueAt: "2026-10-20T18:00:00-03:00" }),
    activityRow({ journeyId: busy.id, role: "ti", status: "done", dueAt: "2026-10-20T18:00:00-03:00" }),
  ]);

  const leaving = seedJourney({ person: seedBitrixPerson("51", "Diego Saída"), template: offboarding, anchorDate: "2026-11-05" });
  const later = seedJourney({ person: seedBitrixPerson("53", "Fábio Futuro"), template: onboarding, anchorDate: "2026-12-30" });
  seedJourney({ person: seedBitrixPerson("54", "Concluída"), template: onboarding, anchorDate: "2026-10-27", status: "completed" });

  return { detection, paused, pausedMissing: pausedMissing!, noAccount, busy, risk: risk!, hrToday: hrToday!, hrLate: hrLate!, approval: approval!, syncError: syncError!, leaving, later };
}

describe("painel de hoje", () => {
  it("monta as linhas certas, atrasadas primeiro e depois as mais próximas", () => {
    const seeded = seedBoard();
    const user = createUser({ name: "Marina Souza", email: "marina@empresa.com.br", passwordHash: "x", role: "rh" });
    const today = buildToday(user, NOW);

    expect(today.board.map((row) => row.id)).toEqual([
      `risk:${seeded.risk.id}`,
      `hr:${seeded.hrLate.id}`,
      `detection:${seeded.detection.id}`,
      `sync:${seeded.pausedMissing.id}`,
      `sync:${seeded.syncError.id}`,
      `hr:${seeded.hrToday.id}`,
      `missing:${seeded.noAccount.id}`,
      `approval:${seeded.approval.id}`,
    ]);

    const byId = new Map(today.board.map((row) => [row.id, row]));
    expect(byId.get(`risk:${seeded.risk.id}`)).toEqual({
      id: `risk:${seeded.risk.id}`,
      kind: "risk",
      when: { label: "Há 2 dias", at: seeded.risk.dueAt, overdue: true },
      who: { name: "Bruno Lima", journeyId: seeded.busy.id, kind: "onboarding" },
      what: seeded.risk.title,
      reason: "Diego Araújo ainda não concluiu.",
      status: { tone: "late", label: "Atrasada" },
      action: { type: "nudge", label: "Cobrar TI", targetId: seeded.risk.id },
    });
    expect(byId.get(`hr:${seeded.hrLate.id}`)).toMatchObject({ when: { label: "Ontem", overdue: true }, status: { tone: "late" }, action: { type: "open_activity", label: "Abrir" } });
    expect(byId.get(`detection:${seeded.detection.id}`)).toMatchObject({
      kind: "detection",
      when: { label: "Agora", at: NOW.toISOString(), overdue: false },
      who: { name: "Ana Souza", journeyId: null, kind: "onboarding" },
      what: "Entrada detectada no Bitrix24",
      reason: 'Gatilho "Contratados" · etapa Contratado',
      status: { tone: "info", label: "Nova" },
      action: { type: "start_journey", label: "Iniciar jornada", targetId: seeded.detection.id },
    });
    expect(byId.get(`sync:${seeded.pausedMissing.id}`)).toMatchObject({ status: { tone: "attention", label: "Sumiu do Bitrix24" }, action: { type: "resolve_sync", label: "Ver detalhe" } });
    const syncRow = byId.get(`sync:${seeded.syncError.id}`)!;
    expect(syncRow.reason).toContain("[redacted]");
    expect(syncRow.reason).not.toContain("segredo99");
    expect(byId.get(`hr:${seeded.hrToday.id}`)).toMatchObject({ when: { label: "Hoje, 18:00", overdue: false }, status: { tone: "attention", label: "Vence hoje" } });
    expect(byId.get(`missing:${seeded.noAccount.id}`)).toMatchObject({
      kind: "missing_data",
      when: { label: "Amanhã, 18:00" },
      who: { name: "Carla Nova" },
      action: { type: "link_person", label: "Vincular conta", targetId: seeded.noAccount.id },
    });
    expect(byId.get(`approval:${seeded.approval.id}`)).toMatchObject({
      when: { label: "29/10", overdue: false },
      reason: "Gil Gestor concluiu e aguarda aprovação.",
      status: { tone: "attention", label: "Aguardando aprovação" },
      action: { type: "approve", label: "Aprovar", targetId: seeded.approval.id },
    });
  });

  it("conta ações, chegadas e saídas dos próximos 14 dias e lista as linhas mais próximas", () => {
    const seeded = seedBoard();
    const user = createUser({ name: "Marina Souza", email: "marina@empresa.com.br", passwordHash: "x", role: "rh" });
    const today = buildToday(user, NOW);

    expect(today.date).toBe("2026-10-26");
    expect(today.greetingName).toBe("Marina");
    expect(today.counters).toEqual({ actions: 8, arriving: 2, leaving: 1 });
    expect(today.upcoming).toEqual([
      { journeyId: seeded.noAccount.id, personName: "Carla Nova", kind: "onboarding", anchorDate: "2026-10-30", daysUntil: 4 },
      { journeyId: seeded.busy.id, personName: "Bruno Lima", kind: "onboarding", anchorDate: "2026-11-03", daysUntil: 8 },
      { journeyId: seeded.leaving.id, personName: "Diego Saída", kind: "offboarding", anchorDate: "2026-11-05", daysUntil: 10 },
    ]);
    expect(today.lines.map((line) => line.person.name)).toEqual(["Carla Nova", "Bruno Lima", "Diego Saída", "Fábio Futuro"]);
    expect(today.lines[1]).toMatchObject({ status: "active", risk: "critical", templateName: "Onboarding Geral" });
    expect(today.sync).toEqual({ connected: false, lastCycleAt: null, lastError: null, rateLimitedUntil: null, queued: 0 });
  });

  it("sem pendências o painel fica vazio", () => {
    const user = createUser({ name: "Rita", email: "rita@empresa.com.br", passwordHash: "x", role: "rh" });
    expect(buildToday(user, NOW)).toMatchObject({ board: [], lines: [], upcoming: [], counters: { actions: 0, arriving: 0, leaving: 0 } });
  });
});
