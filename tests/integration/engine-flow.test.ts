import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getActivity, listActivities } from "@/server/db/repos/activities";
import { listAudit } from "@/server/db/repos/audit";
import { countJobs } from "@/server/db/repos/jobs";
import { getJourney } from "@/server/db/repos/journeys";
import { listLedger } from "@/server/db/repos/ledger";
import { findPersonByBitrixId } from "@/server/db/repos/people";
import { getDefaults, getProject, getSetupStage, getSyncState } from "@/server/db/repos/settings";
import { countTemplates, createTemplate } from "@/server/db/repos/templates";
import { applyActivityAction, bitrixRateLimitedUntil, createJourney, previewJourney } from "@/server/engine";
import { templateInput, type CreateJourneyInput } from "@/shared/schemas";
import { activityByTitle, advance, cycle, HR_ACTOR, prepare, setupEngine, templateId, type EngineEnv } from "../fakes/engine-setup";

let env: EngineEnv;
beforeEach(() => {
  env = setupEngine();
});
afterEach(() => env.cleanup());

const flowTemplate = () =>
  createTemplate(
    templateInput.parse({
      kind: "onboarding",
      name: "Fluxo curto",
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
              instructions: "Crie as contas.",
              links: [{ label: "Guia de TI", url: "https://exemplo.com/guia" }],
              checklist: [
                { key: "google", text: "Criar conta Google Workspace", ledger: { kind: "access", name: "Google Workspace" } },
                { key: "notebook", text: "Entregar notebook", ledger: { kind: "equipment", name: "Notebook" } },
              ],
            },
            { title: "Envie seus documentos", role: "colaborador", dueOffsetDays: -2, visibility: "employee" },
            { title: "Preparar contrato", role: "rh", dueOffsetDays: -2, visibility: "hr", required: false },
          ],
        },
        {
          name: "Primeiro mês",
          releaseMode: "after_previous",
          activities: [{ title: "1:1 de 30 dias", role: "gestor", kind: "meeting", dueOffsetDays: 30, dueTime: "15:00" }],
        },
      ],
    }),
  );

const singleTemplate = () =>
  createTemplate(
    templateInput.parse({
      kind: "onboarding",
      name: "Uma tarefa",
      stages: [
        {
          name: "Antes",
          releaseMode: "start",
          activities: [
            {
              title: "Criar acessos",
              role: "ti",
              dueOffsetDays: -1,
              checklist: [{ key: "google", text: "Criar conta Google Workspace", ledger: { kind: "access", name: "Google Workspace" } }],
            },
          ],
        },
      ],
    }),
  );

function start(templateId: string, extra: Partial<CreateJourneyInput> = {}): string {
  return createJourney(
    { requestId: randomUUID(), kind: "onboarding", person: { bitrixUserId: "12" }, templateId, anchorDate: "2026-11-02", participants: {}, ...extra },
    HR_ACTOR,
  ).id;
}

describe("preparar o Nexo", () => {
  it("cria o projeto privado, carrega pessoas, trilhas e padrões; repetir reaproveita o projeto", async () => {
    await prepare();
    const project = getProject()!;
    expect(env.fake.groups.get(Number(project.id))).toMatchObject({ name: "Nexo · Jornadas", project: true, visible: false, opened: false, initiatePerms: "E" });
    expect(project.url).toBe(`${env.fake.portal}/workgroups/group/${project.id}/`);
    expect(countTemplates()).toBe(5);
    expect(getSetupStage()).toBe("ready");
    expect(getDefaults().ti).toEqual({ bitrixUserId: "11", name: "Diego TI", position: "Suporte" });
    expect(findPersonByBitrixId("12")?.name).toBe("Ana Souza");
    await prepare();
    expect(env.fake.groups.size).toBe(1);
    expect(countTemplates()).toBe(5);
  });
});

describe("ciclo completo contra o FakeBitrix", () => {
  it("cria tarefas reais e libera a etapa seguinte quando as obrigatórias fecham no Bitrix", async () => {
    await prepare();
    const template = flowTemplate();
    const requestId = randomUUID();
    const id = start(template.id, { requestId });
    // Duplo clique: mesmo requestId, mesma jornada.
    expect(start(template.id, { requestId })).toBe(id);

    const first = await cycle();
    expect(first.errors).toEqual([]);
    const access = activityByTitle(id, "Criar acessos");
    expect(access).toMatchObject({ status: "open", syncState: "synced" });
    const task = env.fake.tasks.get(Number(access.bitrixTaskId))!;
    expect(task).toMatchObject({
      title: "Ana Souza · Onboarding — Criar acessos",
      responsibleId: 11,
      auditors: [10, 13],
      deadline: "2026-10-28T18:00:00-03:00",
      groupId: Number(getProject()!.id),
      xmlId: `nexo:${access.id}`,
      taskControl: "N",
    });
    expect(task.description).toContain("[URL=https://exemplo.com/guia]Guia de TI[/URL]");
    expect(task.description).toContain("[I]Tarefa criada pelo Nexo.[/I]");
    const items = env.fake.checklistOf(task.id);
    const root = items.find((item) => item.parentId === 0)!;
    expect(root.title).toBe("Checklist");
    expect(items.filter((item) => item.parentId === root.id).map((item) => item.title)).toEqual(["Criar conta Google Workspace", "Entregar notebook"]);
    expect(access.checklist.every((item) => item.bitrixItemId)).toBe(true);
    // Só RH: o gestor não é observador; o colaborador com conta recebe a própria tarefa.
    expect(env.fake.tasks.get(Number(activityByTitle(id, "Preparar contrato").bitrixTaskId))!.auditors).toEqual([]);
    const documents = activityByTitle(id, "Envie seus documentos");
    expect(env.fake.tasks.get(Number(documents.bitrixTaskId))!.responsibleId).toBe(12);
    expect(activityByTitle(id, "1:1 de 30 dias")).toMatchObject({ status: "locked", bitrixTaskId: null });

    env.fake.checkItem(task.id, "Criar conta Google Workspace");
    env.fake.closeTask(task.id);
    env.fake.closeTask(Number(documents.bitrixTaskId));
    const second = await cycle();
    expect(second.errors).toEqual([]);
    expect(second.followUp).toBe(true);
    expect(activityByTitle(id, "Criar acessos")).toMatchObject({ status: "done", doneSource: "bitrix" });
    expect(activityByTitle(id, "Criar acessos").checklist.find((item) => item.key === "google")?.done).toBe(true);
    const personId = getJourney(id)!.personId;
    expect(listLedger(personId).map((item) => [item.name, item.kind, item.status, item.source])).toEqual([["Google Workspace", "access", "active", "onboarding"]]);
    // A opcional "Preparar contrato" continua aberta, mas não segura a linha.
    expect(activityByTitle(id, "1:1 de 30 dias").status).toBe("open");

    await cycle();
    const meeting = activityByTitle(id, "1:1 de 30 dias");
    expect(meeting.bitrixTaskId).not.toBeNull();
    expect(meeting.calendarEventId).not.toBeNull();
    expect(env.fake.events[0]).toMatchObject({ ownerId: 1, from: "2026-12-02T15:00:00-03:00", to: "2026-12-02T15:30:00-03:00", attendees: [1, 13, 12] });
    expect(listAudit({ entity: "journey", entityId: id }).map((entry) => entry.action)).toContain("Atividade concluída no Bitrix24");
  });

  it("a trilha inicial de entrada vira tarefas sem erro (buddy sem escolha fica com o gestor)", async () => {
    await prepare();
    const id = start(templateId("Onboarding · Geral"));
    expect(previewJourney({ requestId: randomUUID(), kind: "onboarding", person: { bitrixUserId: "12" }, templateId: templateId("Onboarding · Geral"), anchorDate: "2026-11-02", participants: {} })).toMatchObject({
      activityCount: 15,
      releasedNow: 6,
      spanDays: 92,
      missingAssignees: [],
    });
    const report = await cycle();
    expect(report.errors).toEqual([]);
    const released = listActivities(id).filter((activity) => activity.status === "open");
    expect(released).toHaveLength(6);
    expect(released.every((activity) => activity.syncState === "synced" && activity.bitrixTaskId)).toBe(true);
    expect(activityByTitle(id, "Apresentar-se como buddy").assigneeBitrixId).toBe("13");
    expect(env.fake.checklistOf(activityByTitle(id, "Preparar acessos").bitrixTaskId!).filter((item) => item.parentId !== 0)).toHaveLength(4);
  });

  it("prévia resume atividades, papéis, liberação imediata e falta de responsáveis", async () => {
    await prepare();
    const template = flowTemplate();
    const preview = previewJourney({ requestId: randomUUID(), kind: "onboarding", person: { bitrixUserId: "12" }, templateId: template.id, anchorDate: "2026-11-02", participants: {} });
    expect(preview).toMatchObject({
      activityCount: 4,
      byRole: { ti: 1, colaborador: 1, rh: 1, gestor: 1 },
      releasedNow: 3,
      firstDueAt: "2026-10-28T18:00:00-03:00",
      lastDueAt: "2026-12-02T15:00:00-03:00",
      spanDays: 35,
      missingAssignees: [],
    });
    const withoutGestor = previewJourney({
      requestId: randomUUID(),
      kind: "onboarding",
      person: { name: "Pessoa Nova" },
      templateId: template.id,
      anchorDate: "2026-11-02",
      participants: { gestor: "999" },
    });
    expect(withoutGestor.missingAssignees).toEqual(["gestor"]);
    expect(() => start(template.id, { participants: { gestor: "999" } })).toThrow(/Atualize a lista de pessoas/);
  });

  it("recusa criar jornada sem responsável de um papel usado na trilha", async () => {
    await prepare();
    const template = flowTemplate();
    const { setDefaults } = await import("@/server/db/repos/settings");
    setDefaults({ rh: { bitrixUserId: "10", name: "Rita RH", position: null } });
    expect(() => start(template.id)).toThrow("Escolha quem faz as tarefas do gestor e de TI.");
  });
});

describe("criação idempotente", () => {
  it("o Bitrix grava e dá timeout: reconcilia pelo XML_ID sem duplicar", async () => {
    await prepare();
    const id = start(singleTemplate().id);
    env.fake.failNext("tasks.task.add", "commitThenTimeout");
    await cycle();
    expect(activityByTitle(id, "Criar acessos")).toMatchObject({ syncState: "uncertain", bitrixTaskId: null });
    expect(env.fake.tasks.size).toBe(1);
    await cycle();
    expect(env.fake.countCalls("tasks.task.add")).toBe(1);
    advance(2 * 60_000 + 1_000);
    await cycle();
    const activity = activityByTitle(id, "Criar acessos");
    expect(activity).toMatchObject({ syncState: "synced", bitrixTaskId: String([...env.fake.tasks.keys()][0]) });
    expect(env.fake.tasks.size).toBe(1);
    expect(env.fake.countCalls("tasks.task.add")).toBe(1);
    expect(env.fake.checklistOf(activity.bitrixTaskId!)).toHaveLength(2);
  });

  it("timeout sem gravar: exatamente um reenvio depois de ~2 min", async () => {
    await prepare();
    const id = start(singleTemplate().id);
    env.fake.failNext("tasks.task.add", "timeout");
    await cycle();
    expect(env.fake.tasks.size).toBe(0);
    advance(2 * 60_000 + 1_000);
    await cycle();
    expect(env.fake.countCalls("tasks.task.add")).toBe(2);
    expect(env.fake.tasks.size).toBe(1);
    expect(activityByTitle(id, "Criar acessos").syncState).toBe("synced");
  });

  it("depois de 3 envios incertos, a atividade fica incerta e o Nexo para de reenviar", async () => {
    await prepare();
    const id = start(singleTemplate().id);
    env.fake.failNext("tasks.task.add", "timeout", 3);
    for (let round = 0; round < 4; round++) {
      await cycle();
      advance(2 * 60_000 + 1_000);
    }
    expect(env.fake.countCalls("tasks.task.add")).toBe(3);
    expect(activityByTitle(id, "Criar acessos")).toMatchObject({ syncState: "uncertain", syncError: expect.stringMatching(/não vai reenviar/) });
    advance(60 * 60_000);
    await cycle();
    expect(env.fake.countCalls("tasks.task.add")).toBe(3);
  });

  it("erro 4xx: vira erro de sincronização visível e só tenta de novo bem mais tarde", async () => {
    await prepare();
    const id = start(singleTemplate().id);
    env.fake.failNext("tasks.task.add", "denied");
    await cycle();
    expect(activityByTitle(id, "Criar acessos")).toMatchObject({ syncState: "error", syncError: "O Bitrix24 negou a operação. Revise as permissões do webhook." });
    await cycle();
    expect(env.fake.countCalls("tasks.task.add")).toBe(1);
    advance(31 * 60_000);
    await cycle();
    expect(env.fake.countCalls("tasks.task.add")).toBe(2);
    expect(activityByTitle(id, "Criar acessos").syncState).toBe("synced");
  });
});

describe("consulta por IDs", () => {
  it("tarefa apagada no Bitrix é sinalizada e nunca recriada", async () => {
    await prepare();
    const id = start(singleTemplate().id);
    await cycle();
    const taskId = activityByTitle(id, "Criar acessos").bitrixTaskId!;
    env.fake.deleteTask(taskId);
    await cycle();
    expect(activityByTitle(id, "Criar acessos")).toMatchObject({ bitrixMissing: true, syncState: "error", syncError: "A tarefa foi apagada ou movida no Bitrix." });
    advance(31 * 60_000);
    await cycle();
    await cycle();
    expect(env.fake.countCalls("tasks.task.add")).toBe(1);
  });

  it("status 4 aparece como aguardando aprovação; aprovar no Nexo aprova no Bitrix", async () => {
    await prepare();
    const id = start(singleTemplate().id);
    await cycle();
    const activity = activityByTitle(id, "Criar acessos");
    env.fake.setTaskStatus(activity.bitrixTaskId!, 4);
    await cycle();
    expect(activityByTitle(id, "Criar acessos")).toMatchObject({ status: "awaiting_approval", bitrixStatus: 4 });
    applyActivityAction(activity.id, { action: "approve" }, HR_ACTOR);
    expect(getActivity(activity.id)).toMatchObject({ status: "done", doneSource: "nexo", syncState: "queued" });
    await cycle();
    expect(env.fake.tasks.get(Number(activity.bitrixTaskId))!.status).toBe(5);
    expect(getActivity(activity.id)).toMatchObject({ status: "done", syncState: "synced", bitrixStatus: 5 });
  });

  it("prazo e responsável mudados no Bitrix voltam para o Nexo", async () => {
    await prepare();
    const id = start(singleTemplate().id);
    await cycle();
    const activity = activityByTitle(id, "Criar acessos");
    const task = env.fake.tasks.get(Number(activity.bitrixTaskId))!;
    task.deadline = "2026-10-30T15:00:00+03:00";
    task.responsibleId = 14;
    await cycle();
    expect(getActivity(activity.id)).toMatchObject({ dueAt: "2026-10-30T09:00:00-03:00", assigneeBitrixId: "14", assigneeName: "Carla Buddy" });
  });
});

describe("ações do RH", () => {
  it("concluir no Nexo fecha a tarefa; reabrir renova", async () => {
    await prepare();
    const id = start(singleTemplate().id);
    await cycle();
    const activity = activityByTitle(id, "Criar acessos");
    applyActivityAction(activity.id, { action: "complete" }, HR_ACTOR);
    await cycle();
    expect(env.fake.tasks.get(Number(activity.bitrixTaskId))!.status).toBe(5);
    applyActivityAction(activity.id, { action: "reopen" }, HR_ACTOR);
    expect(getActivity(activity.id)).toMatchObject({ status: "open", doneAt: null });
    await cycle();
    expect(env.fake.tasks.get(Number(activity.bitrixTaskId))!.status).toBe(2);
    expect(getActivity(activity.id)).toMatchObject({ status: "open", syncState: "synced" });
  });

  it("marcar item no Nexo alimenta o inventário na hora e marca no Bitrix no ciclo", async () => {
    await prepare();
    const id = start(singleTemplate().id);
    await cycle();
    const activity = activityByTitle(id, "Criar acessos");
    applyActivityAction(activity.id, { action: "toggle_item", itemKey: "google", done: true }, HR_ACTOR);
    expect(listLedger(getJourney(id)!.personId).map((item) => item.status)).toEqual(["active"]);
    await cycle();
    const item = env.fake.checklistOf(activity.bitrixTaskId!).find((entry) => entry.title === "Criar conta Google Workspace")!;
    expect(item.done).toBe(true);
    applyActivityAction(activity.id, { action: "toggle_item", itemKey: "google", done: false }, HR_ACTOR);
    expect(listLedger(getJourney(id)!.personId).map((entry) => entry.status)).toEqual(["planned"]);
    await cycle();
    expect(env.fake.checklist.get(item.id)!.done).toBe(false);
  });

  it("cobrar comenta citando o responsável, no máximo uma vez por hora", async () => {
    await prepare();
    const id = start(singleTemplate().id);
    await cycle();
    const activity = activityByTitle(id, "Criar acessos");
    applyActivityAction(activity.id, { action: "nudge" }, HR_ACTOR);
    expect(() => applyActivityAction(activity.id, { action: "nudge" }, HR_ACTOR)).toThrow(/menos de 1 hora/);
    await cycle();
    expect(env.fake.comments).toHaveLength(1);
    expect(env.fake.comments[0]?.message).toMatch(/^\[USER=11\]Diego TI\[\/USER\], pode dar uma olhada nesta tarefa da jornada de Ana Souza\?/);
    advance(61 * 60_000);
    applyActivityAction(activity.id, { action: "nudge", message: "consegue fechar hoje?" }, HR_ACTOR);
    await cycle();
    expect(env.fake.comments[1]?.message).toBe("[USER=11]Diego TI[/USER], consegue fechar hoje?");
  });

  it("pessoa sem conta: atividade do colaborador fica no link até vincular a conta", async () => {
    await prepare();
    const template = flowTemplate();
    const id = start(template.id, { person: { name: "Ana Souza", email: "ana@empresa.test" } });
    await cycle();
    const documents = activityByTitle(id, "Envie seus documentos");
    expect(documents).toMatchObject({ status: "open", assigneeBitrixId: null, bitrixTaskId: null, syncState: "local" });
    const { linkJourneyPerson } = await import("@/server/engine");
    linkJourneyPerson(id, "12", HR_ACTOR);
    await cycle();
    expect(env.fake.tasks.get(Number(activityByTitle(id, "Envie seus documentos").bitrixTaskId))!.responsibleId).toBe(12);
    expect(getJourney(id)!.personId).toBe(findPersonByBitrixId("12")!.id);
  });
});

describe("robustez do ciclo", () => {
  it("um passo que falha não derruba o ciclo e fica registrado", async () => {
    await prepare();
    const id = start(singleTemplate().id);
    env.fake.failNext("tasks.task.list", "serverError");
    const report = await cycle();
    expect(report.ran).toBe(true);
    expect(report.errors).toEqual(["Consulta das tarefas: O Bitrix24 está instável agora. O Nexo tenta de novo sozinho."]);
    expect(activityByTitle(id, "Criar acessos").bitrixTaskId).not.toBeNull();
    const sync = getSyncState();
    expect(sync.lastCycleAt).not.toBeNull();
    expect(sync.lastError).toMatch(/^Consulta das tarefas/);
    expect((await cycle()).errors).toEqual([]);
    expect(getSyncState().lastError).toBeNull();
  });

  it("limite do Bitrix: pausa as chamadas, registra até quando e reenfileira o envio", async () => {
    await prepare();
    start(singleTemplate().id);
    env.fake.failNext("tasks.task.add", "limit", 3);
    const report = await cycle();
    expect(report.errors).toEqual([]);
    expect(bitrixRateLimitedUntil()).not.toBeNull();
    expect(getSyncState().rateLimitedUntil).not.toBeNull();
    expect(countJobs("queued")).toBeGreaterThan(0);
    expect(env.fake.countCalls("tasks.task.list")).toBe(0);
    advance(60_000);
    await cycle();
    expect(env.fake.tasks.size).toBe(1);
  });

  it("não roda antes de a instalação ficar pronta", async () => {
    expect(await cycle()).toMatchObject({ ran: false, skipped: "not_ready" });
  });
});
