import type { Page } from "@playwright/test";
import type {
  BitrixUser,
  Journey,
  JourneyTask,
  JourneyTemplate,
  Workspace,
} from "../../src/shared/contracts";

export const sessionToken = "test-session-" + "a".repeat(43);
const user = (
  id: string,
  name: string,
  position: string,
  department: string,
): BitrixUser => ({ id, name, position, department, active: true });
export const people = [
  user("11", "Marina Costa", "Analista de RH", "Pessoas"),
  user("22", "Lia Martins", "Analista de produto", "Produto"),
  user("33", "Bruno Almeida", "Designer de produto", "Produto"),
  user("44", "Rafael Lima", "Analista de TI", "Tecnologia"),
];
export function fixtureTemplate(): JourneyTemplate {
  return {
    id: "template-on",
    name: "Integração de novos colaboradores",
    description:
      "Da preparação ao primeiro mês, uma experiência bem organizada.",
    type: "onboarding",
    version: 1,
    updatedAt: "2026-10-22T12:00:00.000Z",
    stages: [
      {
        id: "stage-1",
        title: "Antes da chegada",
        activities: [
          {
            id: "activity-1",
            title: "Preparar equipamento e acessos",
            description:
              "Prepare o equipamento e valide os acessos necessários ao primeiro dia.",
            assigneeRole: "ti",
            offsetDays: -1,
            required: true,
            critical: true,
            visibility: "team",
            checklist: [
              { id: "check-1", title: "Configurar o notebook", required: true },
            ],
            documents: [],
          },
        ],
      },
      {
        id: "stage-2",
        title: "Primeiro dia",
        activities: [
          {
            id: "activity-2",
            title: "Apresentar a equipe e os canais",
            description:
              "Uma conversa para conhecer as pessoas e os canais de trabalho.",
            assigneeRole: "gestor",
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
  };
}
export function fixtureJourney(
  id = "journey-1",
  employee = people[1],
): Journey {
  const due = new Date(Date.now() - 3600000).toISOString();
  const tasks: JourneyTask[] = [
    {
      id: `${id}-task-1`,
      journeyId: id,
      title: "Preparar equipamento e acessos",
      description:
        "Prepare o equipamento e valide os acessos necessários ao primeiro dia.",
      stageTitle: "Antes da chegada",
      stageOrder: 0,
      assigneeRole: "ti",
      assignee: people[0],
      dueAt: due,
      required: true,
      critical: true,
      visibility: "team",
      bitrixTaskId: "301",
      bitrixUrl:
        "https://nexo-teste.bitrix24.com.br/company/personal/user/11/tasks/task/view/301/",
      status: "in_progress",
      syncState: "synced",
      checklist: [
        {
          id: "check-1",
          title: "Configurar o notebook",
          required: true,
          completed: false,
          bitrixId: "501",
        },
      ],
      documents: [],
    },
    {
      id: `${id}-task-2`,
      journeyId: id,
      title: "Apresentar a equipe e os canais",
      description:
        "Uma conversa para conhecer as pessoas e os canais de trabalho.",
      stageTitle: "Primeiro dia",
      stageOrder: 1,
      assigneeRole: "gestor",
      assignee: people[0],
      dueAt: new Date(Date.now() + 86400000).toISOString(),
      required: true,
      critical: false,
      visibility: "employee",
      bitrixTaskId: "302",
      bitrixUrl:
        "https://nexo-teste.bitrix24.com.br/company/personal/user/11/tasks/task/view/302/",
      status: "completed",
      syncState: "synced",
      checklist: [],
      documents: [],
    },
  ];
  return {
    id,
    type: "onboarding",
    employee,
    templateId: "template-on",
    templateName: "Integração de novos colaboradores",
    templateVersion: 1,
    referenceDate: new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date()),
    status: "active",
    source: "manual",
    sourceItemId: 71,
    sourceUrl: "https://nexo-teste.bitrix24.com.br/crm/",
    createdAt: new Date().toISOString(),
    completedAt: null,
    progress: 50,
    taskCount: 2,
    completedCount: 1,
    radar: "critical",
    tasks,
  };
}
export function fixtureWorkspace(): Workspace {
  const templates = [
    fixtureTemplate(),
    {
      ...fixtureTemplate(),
      id: "template-off",
      name: "Desligamento com transição organizada",
      description:
        "Equipamentos, acessos e conhecimento em uma transição acompanhada.",
      type: "offboarding" as const,
    },
  ];
  const journey = fixtureJourney();
  const second = {
    ...fixtureJourney("journey-2", people[2]),
    type: "offboarding" as const,
    templateId: "template-off",
    templateName: templates[1].name,
    radar: "attention" as const,
    tasks: fixtureJourney("journey-2", people[2]).tasks.map((t) => ({
      ...t,
      critical: false,
    })),
  };
  return {
    session: {
      user: people[0],
      role: "admin",
      portalDomain: "nexo-teste.bitrix24.com.br",
      memberId: "test-member",
      expiresAt: new Date(Date.now() + 1800000).toISOString(),
      canManage: true,
      canConfigure: true,
    },
    settings: {
      companyName: "Empresa fictícia · testes",
      timezone: "America/Sao_Paulo",
      portalDomain: "nexo-teste.bitrix24.com.br",
      applicationClientId: "test-app",
      automationUserId: "11",
      roleAssignments: {
        admin: ["11"],
        rh: ["11"],
        gestor: [],
        executor: [],
        colaborador: [],
      },
      defaultAssignees: { rh: "11", ti: "44", gestor: "11", outros: "11" },
      process: {
        entityTypeId: 1032,
        categoryId: 0,
        employeeField: "ufCrmEmployee",
        dateField: "ufCrmDate",
        onboardingStageId: "D1032_0:ON",
        offboardingStageId: "D1032_0:OFF",
        inProgressStageId: "D1032_0:RUN",
        completedStageId: "D1032_0:DONE",
        cancelledStageId: "D1032_0:CANCEL",
      },
      setupComplete: true,
    },
    journeys: [journey, second],
    templates,
    users: people,
    rules: [
      {
        id: "rule-on",
        name: "Admissão aprovada",
        type: "onboarding",
        templateId: "template-on",
        stageId: "D1032_0:ON",
        enabled: true,
      },
      {
        id: "rule-off",
        name: "Desligamento aprovado",
        type: "offboarding",
        templateId: "template-off",
        stageId: "D1032_0:OFF",
        enabled: true,
      },
    ],
    alerts: [
      {
        id: "alert-1",
        journeyId: journey.id,
        taskId: journey.tasks[0].id,
        title: "Equipamento ainda não preparado",
        employeeName: journey.employee.name,
        reason:
          "Atividade crítica com prazo vencido. Confirme a preparação para o primeiro dia.",
        severity: "critical",
        dueAt: journey.tasks[0].dueAt,
      },
    ],
    audit: [
      {
        id: "audit-1",
        action: "journey.started",
        message: "Jornada de Lia Martins iniciada pelo RH",
        actorName: "Marina Costa",
        createdAt: new Date().toISOString(),
        journeyId: journey.id,
      },
      {
        id: "audit-2",
        action: "task.completed",
        message: "Apresentação da equipe confirmada",
        actorName: "Marina Costa",
        createdAt: new Date(Date.now() - 1800000).toISOString(),
        journeyId: journey.id,
      },
    ],
    issues: [],
    lastSyncAt: new Date().toISOString(),
    syncRunning: false,
  };
}

export async function mockWorkspaceApi(
  page: Page,
  workspace: Workspace,
  calls: { path: string; body: unknown }[] = [],
) {
  await page.route("https://api.bitrix24.com/**", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: "window.BX24={init:function(cb){cb()},fitWindow:function(){},installFinish:function(){}}",
    }),
  );
  await page.route("http://127.0.0.1:3000/api/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname,
      method = route.request().method();
    const body: unknown =
      method === "POST" || method === "PUT"
        ? route.request().postDataJSON()
        : null;
    if (method !== "GET") calls.push({ path, body });
    const data =
      path === "/api/status"
        ? {
            installed: true,
            configured: true,
            portalDomain: workspace.session.portalDomain,
            appUrl: "http://127.0.0.1:3000",
            missingEnvironment: [],
            version: "1.0.0",
          }
        : path === "/api/workspace"
          ? workspace
          : path === "/api/sync"
            ? { queued: true }
            : null;
    if (data !== null) return route.fulfill({ json: { data } });
    return route.fulfill({
      status: 404,
      json: {
        error: {
          code: "TEST_ROUTE_MISSING",
          message: `Rota não configurada no teste: ${path}`,
        },
      },
    });
  });
  await page.goto(`/#session=${sessionToken}`);
  await page
    .getByRole("heading", { name: "Visão geral", exact: true })
    .waitFor();
}
