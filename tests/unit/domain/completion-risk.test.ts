import { describe, expect, it } from "vitest";
import { completionCheck, journeyProgress } from "@/server/domain/completion";
import { isOverdue, journeyRisk, nextStop } from "@/server/domain/risk";
import { makeActivity, makeJourney, makeLedger } from "../../fakes/builders";

const now = new Date("2026-10-30T12:00:00Z");

describe("journeyProgress", () => {
  it("ignora atividades canceladas no total", () => {
    const activities = [makeActivity({ status: "done" }), makeActivity({ status: "open" }), makeActivity({ status: "cancelled" })];
    expect(journeyProgress(activities)).toEqual({ done: 1, total: 2, percent: 50 });
    expect(journeyProgress([])).toEqual({ done: 0, total: 0, percent: 0 });
  });
});

describe("completionCheck", () => {
  it("libera a conclusão quando só sobram opcionais", () => {
    const activities = [makeActivity({ status: "done" }), makeActivity({ status: "open", required: false })];
    expect(completionCheck(makeJourney(), activities, [])).toEqual({ ok: true, blockers: [] });
  });

  it("lista até 3 obrigatórias pendentes e resume o resto", () => {
    const titles = ["A", "B", "C", "D", "E"];
    const activities = titles.map((title) => makeActivity({ title, status: title === "E" ? "locked" : "open" }));
    const result = completionCheck(makeJourney(), activities, []);
    expect(result.ok).toBe(false);
    expect(result.blockers).toEqual(["Conclua as atividades obrigatórias: A, B, C e mais 2."]);
    expect(completionCheck(makeJourney(), activities.slice(0, 2), []).blockers).toEqual(["Conclua as atividades obrigatórias: A e B."]);
  });

  it("aponta aprovações pendentes", () => {
    const activities = [makeActivity({ title: "Assinar termo", status: "awaiting_approval" })];
    expect(completionCheck(makeJourney(), activities, []).blockers).toEqual(["Aprove “Assinar termo”, que aguarda aprovação no Bitrix24."]);
  });

  it("na saída, o inventário com a pessoa bloqueia; dispensado e encerrado não", () => {
    const journey = makeJourney({ kind: "offboarding" });
    const ledger = [makeLedger({ status: "active" }), makeLedger({ status: "return_requested" }), makeLedger({ status: "waived" })];
    const result = completionCheck(journey, [makeActivity({ status: "done" })], ledger);
    expect(result).toEqual({ ok: false, blockers: ["2 itens do inventário ainda com a pessoa."] });
    expect(completionCheck(journey, [], [makeLedger({ status: "active" })]).blockers).toEqual(["1 item do inventário ainda com a pessoa."]);
    // Na entrada o inventário não bloqueia.
    expect(completionCheck(makeJourney(), [], ledger).ok).toBe(true);
  });

  it("não deixa concluir de novo nem concluir cancelada", () => {
    expect(completionCheck(makeJourney({ status: "completed" }), [], []).ok).toBe(false);
    expect(completionCheck(makeJourney({ status: "cancelled" }), [], []).blockers[0]).toMatch(/cancelada/);
  });
});

describe("prazos e risco", () => {
  it("atrasada = não feita e com prazo vencido", () => {
    expect(isOverdue(makeActivity({ dueAt: "2026-10-29T18:00:00-03:00" }), now)).toBe(true);
    expect(isOverdue(makeActivity({ dueAt: "2026-10-29T18:00:00-03:00", status: "done" }), now)).toBe(false);
    expect(isOverdue(makeActivity({ dueAt: "2026-10-31T18:00:00-03:00" }), now)).toBe(false);
  });

  it("crítico com obrigatória atrasada, atenção com prazo em 48 h ou erro de sincronização", () => {
    const later = "2026-11-20T18:00:00-03:00";
    expect(journeyRisk([makeActivity({ dueAt: "2026-10-29T18:00:00-03:00" })], now)).toBe("critical");
    expect(journeyRisk([makeActivity({ dueAt: "2026-10-29T18:00:00-03:00", required: false })], now)).toBe("attention");
    expect(journeyRisk([makeActivity({ dueAt: "2026-10-31T18:00:00-03:00" })], now)).toBe("attention");
    expect(journeyRisk([makeActivity({ dueAt: later, syncState: "error" })], now)).toBe("attention");
    expect(journeyRisk([makeActivity({ dueAt: later, bitrixMissing: true })], now)).toBe("attention");
    expect(journeyRisk([makeActivity({ dueAt: later })], now)).toBe("ok");
    expect(journeyRisk([makeActivity({ dueAt: "2026-10-01T18:00:00-03:00", status: "done" })], now)).toBe("ok");
  });

  it("próxima parada: atividade aberta mais próxima ou a próxima etapa por data", () => {
    const journey = makeJourney();
    const open = [
      makeActivity({ title: "Depois", dueAt: "2026-11-05T18:00:00-03:00" }),
      makeActivity({ title: "Antes", dueAt: "2026-10-31T18:00:00-03:00", status: "in_progress" }),
    ];
    expect(nextStop(journey, open, "America/Sao_Paulo", now)).toEqual({ label: "Antes", at: "2026-10-31T18:00:00-03:00" });
    const waiting = [
      makeActivity({ stagePosition: 0, status: "done" }),
      makeActivity({ stagePosition: 1, status: "locked", releasedAt: null }),
      makeActivity({ stagePosition: 2, status: "locked", releasedAt: null }),
    ];
    expect(nextStop(journey, waiting, "America/Sao_Paulo", now)).toEqual({ label: "Primeiro dia", at: "2026-11-02T08:00:00-03:00" });
    expect(nextStop(makeJourney({ status: "completed" }), open, "America/Sao_Paulo", now)).toBeNull();
  });
});
