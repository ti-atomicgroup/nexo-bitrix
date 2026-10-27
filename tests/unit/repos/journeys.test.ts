import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getActivity, insertActivities, listActivities, listActivitiesToPush, listOpenTaskActivities, updateActivity, type ActivityRow } from "@/server/db/repos/activities";
import { getDetection, insertDetectionIfNew, updateDetection } from "@/server/db/repos/detections";
import { findJourneyBySourceKey, getJourney, insertJourney, listJourneys, updateJourney } from "@/server/db/repos/journeys";
import { findLedgerByGrant, insertLedgerItem, listActiveLedger, updateLedgerItem } from "@/server/db/repos/ledger";
import { createPerson, findPersonByBitrixId, linkPersonToBitrix, searchPeople, upsertBitrixPeople } from "@/server/db/repos/people";
import { archiveTemplate, countTemplates, createTemplate, getTemplate, listTemplates, updateTemplate } from "@/server/db/repos/templates";
import { createTrigger, listTriggers, updateTrigger } from "@/server/db/repos/triggers";
import { templateInput } from "@/shared/schemas";
import { useTestDb } from "../../support/db";

let cleanup: () => void;
beforeEach(() => {
  cleanup = useTestDb().cleanup;
});
afterEach(() => cleanup());

const sampleTemplate = templateInput.parse({
  kind: "onboarding",
  name: "Onboarding Vendas",
  profile: "Vendas",
  stages: [
    {
      name: "Antes do 1º dia",
      releaseMode: "start",
      activities: [
        {
          title: "Criar acessos",
          role: "ti",
          dueOffsetDays: -3,
          dueOffsetUnit: "business",
          checklist: [{ key: "google", text: "Criar conta Google Workspace", ledger: { kind: "access", name: "Google Workspace" } }],
        },
      ],
    },
    { name: "Primeiro mês", releaseMode: "after_previous", activities: [{ title: "1:1 de 30 dias", role: "gestor", kind: "meeting", dueOffsetDays: 30 }] },
  ],
});

function activity(overrides: Partial<ActivityRow>): ActivityRow {
  return {
    id: "a1",
    journeyId: "j1",
    stagePosition: 0,
    position: 0,
    templateActivityId: null,
    title: "Criar acessos",
    instructions: "",
    kind: "task",
    role: "ti",
    assigneeBitrixId: "11",
    assigneeName: "Diego",
    dueAt: "2026-10-28T18:00:00-03:00",
    required: true,
    visibility: "team",
    requiresApproval: false,
    ledgerRole: null,
    status: "open",
    checklist: [],
    links: [],
    documents: [],
    bitrixTaskId: null,
    bitrixStatus: null,
    bitrixMissing: false,
    checklistSyncedAt: null,
    syncState: "local",
    syncError: null,
    releasedAt: "2026-10-26T12:00:00.000Z",
    doneAt: null,
    doneSource: null,
    calendarEventId: null,
    lastNudgedAt: null,
    ...overrides,
  };
}

describe("trilhas", () => {
  it("grava e remonta etapas, atividades, checklist e alcance de prazos", () => {
    const template = createTemplate(sampleTemplate);
    const loaded = getTemplate(template.id)!;
    expect(loaded.stages.map((stage) => stage.name)).toEqual(["Antes do 1º dia", "Primeiro mês"]);
    expect(loaded.stages[0]?.activities[0]?.checklist[0]?.ledger).toEqual({ kind: "access", name: "Google Workspace" });
    expect(loaded.span).toEqual({ fromDays: -3, toDays: 30 });
    expect(listTemplates()[0]).toMatchObject({ stageCount: 2, activityCount: 2 });
  });

  it("incrementa a versão ao editar e esconde trilhas arquivadas", () => {
    const template = createTemplate(sampleTemplate);
    const updated = updateTemplate(template.id, { ...sampleTemplate, name: "Onboarding Comercial" })!;
    expect(updated.version).toBe(2);
    expect(updated.name).toBe("Onboarding Comercial");
    archiveTemplate(template.id);
    expect(listTemplates()).toHaveLength(0);
    expect(listTemplates({ includeArchived: true })).toHaveLength(1);
    expect(countTemplates()).toBe(1);
  });
});

describe("pessoas", () => {
  it("atualiza o cache do Bitrix e busca sem acento", () => {
    upsertBitrixPeople([
      { bitrixUserId: "11", name: "Diego Araújo", position: "TI", active: true },
      { bitrixUserId: "12", name: "Inativo", active: false },
    ]);
    upsertBitrixPeople([{ bitrixUserId: "11", name: "Diego Araújo", position: "Infraestrutura", active: true }]);
    expect(findPersonByBitrixId("11")?.position).toBe("Infraestrutura");
    expect(searchPeople("araujo").map((person) => person.name)).toEqual(["Diego Araújo"]);
    expect(searchPeople("inativo")).toHaveLength(0);
  });

  it("liga um candidato à conta criada depois e move as jornadas", () => {
    const candidate = createPerson({ name: "Ana Souza", email: "ana@exemplo.com", source: "crm" });
    upsertBitrixPeople([{ bitrixUserId: "50", name: "Ana Souza", active: true }]);
    const template = createTemplate(sampleTemplate);
    insertJourney({
      id: "j1",
      kind: "onboarding",
      personId: candidate.id,
      templateId: template.id,
      templateVersion: 1,
      snapshot: template,
      anchorDate: "2026-11-02",
      status: "active",
      offboardingReason: null,
      participants: {},
      sourceType: "manual",
      sourceKey: null,
      sourceLabel: null,
      crmBinding: null,
      crmUrl: null,
      createdBy: null,
    });
    const linked = linkPersonToBitrix(candidate.id, "50");
    expect(linked.bitrixUserId).toBe("50");
    expect(getJourney("j1")?.personId).toBe(linked.id);
  });
});

describe("jornadas e atividades", () => {
  function seedJourney() {
    const person = createPerson({ name: "Bruno Lima", source: "manual" });
    const template = createTemplate(sampleTemplate);
    return insertJourney({
      id: "j1",
      kind: "onboarding",
      personId: person.id,
      templateId: template.id,
      templateVersion: template.version,
      snapshot: template,
      anchorDate: "2026-10-27",
      status: "active",
      offboardingReason: null,
      participants: { ti: { bitrixUserId: "11", name: "Diego", position: null } },
      sourceType: "trigger",
      sourceKey: "crm:2:123",
      sourceLabel: "Negócio #123",
      crmBinding: "D_123",
      crmUrl: null,
      createdBy: null,
    });
  }

  it("guarda o snapshot e encontra pela origem", () => {
    const journey = seedJourney();
    expect(journey.snapshot.name).toBe("Onboarding Vendas");
    expect(findJourneyBySourceKey("crm:2:123")?.id).toBe("j1");
    expect(updateJourney("j1", { status: "paused" })?.status).toBe("paused");
    expect(listJourneys({ status: ["paused"] })).toHaveLength(1);
  });

  it("separa atividades a enviar das que já têm tarefa aberta", () => {
    seedJourney();
    insertActivities([
      activity({ id: "a1" }),
      activity({ id: "a2", status: "locked" }),
      activity({ id: "a3", bitrixTaskId: "900", syncState: "synced" }),
      activity({ id: "a4", assigneeBitrixId: null }),
    ]);
    expect(listActivitiesToPush().map((item) => item.id)).toEqual(["a1"]);
    expect(listOpenTaskActivities().map((item) => item.id)).toEqual(["a3"]);
    updateActivity("a3", { status: "done", doneSource: "bitrix", checklist: [{ key: "k", text: "t", done: true, bitrixItemId: "5", ledger: null }] });
    expect(getActivity("a3")?.checklist[0]?.done).toBe(true);
    expect(listOpenTaskActivities()).toHaveLength(0);
    expect(listActivities("j1").map((item) => item.id)).toEqual(["a1", "a2", "a3", "a4"]);
  });
});

describe("inventário, gatilhos e detecções", () => {
  it("cria um item por concessão e lista os ativos", () => {
    const person = createPerson({ name: "Bruno Lima", source: "manual" });
    const item = insertLedgerItem({ personId: person.id, kind: "access", name: "Google Workspace", status: "active", source: "onboarding", grantedActivityId: "a1", grantedItemKey: "google" });
    expect(findLedgerByGrant("a1", "google")?.id).toBe(item.id);
    expect(() => insertLedgerItem({ personId: person.id, kind: "access", name: "Dup", status: "active", source: "onboarding", grantedActivityId: "a1", grantedItemKey: "google" })).toThrow();
    expect(listActiveLedger(person.id)).toHaveLength(1);
    updateLedgerItem(item.id, { status: "closed", closedAt: "2026-10-30T12:00:00.000Z" });
    expect(listActiveLedger(person.id)).toHaveLength(0);
  });

  it("registra uma detecção por registro de CRM", () => {
    const trigger = createTrigger({ name: "Contratado", journeyKind: "onboarding", entityTypeId: 2, categoryId: 3, stageId: "C3:WON", templateId: "t1", fieldMap: {}, enabled: true, cursor: 120 });
    expect(listTriggers({ enabledOnly: true })[0]?.cursor).toBe(120);
    updateTrigger(trigger.id, { cursor: 130 });
    const detection = { triggerId: trigger.id, entityTypeId: 2, entityId: 77, title: "Ana Souza", personName: "Ana Souza", personEmail: null, bitrixUserId: null, suggestedDate: null, crmUrl: null };
    const first = insertDetectionIfNew(detection);
    expect(first?.status).toBe("pending");
    expect(insertDetectionIfNew(detection)).toBeNull();
    updateDetection(first!.id, { status: "started", journeyId: "j1" });
    expect(getDetection(first!.id)?.journeyId).toBe("j1");
  });
});
