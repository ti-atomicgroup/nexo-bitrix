import { describe, expect, it } from "vitest";
import { computeActivities, missingAssigneeMessage, resolveAssignee } from "@/server/domain/activities";
import type { UserRef } from "@/shared/contracts";
import { sampleOnboarding } from "../../fakes/builders";

const ref = (bitrixUserId: string, name: string): UserRef => ({ bitrixUserId, name, position: null });
const participants = { rh: ref("10", "Rita RH"), gestor: ref("13", "Bruno Gestor"), ti: ref("11", "Diego TI") };

describe("computeActivities", () => {
  it("gera atividades bloqueadas, com prazo no fuso e checklist pronto para sincronizar", () => {
    let counter = 0;
    const { activities, missingRoles } = computeActivities({
      journeyId: "j1",
      template: sampleOnboarding(),
      anchorDate: "2026-11-02",
      timezone: "America/Sao_Paulo",
      participants,
      person: { bitrixUserId: "12", name: "Ana Souza" },
      newId: () => `a${++counter}`,
    });
    expect(missingRoles).toEqual([]);
    expect(activities).toHaveLength(5);
    const [it0, colaborador, rh, meeting] = activities;
    expect(it0).toMatchObject({
      id: "a1",
      journeyId: "j1",
      stagePosition: 0,
      position: 0,
      title: "Criar acessos",
      role: "ti",
      assigneeBitrixId: "11",
      assigneeName: "Diego TI",
      dueAt: "2026-10-28T18:00:00-03:00",
      status: "locked",
      syncState: "local",
      releasedAt: null,
      bitrixTaskId: null,
    });
    expect(it0?.checklist[0]).toEqual({
      key: "google",
      text: "Criar conta Google Workspace",
      done: false,
      bitrixItemId: null,
      ledger: { kind: "access", name: "Google Workspace" },
    });
    expect(colaborador).toMatchObject({ role: "colaborador", assigneeBitrixId: "12", assigneeName: "Ana Souza", visibility: "employee" });
    expect(rh).toMatchObject({ assigneeBitrixId: "10", required: false, visibility: "hr" });
    expect(meeting).toMatchObject({ kind: "meeting", dueAt: "2026-11-02T10:00:00-03:00", stagePosition: 1 });
  });

  it("deixa a atividade do colaborador sem responsável quando a pessoa não tem conta", () => {
    const { activities, missingRoles } = computeActivities({
      journeyId: "j1",
      template: sampleOnboarding(),
      anchorDate: "2026-11-02",
      timezone: "America/Sao_Paulo",
      participants,
      person: { bitrixUserId: null, name: "Ana Souza" },
    });
    expect(activities.find((activity) => activity.role === "colaborador")?.assigneeBitrixId).toBeNull();
    expect(missingRoles).toEqual([]);
  });

  it("aponta os papéis sem responsável", () => {
    const { missingRoles } = computeActivities({
      journeyId: "j1",
      template: sampleOnboarding(),
      anchorDate: "2026-11-02",
      timezone: "America/Sao_Paulo",
      participants: { rh: participants.rh },
      person: { bitrixUserId: "12", name: "Ana Souza" },
    });
    expect(missingRoles).toEqual(["gestor", "ti"]);
    expect(missingAssigneeMessage(["ti"])).toBe("Escolha quem faz as tarefas de TI.");
    expect(missingAssigneeMessage(["gestor", "ti"])).toBe("Escolha quem faz as tarefas do gestor e de TI.");
  });
});

describe("resolveAssignee", () => {
  it("usa gestor e depois RH quando falta buddy; outro vai para o RH", () => {
    const person = { bitrixUserId: "12", name: "Ana" };
    expect(resolveAssignee("buddy", participants, person)?.bitrixUserId).toBe("13");
    expect(resolveAssignee("buddy", { rh: participants.rh }, person)?.bitrixUserId).toBe("10");
    expect(resolveAssignee("buddy", { ...participants, buddy: ref("14", "Carla") }, person)?.bitrixUserId).toBe("14");
    expect(resolveAssignee("outro", participants, person)?.bitrixUserId).toBe("10");
    expect(resolveAssignee("colaborador", participants, person)?.bitrixUserId).toBe("12");
  });
});
