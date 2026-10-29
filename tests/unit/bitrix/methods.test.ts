import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createBitrixClient, type BitrixClient } from "@/server/bitrix/client";
import {
  addChecklist,
  checkWebhook,
  createPrivateProject,
  createTask,
  findGroupByName,
  getChecklists,
  getCrmItem,
  listActiveUsers,
  listCrmSources,
  listStageHistory,
  listTasksByIds,
  listTasksCreatedSince,
  maxStageHistoryId,
  setChecklistItemDone,
} from "@/server/bitrix/methods";
import { resetLimiterForTests } from "@/server/bitrix/limiter";
import { parseWebhookUrl } from "@/server/bitrix/webhook-url";
import { FakeBitrix } from "../../fakes/fake-bitrix";

let fake: FakeBitrix;
let client: BitrixClient;

beforeEach(() => {
  resetLimiterForTests();
  fake = new FakeBitrix();
  fake.addUser({ id: 11, name: "Diego", lastName: "TI", position: "Suporte" });
  fake.addUser({ id: 12, name: "Ana", lastName: "Souza" });
  fake.addUser({ id: 30, name: "Ex", lastName: "Colaborador", active: false });
  fake.addUser({ id: 40, name: "Parceiro", userType: "extranet" });
  client = createBitrixClient({ credentials: parseWebhookUrl(fake.webhookUrl()), transport: fake.asFetch(), sleep: async () => undefined, log: () => undefined });
});
afterEach(() => resetLimiterForTests());

describe("conexão e pessoas", () => {
  it("confere o webhook: dono ativo e escopos", async () => {
    const check = await checkWebhook(client);
    expect(check.owner).toEqual({ bitrixUserId: "1", name: "Marina RH", position: "Analista de RH" });
    expect(check.scopes).toContain("task");
  });

  it("recusa webhook de conta inativa", async () => {
    fake.users.get(1)!.active = false;
    await expect(checkWebhook(client)).rejects.toMatchObject({ code: "WEBHOOK_USER_INACTIVE" });
  });

  it("lista colaboradores ativos (sem extranet) e, se pedido, os desligados", async () => {
    const active = await listActiveUsers(client);
    expect(active.map((user) => user.bitrixUserId)).toEqual(["1", "11", "12"]);
    expect(active[1]).toMatchObject({ name: "Diego TI", position: "Suporte", active: true });
    const all = await listActiveUsers(client, { includeInactive: true });
    expect(all.find((user) => user.bitrixUserId === "30")?.active).toBe(false);
  });

  it("pagina usuários de 50 em 50", async () => {
    for (let id = 100; id < 160; id++) fake.addUser({ id, name: `Pessoa${id}` });
    expect((await listActiveUsers(client)).length).toBe(63);
  });
});

describe("projeto e tarefas", () => {
  it("procura o projeto pelo nome antes de criar um privado", async () => {
    expect(await findGroupByName(client, "Nexo · Jornadas")).toBeNull();
    const id = await createPrivateProject(client, { name: "Nexo · Jornadas", description: "Tarefas do Nexo" });
    expect(fake.groups.get(Number(id))).toMatchObject({ project: true, visible: false, opened: false, initiatePerms: "E" });
    expect(await findGroupByName(client, "nexo · jornadas")).toEqual({ id, name: "Nexo · Jornadas" });
  });

  it("cria tarefa com XML_ID, grupo, observadores, prazo com fuso e controle desligado", async () => {
    const id = await createTask(client, {
      title: "Ana Souza · Onboarding — Criar acessos",
      description: "[B]Pessoa:[/B] Ana",
      responsibleId: "11",
      auditors: ["1", "11", "12"],
      deadline: "2026-10-28T18:00:00-03:00",
      groupId: "10",
      xmlId: "nexo:a1",
      requiresApproval: false,
      crmBindings: ["D_7"],
    });
    expect(fake.tasks.get(Number(id))).toMatchObject({
      responsibleId: 11,
      auditors: [1, 12],
      deadline: "2026-10-28T18:00:00-03:00",
      groupId: 10,
      xmlId: "nexo:a1",
      taskControl: "N",
      allowChangeDeadline: "Y",
      ufCrmTask: ["D_7"],
    });
    const [task] = await listTasksByIds(client, [id, "999"]);
    expect(task).toMatchObject({ id, status: 2, deadline: "2026-10-28T18:00:00-03:00", responsibleId: "11", groupId: "10", xmlId: "nexo:a1", closedDate: null });
    const listCall = fake.calls.find((call) => call.method === "tasks.task.list");
    expect(listCall?.params.select).toEqual(["ID", "STATUS", "DEADLINE", "RESPONSIBLE_ID", "CLOSED_DATE", "GROUP_ID", "XML_ID", "TITLE"]);
    const recent = await listTasksCreatedSince(client, "10", "2000-01-01");
    expect(recent.map((item) => item.xmlId)).toEqual(["nexo:a1"]);
  });

  it("consulta IDs em blocos de 50", async () => {
    const ids: string[] = [];
    for (let index = 0; index < 60; index++) {
      ids.push(await createTask(client, { title: `T${index}`, description: "", responsibleId: "11", auditors: [], deadline: "2026-10-28T18:00:00-03:00", groupId: "10", xmlId: `nexo:${index}`, requiresApproval: true }));
    }
    fake.calls = [];
    expect((await listTasksByIds(client, ids)).length).toBe(60);
    expect(fake.countCalls("tasks.task.list")).toBe(2);
  });
});

describe("checklists", () => {
  it("cria a raiz e os filhos num lote, lê e marca itens", async () => {
    const taskId = await createTask(client, { title: "T", description: "", responsibleId: "11", auditors: [], deadline: "2026-10-28T18:00:00-03:00", groupId: "10", xmlId: "nexo:a", requiresApproval: false });
    const { rootId, itemIds, errors } = await addChecklist(client, taskId, "Checklist", [
      { key: "google", text: "Criar conta Google", done: false },
      { key: "notebook", text: "Separar notebook", done: true },
    ]);
    expect(errors).toEqual([]);
    expect(fake.countCalls("batch")).toBe(1);
    const items = fake.checklistOf(taskId);
    expect(items.find((item) => String(item.id) === rootId)).toMatchObject({ parentId: 0, title: "Checklist" });
    expect(items.filter((item) => item.parentId === Number(rootId)).map((item) => [item.title, item.done])).toEqual([
      ["Criar conta Google", false],
      ["Separar notebook", true],
    ]);
    await setChecklistItemDone(client, taskId, itemIds.google!, true);
    const checklists = await getChecklists(client, [taskId, "999"]);
    expect(Object.keys(checklists)).toEqual([taskId]);
    expect(checklists[taskId]?.find((item) => item.id === itemIds.google)).toMatchObject({ parentId: rootId, done: true });
    expect(checklists[taskId]?.find((item) => item.id === rootId)?.parentId).toBe("0");
  });
});

describe("CRM", () => {
  beforeEach(() => {
    fake.statuses.set("STATUS", [
      { id: "NEW", name: "Novo" },
      { id: "HIRED", name: "Contratado" },
    ]);
    fake.categories.set(2, [
      { id: 0, name: "Geral" },
      { id: 3, name: "Recrutamento" },
    ]);
    fake.statuses.set("DEAL_STAGE", [{ id: "NEW", name: "Novo" }]);
    fake.statuses.set("DEAL_STAGE_3", [{ id: "C3:WON", name: "Contratado" }]);
    fake.crmTypes.push({ id: 1, entityTypeId: 130, title: "Admissões" });
    fake.categories.set(130, [{ id: 7, name: "Padrão" }]);
    fake.statuses.set("DYNAMIC_130_STAGE_7", [{ id: "DT130_7:SUCCESS", name: "Admitido" }]);
    fake.crmFields.set(130, { title: { type: "string", title: "Nome" }, ufCrm5Inicio: { type: "date", title: "Início" } });
  });

  it("descobre leads, funis de negócio e processos inteligentes com etapas e campos", async () => {
    const sources = await listCrmSources(client);
    expect(sources.map((source) => [source.entityTypeId, source.kind, source.name])).toEqual([
      [1, "lead", "Leads"],
      [2, "deal", "Negócios"],
      [130, "smart_process", "Admissões"],
    ]);
    expect(sources[0]?.categories).toEqual([{ id: null, name: "Leads", stages: [{ id: "NEW", name: "Novo" }, { id: "HIRED", name: "Contratado" }] }]);
    expect(sources[1]?.categories[1]).toEqual({ id: 3, name: "Recrutamento", stages: [{ id: "C3:WON", name: "Contratado" }] });
    expect(sources[2]?.categories[0]?.stages).toEqual([{ id: "DT130_7:SUCCESS", name: "Admitido" }]);
    expect(sources[2]?.fields).toContainEqual({ id: "ufCrm5Inicio", name: "Início", type: "date" });
  });

  it("lê funis, etapas e campos em lote: muitos processos inteligentes não multiplicam as chamadas", async () => {
    for (let index = 0; index < 60; index++) {
      const entityTypeId = 200 + index;
      fake.crmTypes.push({ id: 10 + index, entityTypeId, title: `Processo ${index}` });
      fake.categories.set(entityTypeId, [{ id: 1, name: "Padrão" }]);
      fake.statuses.set(`DYNAMIC_${entityTypeId}_STAGE_1`, [{ id: `DT${entityTypeId}_1:NEW`, name: "Novo" }]);
    }
    const sources = await listCrmSources(client);
    expect(sources).toHaveLength(63);
    expect(sources.at(-1)?.categories[0]?.stages).toEqual([{ id: "DT259_1:NEW", name: "Novo" }]);
    // 2 páginas de crm.type.list + lotes de 50 (funis e campos de 62 entidades; etapas de 63 funis): antes eram ~190 chamadas.
    const requests = fake.countCalls("batch") + fake.countCalls("crm.type.list");
    expect(requests).toBeLessThanOrEqual(8);
  });

  it("lê o histórico depois do cursor (lead com STATUS_ID) e o maior ID", async () => {
    expect(await maxStageHistoryId(client, 1)).toBeNull();
    fake.addCrmItem(1, { id: 5, title: "Ana", stageId: "NEW" });
    fake.moveCrmItem(1, 5, "HIRED");
    fake.addCrmItem(2, { id: 9, title: "Negócio", stageId: "C3:NEW", categoryId: 3 });
    expect(await maxStageHistoryId(client, 1)).toBe(2);
    const entries = await listStageHistory(client, 1, 1);
    expect(entries).toEqual([expect.objectContaining({ id: 2, ownerId: 5, stageId: "HIRED", typeId: 2 })]);
    expect(await getCrmItem(client, 1, 5)).toMatchObject({ id: 5, title: "Ana", stageId: "HIRED" });
    expect(await getCrmItem(client, 1, 404)).toBeNull();
  });
});
