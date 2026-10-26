import { afterEach, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { Store } from "../../src/server/store";
import { validateEnvironment } from "../../src/server/security";
import { Auth } from "../../src/server/auth";
import { BitrixClient } from "../../src/server/bitrix";
import { Journeys } from "../../src/server/journeys";
import { Setup } from "../../src/server/setup";
import { Worker } from "../../src/server/worker";
import { Events } from "../../src/server/events";
import { journeySchema } from "../../src/shared/validation";
import type { SessionInfo } from "../../src/shared/contracts";
const resources: { store: Store; dir: string }[] = [];
afterEach(() => {
  for (const resource of resources.splice(0)) {
    resource.store.close();
    rmSync(resource.dir, { recursive: true, force: true });
  }
});
const env = validateEnvironment({
  NEXO_ENCRYPTION_KEY: "ab".repeat(32),
  NEXO_SETUP_TOKEN: "setup-secret-long-enough",
  NEXO_APP_URL: "https://nexo.example.com",
  BITRIX_PORTAL_URL: "https://acme.bitrix24.com",
});
async function setup() {
  const dir = mkdtempSync(join(tmpdir(), "nexo-journeys-")),
    store = new Store(join(dir, "nexo.db"));
  resources.push({ store, dir });
  const tasks = new Map<
    string,
    {
      id: string;
      title: string;
      status: string;
      responsibleId: string;
      groupId: string;
      stageId: string;
    }
  >();
  const checklists = new Map<
    string,
    { ID: string; TITLE: string; IS_COMPLETE: string }[]
  >();
  const access = {
    empty: false,
    mismatched: false,
    crmEmpty: false,
    crmMismatched: false,
  };
  const remoteItem = {
    id: 50,
    categoryId: 0,
    stageId: "PROGRESS",
    ufCrmEmployee: "2",
    ufCrmDate: "2026-10-22",
    xmlId: "",
  };
  const remoteItems = new Map([[50, remoteItem]]),
    approvedIds: number[] = [];
  const hooks: { afterSpaCommit?: () => Promise<void> } = {};
  let uncertain = false,
    initialStageZero = false,
    nextId = 10;
  const transport: typeof fetch = async (input, init) => {
    if (String(input).includes("oauth.bitrix.info"))
      return Response.json({
        access_token: "good",
        refresh_token: "rotated-refresh",
        expires_in: 3600,
        member_id: "member1",
        user_id: "1",
      });
    const method = new URL(String(input)).pathname
        .split("/")
        .pop()
        ?.replace(".json", ""),
      body = z
        .record(z.string(), z.unknown())
        .parse(JSON.parse(String(init?.body)));
    const fields = body.fields
      ? z.record(z.string(), z.unknown()).parse(body.fields)
      : {};
    if (method === "user.current")
      return Response.json({
        result: { ID: "1", NAME: "RH", LAST_NAME: "", ACTIVE: true },
      });
    if (method === "user.admin") return Response.json({ result: true });
    if (method === "app.info")
      return Response.json({ result: { ID: "7", CODE: "local.nexo" } });
    if (method === "user.get")
      return Response.json({
        result: [
          {
            ID: String(body.ID),
            NAME: `Pessoa ${String(body.ID)}`,
            ACTIVE: String(body.ID) !== "99",
          },
        ],
      });
    if (method === "crm.item.list") {
      const filter = z.record(z.string(), z.unknown()).parse(body.filter);
      return Response.json({
        result: {
          items:
            typeof filter.stageId === "string"
              ? approvedIds.map((id) => ({ id }))
              : [],
        },
      });
    }
    if (method === "crm.item.add") {
      remoteItem.xmlId = String(fields.xmlId);
      if (hooks.afterSpaCommit) await hooks.afterSpaCommit();
      return Response.json({ result: { item: { id: 50, ...fields } } });
    }
    if (method === "crm.item.get") {
      if (access.crmEmpty) return Response.json({ result: [] });
      return Response.json({
        result: {
          item: access.crmMismatched
            ? { ...remoteItem, id: 999999 }
            : remoteItems.get(Number(body.id)),
        },
      });
    }
    if (method === "crm.item.update")
      return Response.json({ result: { item: { id: 50, ...fields } } });
    if (method === "tasks.task.list") {
      const filter = z.record(z.string(), z.unknown()).parse(body.filter);
      return Response.json({
        result: {
          tasks: [...tasks.values()].filter(
            (task) => task.title === filter.TITLE,
          ),
        },
      });
    }
    if (method === "tasks.task.add") {
      expect(fields.GROUP_ID).toBe(52);
      const id = String(nextId++);
      tasks.set(id, {
        id,
        title: String(fields.TITLE),
        status: "2",
        responsibleId: String(fields.RESPONSIBLE_ID),
        groupId: "52",
        stageId: initialStageZero ? "0" : "1",
      });
      if (uncertain) {
        uncertain = false;
        throw new Error("connection lost after remote commit");
      }
      return Response.json({ result: { task: tasks.get(id) } });
    }
    if (method === "tasks.task.get") {
      if (access.empty) return Response.json({ result: [] });
      if (access.mismatched)
        return Response.json({
          result: { task: { id: "999999", status: "2" } },
        });
      if (
        body.auth === "employee-token" &&
        tasks.get(String(body.taskId))?.responsibleId !== "2"
      )
        return Response.json({ error: "ACCESS_DENIED" });
      const remote = tasks.get(String(body.taskId));
      return Response.json({
        result: {
          task: remote
            ? {
                id: remote.id,
                title: remote.title,
                status: remote.status,
                responsibleId: remote.responsibleId,
                groupId: remote.groupId,
                stageId: remote.stageId,
              }
            : undefined,
        },
      });
    }
    if (method === "task.stages.get")
      return Response.json({
        result: {
          "1": { ID: "1", TITLE: "A fazer" },
          "2": { ID: "2", TITLE: "Em andamento" },
        },
      });
    if (method === "task.checklistitem.getlist")
      return Response.json({
        result: checklists.get(String(body.TASKID)) ?? [],
      });
    if (method === "task.checklistitem.add") {
      expect(Object.keys(body).slice(0, 2)).toEqual(["TASKID", "FIELDS"]);
      const checklistFields = z
          .record(z.string(), z.unknown())
          .parse(body.FIELDS),
        items = checklists.get(String(body.TASKID)) ?? [];
      const item = {
        ID: String(500 + items.length),
        TITLE: String(checklistFields.TITLE),
        IS_COMPLETE: "N",
      };
      items.push(item);
      checklists.set(String(body.TASKID), items);
      return Response.json({ result: Number(item.ID) });
    }
    throw new Error(`Unexpected ${method}`);
  };
  const bitrix = new BitrixClient(store, env, transport),
    auth = new Auth(store, env, bitrix),
    service = new Journeys(store, auth, bitrix);
  bitrix.configureWebhook(
    `https://${env.portalDomain}/rest/1/test-secret/`,
    "1",
  );
  const { session } = await auth.bootstrapLocalAdmin(
    env.setupToken,
    "rh@example.com",
    "Senha-de-teste-segura-2026",
    "1",
  );
  store.put("settings", "current", {
    ...auth.settings(),
    setupComplete: true,
    automationUserId: "1",
    defaultAssignees: { ti: "1", colaborador: "2" },
    rhProject: {
      id: "52",
      name: "Nexo · RH",
      url: `${env.portalUrl}/workgroups/group/52/`,
    },
    process: {
      entityTypeId: 1050,
      categoryId: 0,
      employeeField: "ufCrmEmployee",
      dateField: "ufCrmDate",
      onboardingStageId: "ONBOARD",
      offboardingStageId: "OFFBOARD",
      inProgressStageId: "PROGRESS",
      completedStageId: "DONE",
      cancelledStageId: "CANCEL",
    },
  });
  const template = service.saveTemplate(session, {
    id: "model1",
    name: "Modelo",
    description: "",
    type: "onboarding",
    version: 1,
    stages: [
      {
        id: "stage1",
        title: "Preparação",
        activities: [
          {
            id: "activity1",
            title: "Acesso TI",
            description: "",
            assigneeRole: "ti",
            offsetDays: -1,
            required: true,
            critical: true,
            visibility: "hr",
            checklist: [],
            documents: [],
          },
          {
            id: "activity2",
            title: "Boas-vindas",
            description: "",
            assigneeRole: "colaborador",
            offsetDays: 0,
            required: true,
            critical: false,
            visibility: "employee",
            checklist: [],
            documents: [],
          },
        ],
      },
    ],
  });
  return {
    store,
    auth,
    bitrix,
    service,
    session,
    template,
    tasks,
    checklists,
    remoteItem,
    remoteItems,
    approvedIds,
    access,
    hooks,
    makeUncertain: () => {
      uncertain = true;
    },
    makeInitialStageZero: () => {
      initialStageZero = true;
    },
  };
}
const input = {
  requestId: "request123",
  type: "onboarding",
  templateId: "model1",
  employeeId: "2",
  referenceDate: "2026-10-22",
  assignees: {},
};
it("concorrência e replay da origem criam uma única jornada com snapshot", async () => {
  const { store, service, session, template, tasks } = await setup();
  const [first, replay] = await Promise.all([
    service.create(session, input),
    service.create(session, input),
  ]);
  expect(first.id).toBe(replay.id);
  service.saveTemplate(session, { ...template, name: "Alterado" }, template.id);
  await service.runJourney(first.id);
  expect(tasks.size).toBe(2);
  expect(service.get(first.id).templateName).toBe("Modelo");
  expect(service.get(first.id).sourceItemId).toBe(50);
  expect(service.get(first.id).tasks[0]).toMatchObject({
    bitrixStageId: "1",
    bitrixStageTitle: "A fazer",
  });
  const reopened = new Journeys(store, service.auth, service.bitrix);
  await reopened.runJourney(first.id);
  expect(tasks.size).toBe(2);
});
it("sincroniza tarefas Bitrix que começam na coluna padrão de ID zero", async () => {
  const { service, session, tasks, store, makeInitialStageZero } = await setup();
  makeInitialStageZero();
  const journey = await service.create(session, input);
  store.enqueue(`journey:${journey.id}`, "journey", { journeyId: journey.id });
  service.issue(`job:journey:${journey.id}`, "Operação pendente", "Falha anterior", true);
  await expect(service.runJourney(journey.id)).resolves.toMatchObject({ status: "active" });
  expect(tasks.size).toBe(2);
  expect(service.get(journey.id).tasks.every(task => task.syncState === "synced")).toBe(true);
  expect(service.get(journey.id).tasks[0]).toMatchObject({ bitrixStageId: "0", bitrixStageTitle: "A fazer" });
  expect(store.get("issue", `job:journey:${journey.id}`, z.object({ id: z.string() }).passthrough())).toBeNull();
  expect(store.sqlite.prepare("select state from jobs where id=?").get(`journey:${journey.id}`)).toEqual({ state: "done" });
});
it("congela trilha aprovada pelo RH e rejeita atividade fora do modelo", async () => {
  const { service, session, template } = await setup();
  const approvedTrail = {
    templateId: template.id,
    templateVersion: template.version,
    profile: template.profile,
    competencies: [
      {
        name: "Integração",
        importance: "essential",
        activityIds: ["activity1"],
      },
    ],
    gaps: [],
    activities: [
      {
        activityId: "activity1",
        stageId: "stage1",
        order: 0,
        offsetDays: -2,
        assigneeRole: "ti",
        reason: "Preparação crítica",
      },
      {
        activityId: "activity2",
        stageId: "stage1",
        order: 1,
        offsetDays: 0,
        assigneeRole: "colaborador",
        reason: "Acolhimento",
      },
    ],
  } as const;
  const created = await service.create(session, {
    ...input,
    requestId: "approved-trail-01",
    approvedTrail,
  });
  expect(created.approvedTrail).toMatchObject({
    source: "ai",
    competencies: [{ name: "Integração" }],
  });
  expect(created.tasks[0]?.dueAt).not.toBe(created.tasks[1]?.dueAt);
  await expect(
    service.create(session, {
      ...input,
      requestId: "tampered-trail-01",
      approvedTrail: {
        ...approvedTrail,
        activities: [
          { ...approvedTrail.activities[0], activityId: "inventada" },
        ],
      },
    }),
  ).rejects.toMatchObject({ code: "TRAIL_INVALID" });
});
it("cria no Bitrix somente as atividades opcionais mantidas pelo RH na trilha aprovada", async () => {
  const { service, session, template, tasks } = await setup();
  service.saveTemplate(
    session,
    {
      ...template,
      stages: template.stages.map((stage) => ({
        ...stage,
        activities: stage.activities.map((activity) =>
          activity.id === "activity2"
            ? { ...activity, required: false }
            : activity,
        ),
      })),
    },
    template.id,
  );
  const approvedTrail = {
    templateId: template.id,
    templateVersion: 2,
    profile: template.profile,
    competencies: [],
    gaps: [],
    activities: [
      {
        activityId: "activity1",
        stageId: "stage1",
        order: 0,
        offsetDays: -2,
        assigneeRole: "ti",
        reason: "A atividade obrigatória atende a necessidade.",
      },
    ],
  };
  const created = await service.create(session, {
    ...input,
    requestId: "approved-filter-01",
    approvedTrail,
  });
  expect(created.tasks.map((task) => task.title)).toEqual(["Acesso TI"]);
  await service.runJourney(created.id);
  expect(tasks.size).toBe(1);
});
it("reconcilia criação remota incerta antes de tentar qualquer nova criação", async () => {
  const { service, session, tasks, makeUncertain } = await setup();
  const created = await service.create(session, input);
  makeUncertain();
  await expect(service.runJourney(created.id)).rejects.toThrow();
  expect(tasks.size).toBe(1);
  await service.runJourney(created.id);
  expect(tasks.size).toBe(2);
  expect(
    service.get(created.id).tasks.every((task) => task.syncState === "synced"),
  ).toBe(true);
});
it("atualiza a mesma atividade após evento do Kanban e sinaliza exclusão sem recriar", async () => {
  const { service, session, tasks, auth, bitrix, store } = await setup();
  const journey = await service.create(session, input);
  await service.runJourney(journey.id);
  const remote = [...tasks.values()][0];
  if (!remote) throw new Error("missing task");
  remote.stageId = "2";
  remote.status = "3";
  const worker = new Worker(store, auth, bitrix, service);
  await worker.processEvent({ event: "ONTASKUPDATE", taskId: remote.id });
  expect(service.get(journey.id).tasks[0]).toMatchObject({
    bitrixStageId: "2",
    bitrixStageTitle: "Em andamento",
    status: "in_progress",
  });
  await worker.processEvent({ event: "ONTASKDELETE", taskId: remote.id });
  expect(service.get(journey.id).tasks[0]).toMatchObject({
    bitrixTaskId: null,
    syncState: "error",
  });
  await service.runJourney(journey.id);
  expect(tasks.size).toBe(2);
  expect(
    service
      .get(journey.id)
      .tasks.find((task) => task.id === journey.tasks[0]?.id),
  ).toMatchObject({
    bitrixTaskId: null,
    remoteDeleted: true,
    syncState: "error",
  });
});
it("não conclui jornada com status 4 e confirma Bitrix antes de concluir", async () => {
  const { service, session, tasks } = await setup();
  const created = await service.create(session, input);
  await service.runJourney(created.id);
  for (const task of tasks.values()) task.status = "5";
  const first = [...tasks.values()][0];
  if (!first) throw new Error("missing task");
  first.status = "4";
  await expect(service.complete(session, created.id)).rejects.toThrow();
  expect(service.get(created.id).status).toBe("active");
  first.status = "5";
  expect((await service.complete(session, created.id)).status).toBe(
    "completed",
  );
});
it("colaborador vê apenas suas atividades e contadores recalculados", async () => {
  const { service, session } = await setup();
  const created = await service.create(session, input);
  await service.runJourney(created.id);
  const employee: SessionInfo = {
    ...session,
    user: { ...session.user, id: "2" },
    role: "colaborador",
    canManage: false,
    canConfigure: false,
  };
  const visible = await service.visible(employee, service.get(created.id));
  expect(visible?.tasks.map((task) => task.title)).toEqual(["Boas-vindas"]);
  expect(visible?.taskCount).toBe(1);
  expect(visible?.completedCount).toBe(0);
  expect(visible?.approvedTrail).toBeNull();
});
it("configuração não empresta OAuth de outra pessoa nem concede admin ao RH", async () => {
  const { service, store, auth, bitrix, session } = await setup();
  const configure = new Setup(store, auth, bitrix, service);
  await expect(
    configure.configure(
      session,
      { ...auth.settings(), automationUserId: "2" },
      [],
    ),
  ).rejects.toThrow();
  const rh: SessionInfo = { ...session, role: "rh", canConfigure: false };
  await expect(
    configure.configure(
      rh,
      {
        ...auth.settings(),
        roleAssignments: { ...auth.settings().roleAssignments, admin: ["2"] },
      },
      [],
    ),
  ).rejects.toThrow();
  expect(auth.settings().roleAssignments.admin).toEqual(["1"]);
});
it("evento autenticado sem access_token é durável e aprovação repetida cria uma jornada", async () => {
  const { store, auth, bitrix, service, remoteItem } = await setup();
  store.put("rules", "current", [
    {
      id: "r1",
      name: "Aprovado",
      type: "onboarding",
      templateId: "model1",
      stageId: "ONBOARD",
      enabled: true,
    },
  ]);
  remoteItem.stageId = "ONBOARD";
  const events = new Events(store, auth);
  events.configureOutgoingToken("outgoing-secret-123456789");
  const payload = {
    event: "ONCRMDYNAMICITEMUPDATE",
    ts: "123",
    auth: {
      application_token: "outgoing-secret-123456789",
      domain: env.portalDomain,
    },
    data: { FIELDS: { ID: "50", ENTITY_TYPE_ID: "1050" } },
  };
  expect(() =>
    events.receive({
      ...payload,
      auth: { ...payload.auth, application_token: "forged" },
    }),
  ).toThrow();
  events.receive(payload);
  events.receive(payload);
  expect(store.nextJobs().filter((job) => job.kind === "event")).toHaveLength(
    1,
  );
  const worker = new Worker(store, auth, bitrix, service);
  await worker.processEvent({
    event: "ONCRMDYNAMICITEMUPDATE",
    entityTypeId: 1050,
    itemId: 50,
  });
  await worker.processEvent({
    event: "ONCRMDYNAMICITEMUPDATE",
    entityTypeId: 1050,
    itemId: 50,
  });
  expect(
    store.list(
      "journey",
      z.object({ id: z.string(), sourceItemId: z.number() }),
    ),
  ).toHaveLength(1);
  expect(store.nextJobs().filter((job) => job.kind === "journey")).toHaveLength(
    1,
  );
});
it("gatilho de negócio CRM cria uma jornada ligada à origem sem duplicar", async () => {
  const { service, store, auth, bitrix, remoteItem } = await setup();
  remoteItem.stageId = "C2:WON";
  Object.assign(remoteItem, { title: "Ana candidata" });
  store.put("rules", "current", [{
    id: "deal-hired", name: "Contratada", type: "onboarding", templateId: "model1", stageId: "C2:WON", enabled: true,
    source: { kind: "crm_deal", entityTypeId: 2, categoryId: 0, stageId: "C2:WON" },
    fieldMapping: { nameField: "title", dateField: "ufCrmDate", bitrixUserField: "ufCrmEmployee", positionField: null, departmentField: null },
  }]);
  const worker = new Worker(store, auth, bitrix, service);
  const job = { event: "ONCRMDEALUPDATE", sourceKind: "crm_deal" as const, itemId: 50 };

  const first = await worker.processSourceEvent(job);
  const replay = await worker.processSourceEvent(job);

  expect(first?.id).toBe(replay?.id);
  expect(first).toMatchObject({ source: "trigger", origin: { entityTypeId: 2, itemId: 50 }, person: { bitrixUserId: "2", name: "Ana candidata" }, sourceItemId: null });
  expect(store.list("journey", journeySchema)).toHaveLength(1);
});
it("inicia candidato sem usuário Bitrix e aguarda o vínculo antes de tarefa do colaborador", async () => {
  const { service, store, auth, bitrix, remoteItem, tasks, session } = await setup();
  remoteItem.stageId = "C2:WON";
  Object.assign(remoteItem, { title: "Ana candidata" });
  store.put("rules", "current", [{ id: "deal-hired", name: "Contratada", type: "onboarding", templateId: "model1", stageId: "C2:WON", enabled: true, source: { kind: "crm_deal", entityTypeId: 2, categoryId: 0, stageId: "C2:WON" }, fieldMapping: { nameField: "title", dateField: "ufCrmDate", bitrixUserField: null, positionField: null, departmentField: null } }]);
  const worker = new Worker(store, auth, bitrix, service);
  const created = await worker.processSourceEvent({ event: "ONCRMDEALUPDATE", sourceKind: "crm_deal", itemId: 50 });
  expect(created?.person).toMatchObject({ bitrixUserId: null, name: "Ana candidata" });
  expect(created?.tasks.find(task => task.assigneeRole === "colaborador")?.assignee).toBeNull();
  if (!created) throw new Error("missing candidate journey");
  await service.runJourney(created.id);
  expect([...tasks.values()]).toHaveLength(1);
  await expect(service.linkPerson({ ...session, role: "executor", canManage: false }, created.id, "2")).rejects.toThrow();
  await expect(service.linkPerson(session, created.id, "99")).rejects.toMatchObject({ code: "EMPLOYEE_INACTIVE" });
  const linked = await service.linkPerson(session, created.id, "2");
  expect(linked.person.bitrixUserId).toBe("2");
  await service.runJourney(created.id);
  expect([...tasks.values()]).toHaveLength(2);
});
it("libera o Kanban do Bitrix por etapa após concluir as atividades obrigatórias", async () => {
  const { service, session, template, tasks } = await setup();
  const secondActivity = { ...template.stages[0]!.activities[0]!, id: "activity-stage-2", title: "Entrevista de acompanhamento" };
  service.saveTemplate(session, { ...template, stages: [...template.stages, { id: "stage2", title: "Acompanhamento", release: { mode: "previous_stage_completed", offsetDays: 0, offsetUnit: "calendar_days" }, activities: [secondActivity] }] }, template.id);
  const created = await service.create(session, input);
  expect([...tasks.values()]).toHaveLength(0);
  expect(created.stages.map(stage => stage.state)).toEqual(["released", "waiting"]);
  await service.runJourney(created.id);
  expect([...tasks.values()]).toHaveLength(2);
  expect(service.get(created.id).tasks.filter(task => task.stageId === "stage2").every(task => task.releaseState === "waiting" && !task.bitrixTaskId)).toBe(true);

  await service.setPaused(session, created.id, true);
  for (const remote of tasks.values()) remote.status = "5";
  await service.reconcileJourney(created.id, "1");
  await service.runJourney(created.id);
  expect([...tasks.values()]).toHaveLength(2);
  expect(service.get(created.id).status).toBe("paused");
  expect(service.get(created.id).tasks.find(task => task.stageId === "stage2")?.releaseState).toBe("waiting");
  await service.setPaused(session, created.id, false);
  await service.runJourney(created.id);

  expect([...tasks.values()]).toHaveLength(3);
  expect(service.get(created.id).tasks.find(task => task.stageId === "stage2")).toMatchObject({ releaseState: "released", bitrixTaskId: expect.any(String) });
});
it("mutação de usuário respeita o lease da jornada mantido pelo worker", async () => {
  const { service, store, session } = await setup();
  const created = await service.create(session, input);
  await service.runJourney(created.id);
  store.lease(`journey:${created.id}`, "other-worker", 120000);
  const task = service.get(created.id).tasks[0];
  if (!task) throw new Error("missing task");
  await expect(
    service.action(session, task.id, { action: "start" }),
  ).rejects.toMatchObject({ code: "JOURNEY_BUSY" });
});
it("checklists criados uma vez bloqueiam conclusão até confirmação remota", async () => {
  const { service, session, template, tasks, checklists } = await setup();
  const firstStage = template.stages[0],
    activity = firstStage?.activities[0];
  if (!activity) throw new Error("missing activity");
  activity.checklist = [
    { id: "required-item", title: "Conferir acesso", required: true },
  ];
  service.saveTemplate(session, template, template.id);
  const created = await service.create(session, input);
  await service.runJourney(created.id);
  await service.runJourney(created.id);
  expect([...checklists.values()].flat()).toHaveLength(1);
  for (const task of tasks.values()) task.status = "5";
  await expect(service.complete(session, created.id)).rejects.toMatchObject({
    code: "JOURNEY_INCOMPLETE",
  });
  const checklist = [...checklists.values()][0]?.[0];
  if (!checklist) throw new Error("missing checklist");
  checklist.IS_COMPLETE = "Y";
  expect((await service.complete(session, created.id)).status).toBe(
    "completed",
  );
});
it("radar não mantém alertas de jornadas canceladas", async () => {
  const { service, session } = await setup();
  const created = await service.create(session, input);
  const cancelled = {
    ...created,
    status: "cancelled" as const,
    tasks: created.tasks.map((task) => ({
      ...task,
      dueAt: "2020-01-01T00:00:00Z",
    })),
  };
  expect(service.alerts([cancelled])).toEqual([]);
});
it("SPA criada manualmente não gera outra jornada ao entrar em aprovação", async () => {
  const { service, store, auth, bitrix, session, tasks, remoteItem } =
    await setup();
  store.put("rules", "current", [
    {
      id: "r1",
      name: "Aprovado",
      type: "onboarding",
      templateId: "model1",
      stageId: "ONBOARD",
      enabled: true,
    },
  ]);
  const manual = await service.create(session, input);
  await service.runJourney(manual.id);
  remoteItem.stageId = "ONBOARD";
  const worker = new Worker(
    store,
    auth,
    bitrix,
    new Journeys(store, auth, bitrix),
  );
  await worker.processEvent({
    event: "ONCRMDYNAMICITEMUPDATE",
    entityTypeId: 1050,
    itemId: 50,
  });
  await worker.processEvent({
    event: "ONCRMDYNAMICITEMUPDATE",
    entityTypeId: 1050,
    itemId: 50,
  });
  expect(store.list("journey", z.object({ id: z.string() }))).toEqual([
    { id: manual.id },
  ]);
  const key = service.sourceKey(1050, 50);
  expect(store.reserve(key, key, "unexpected").id).toBe(manual.id);
  expect(tasks.size).toBe(2);
});
it("cancelamento da SPA impede tarefas de uma jornada ainda na fila", async () => {
  const { service, store, auth, bitrix, tasks, remoteItem } = await setup();
  store.put("rules", "current", [
    {
      id: "r1",
      name: "Aprovado",
      type: "onboarding",
      templateId: "model1",
      stageId: "ONBOARD",
      enabled: true,
    },
  ]);
  const worker = new Worker(store, auth, bitrix, service);
  remoteItem.stageId = "ONBOARD";
  await worker.processEvent({
    event: "ONCRMDYNAMICITEMUPDATE",
    entityTypeId: 1050,
    itemId: 50,
  });
  const queued = store.list("journey", z.object({ id: z.string() }))[0];
  if (!queued) throw new Error("missing journey");
  remoteItem.stageId = "CANCEL";
  expect((await service.runJourney(queued.id)).status).toBe("cancelled");
  await worker.processEvent({
    event: "ONCRMDYNAMICITEMUPDATE",
    entityTypeId: 1050,
    itemId: 50,
  });
  await service.runJourney(queued.id);
  expect(service.get(queued.id).status).toBe("cancelled");
  expect(tasks.size).toBe(0);
});
it("evento de cancelamento respeita lease para não ser sobrescrito pela fila", async () => {
  const { service, store, auth, bitrix, session, remoteItem } = await setup();
  const created = await service.create(session, input);
  await service.runJourney(created.id);
  remoteItem.stageId = "CANCEL";
  store.lease(`journey:${created.id}`, "another-worker", 120000);
  const worker = new Worker(store, auth, bitrix, service);
  await expect(
    worker.processEvent({
      event: "ONCRMDYNAMICITEMUPDATE",
      entityTypeId: 1050,
      itemId: 50,
    }),
  ).rejects.toMatchObject({ code: "JOURNEY_BUSY", retryable: true });
  expect(service.get(created.id).status).toBe("active");
  store.release(`journey:${created.id}`, "another-worker");
  await worker.processEvent({
    event: "ONCRMDYNAMICITEMUPDATE",
    entityTypeId: 1050,
    itemId: 50,
  });
  expect(service.get(created.id).status).toBe("cancelled");
});
it("resposta vazia ou ID divergente do Bitrix não revela o snapshot da tarefa", async () => {
  const { service, session, access } = await setup();
  const created = await service.create(session, input);
  await service.runJourney(created.id);
  const employee: SessionInfo = {
    ...session,
    user: { ...session.user, id: "2" },
    role: "colaborador",
    canManage: false,
    canConfigure: false,
  };
  access.empty = true;
  expect(await service.visible(employee, service.get(created.id))).toBe(null);
  access.empty = false;
  access.mismatched = true;
  expect(await service.visible(employee, service.get(created.id))).toBe(null);
});
it("item CRM vazio ou divergente não libera acesso de RH ao snapshot", async () => {
  const { service, session, access } = await setup();
  const created = await service.create(session, input);
  await service.runJourney(created.id);
  access.crmEmpty = true;
  expect(await service.visible(session, service.get(created.id))).toBe(null);
  access.crmEmpty = false;
  access.crmMismatched = true;
  expect(await service.visible(session, service.get(created.id))).toBe(null);
});
it("reconciliação sem webhook cancela a jornada e ações não reabrem a SPA", async () => {
  const { service, store, auth, bitrix, session, remoteItem } = await setup();
  const created = await service.create(session, input);
  await service.runJourney(created.id);
  remoteItem.stageId = "CANCEL";
  const restarted = new Journeys(store, auth, bitrix),
    worker = new Worker(store, auth, bitrix, restarted);
  await worker.reconcile();
  expect(restarted.get(created.id).status).toBe("cancelled");
  const task = restarted.get(created.id).tasks[0];
  if (!task) throw new Error("missing task");
  await expect(
    restarted.action(session, task.id, { action: "start" }),
  ).rejects.toMatchObject({ code: "JOURNEY_CLOSED" });
  expect(remoteItem.stageId).toBe("CANCEL");
});
it("conclusão verifica cancelamento remoto mesmo antes da próxima sincronização", async () => {
  const { service, session, remoteItem, tasks } = await setup();
  const created = await service.create(session, input);
  await service.runJourney(created.id);
  for (const task of tasks.values()) task.status = "5";
  remoteItem.stageId = "CANCEL";
  await expect(service.complete(session, created.id)).rejects.toMatchObject({
    code: "JOURNEY_CLOSED",
  });
  expect(service.get(created.id).status).toBe("cancelled");
});
it("aprovação incompleta gera issue por item e não bloqueia aprovação válida", async () => {
  const { service, store, auth, bitrix, remoteItem, remoteItems, approvedIds } =
    await setup();
  store.put("rules", "current", [
    {
      id: "r1",
      name: "Aprovado",
      type: "onboarding",
      templateId: "model1",
      stageId: "ONBOARD",
      enabled: true,
    },
  ]);
  remoteItem.stageId = "ONBOARD";
  remoteItem.ufCrmDate = "";
  remoteItems.set(51, { ...remoteItem, id: 51, ufCrmDate: "2026-10-23" });
  approvedIds.push(50, 51);
  const worker = new Worker(store, auth, bitrix, service);
  await worker.reconcile();
  expect(store.list("journey", z.object({ sourceItemId: z.number() }))).toEqual(
    [{ sourceItemId: 51 }],
  );
  expect(service.issues()).toEqual([
    expect.objectContaining({ sourceItemId: 50 }),
  ]);
  remoteItem.ufCrmDate = "2026-10-22";
  await worker.reconcile();
  expect(
    store
      .list("journey", z.object({ sourceItemId: z.number() }))
      .map((item) => item.sourceItemId)
      .sort(),
  ).toEqual([50, 51]);
  expect(service.issues().filter((issue) => issue.sourceItemId === 50)).toEqual(
    [],
  );
});
it("issue de sincronização desaparece quando o acesso remoto se recupera", async () => {
  const { service, store, auth, bitrix, session, access } = await setup();
  const created = await service.create(session, input);
  await service.runJourney(created.id);
  const worker = new Worker(store, auth, bitrix, service);
  access.empty = true;
  await worker.reconcile();
  expect(
    service.issues().some((issue) => issue.id === `sync:${created.id}`),
  ).toBe(true);
  store.sqlite.prepare("update jobs set state='pending',available_at=? where id=?").run(Date.now(), `journey:${created.id}`);
  const failedJob = store.nextJobs().find(job => job.id === `journey:${created.id}`);
  if (!failedJob) throw new Error("missing queued journey job");
  store.failJob(failedJob, "INTERNAL", false);
  service.issue(`job:journey:${created.id}`, "Operação pendente", "Falha anterior", false);
  access.empty = false;
  await worker.reconcile();
  expect(
    service.issues().some((issue) => issue.id === `sync:${created.id}`),
  ).toBe(false);
  expect(
    service.issues().some((issue) => issue.id === `job:journey:${created.id}`),
  ).toBe(false);
  expect(store.sqlite.prepare("select state from jobs where id=?").get(`journey:${created.id}`)).toEqual({ state: "done" });
});
it("aprovação concorrente ao retorno da criação manual usa o mesmo vínculo", async () => {
  const { service, store, auth, bitrix, session, remoteItem, hooks } =
    await setup();
  store.put("rules", "current", [
    {
      id: "r1",
      name: "Aprovado",
      type: "onboarding",
      templateId: "model1",
      stageId: "ONBOARD",
      enabled: true,
    },
  ]);
  const manual = await service.create(session, input),
    worker = new Worker(store, auth, bitrix, service);
  hooks.afterSpaCommit = async () => {
    remoteItem.stageId = "ONBOARD";
    await worker.processEvent({
      event: "ONCRMDYNAMICITEMUPDATE",
      entityTypeId: 1050,
      itemId: 50,
    });
  };
  await service.runJourney(manual.id);
  expect(store.list("journey", z.object({ id: z.string() }))).toEqual([
    { id: manual.id },
  ]);
  expect(service.sourceJourney(1050, 50)?.id).toBe(manual.id);
  expect(service.sourceJourney(2070, 50)).toBe(null);
});
