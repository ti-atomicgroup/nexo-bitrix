import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getDetection, listDetections } from "@/server/db/repos/detections";
import { getJourney } from "@/server/db/repos/journeys";
import { createTrigger, getTrigger } from "@/server/db/repos/triggers";
import { createJourney, currentStageHistoryCursor, listCrmSources } from "@/server/engine";
import { forgetCrmSourcesForTests } from "@/server/engine/triggers";
import { createTriggerFromInput } from "@/server/services/read/triggers";
import { activityByTitle, cycle, HR_ACTOR, prepare, setupEngine, templateId, type EngineEnv } from "../fakes/engine-setup";

let env: EngineEnv;
beforeEach(() => {
  forgetCrmSourcesForTests();
  env = setupEngine();
});
afterEach(() => env.cleanup());

function leadTrigger(cursor: number | null = null) {
  return createTrigger({
    name: "Lead contratado",
    journeyKind: "onboarding",
    entityTypeId: 1,
    categoryId: null,
    stageId: "HIRED",
    templateId: templateId("Onboarding · Geral"),
    fieldMap: { date: "ufCrmInicio", email: "email" },
    enabled: true,
    cursor,
  });
}

describe("gatilhos do CRM", () => {
  it("o cursor começa no maior ID (não reprocessa o passado) e cria uma detecção por registro (lead via STATUS_ID)", async () => {
    await prepare();
    env.fake.addCrmItem(1, { id: 5, title: "Antigo", stageId: "NEW" });
    env.fake.moveCrmItem(1, 5, "HIRED");
    expect(await currentStageHistoryCursor(1)).toBe(2);
    const trigger = leadTrigger();
    await cycle();
    expect(getTrigger(trigger.id)?.cursor).toBe(2);
    expect(listDetections()).toHaveLength(0);

    env.fake.addCrmItem(1, {
      id: 6,
      title: "Contratação de Ana",
      stageId: "NEW",
      fields: { name: "Ana", lastName: "Souza", ufCrmInicio: "2026-11-03T00:00:00+03:00", email: [{ value: "Ana@Empresa.test", valueType: "WORK" }] },
    });
    env.fake.moveCrmItem(1, 6, "HIRED");
    await cycle();
    const [detection] = listDetections();
    expect(detection).toMatchObject({
      triggerId: trigger.id,
      entityTypeId: 1,
      entityId: 6,
      title: "Contratação de Ana",
      personName: "Ana Souza",
      personEmail: "ana@empresa.test",
      suggestedDate: "2026-11-03",
      crmUrl: `${env.fake.portal}/crm/lead/details/6/`,
      status: "pending",
    });
    expect(getTrigger(trigger.id)).toMatchObject({ cursor: 4, lastError: null });
    expect(getTrigger(trigger.id)?.lastRunAt).not.toBeNull();

    // Sai e volta para a etapa: continua uma detecção só.
    env.fake.moveCrmItem(1, 6, "NEW");
    env.fake.moveCrmItem(1, 6, "HIRED");
    await cycle();
    expect(listDetections()).toHaveLength(1);
  });

  it("negócio no funil com prefixo e nome vindo do contato; registro criado direto na etapa também conta", async () => {
    await prepare();
    env.fake.addCrmItem(3, { id: 40, title: "Contato", stageId: "", fields: { name: "Bruno", lastName: "Lima" }, history: false });
    createTrigger({
      name: "Negócio ganho",
      journeyKind: "onboarding",
      entityTypeId: 2,
      categoryId: 3,
      stageId: "C3:WON",
      templateId: templateId("Onboarding · Vendas"),
      fieldMap: {},
      enabled: true,
      cursor: 0,
    });
    env.fake.addCrmItem(2, { id: 77, title: "Vaga de vendas", stageId: "C3:WON", categoryId: 3, fields: { contactId: 40 } });
    env.fake.addCrmItem(2, { id: 78, title: "Outro funil", stageId: "WON", categoryId: 0 });
    await cycle();
    expect(listDetections().map((detection) => [detection.entityId, detection.personName, detection.crmUrl])).toEqual([[77, "Bruno Lima", `${env.fake.portal}/crm/deal/details/77/`]]);
  });

  it("iniciar pela detecção é idempotente, marca a detecção e liga as tarefas ao registro do CRM", async () => {
    await prepare();
    const trigger = leadTrigger(0);
    env.fake.addCrmItem(1, { id: 9, title: "Ana", stageId: "HIRED", fields: { name: "Ana", lastName: "Souza" } });
    await cycle();
    const [detection] = listDetections();
    const input = {
      requestId: randomUUID(),
      kind: "onboarding" as const,
      person: { name: "Ana Souza" },
      templateId: trigger.templateId,
      anchorDate: "2026-11-02",
      participants: {},
      detectionId: detection!.id,
    };
    const { id } = createJourney(input, HR_ACTOR);
    expect(createJourney({ ...input, requestId: randomUUID() }, HR_ACTOR).id).toBe(id);
    expect(getDetection(detection!.id)).toMatchObject({ status: "started", journeyId: id });
    expect(getJourney(id)).toMatchObject({ sourceType: "trigger", sourceKey: "crm:1:9", sourceLabel: "Lead contratado", crmBinding: "L_9", crmUrl: `${env.fake.portal}/crm/lead/details/9/` });
    await cycle();
    const task = env.fake.tasks.get(Number(activityByTitle(id, "Preparar acessos").bitrixTaskId));
    expect(task?.ufCrmTask).toEqual(["L_9"]);
  });

  it("descobre as fontes do CRM ao vivo", async () => {
    await prepare();
    env.fake.statuses.set("STATUS", [{ id: "HIRED", name: "Contratado" }]);
    const sources = await listCrmSources();
    expect(sources[0]).toMatchObject({ entityTypeId: 1, kind: "lead", categories: [{ id: null, name: "Leads", stages: [{ id: "HIRED", name: "Contratado" }] }] });
  });

  it("salvar a automação reaproveita os funis lidos pela tela, sem reler o CRM inteiro", async () => {
    await prepare();
    env.fake.statuses.set("STATUS", [{ id: "HIRED", name: "Contratado" }]);
    await listCrmSources();
    const readsBefore = env.fake.countCalls("crm.type.list");
    const trigger = await createTriggerFromInput(
      { name: "Lead contratado", journeyKind: "onboarding", entityTypeId: 1, categoryId: null, stageId: "HIRED", templateId: templateId("Onboarding · Geral"), fieldMap: {}, enabled: true },
      HR_ACTOR,
    );
    expect(env.fake.countCalls("crm.type.list")).toBe(readsBefore);
    expect(trigger).toMatchObject({ sourceName: "Leads", stageName: "Contratado" });
  });

  it("um gatilho com erro registra o erro e não impede os outros", async () => {
    await prepare();
    // Ordem alfabética: "Admissões antigas" roda antes e recebe a falha injetada.
    const broken = createTrigger({ name: "Admissões antigas", journeyKind: "onboarding", entityTypeId: 999, categoryId: null, stageId: "X", templateId: templateId("Onboarding · Geral"), fieldMap: {}, enabled: true, cursor: 0 });
    const ok = leadTrigger(0);
    env.fake.failNext("crm.stagehistory.list", "denied");
    env.fake.addCrmItem(1, { id: 11, title: "Lead", stageId: "HIRED" });
    const report = await cycle();
    expect(report.errors).toEqual(["Gatilhos do CRM: O Bitrix24 negou a operação. Revise as permissões do webhook."]);
    expect(getTrigger(broken.id)?.lastError).toBe("O Bitrix24 negou a operação. Revise as permissões do webhook.");
    expect(getTrigger(ok.id)?.lastError).toBeNull();
    expect(listDetections()).toHaveLength(1);
  });
});
