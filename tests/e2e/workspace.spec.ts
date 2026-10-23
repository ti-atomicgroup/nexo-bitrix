import { expect, test } from "@playwright/test";
import { existsSync, mkdirSync } from "node:fs";
import { addRhTask, fixtureWorkspace, mockWorkspaceApi } from "./fixtures";

test("configuração pública mostra os pré-requisitos sem inventar conexão", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Configure a hospedagem" }),
  ).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Navegação principal" }),
  ).toHaveCount(0);
  await expect(
    page.getByText("NEXO_ENCRYPTION_KEY", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByText("BITRIX_PORTAL_URL", { exact: true }),
  ).toBeVisible();
  mkdirSync("output/playwright", { recursive: true });
  await page.screenshot({
    path: "output/playwright/nexo-instalacao.png",
    fullPage: true,
  });
});

test("central filtra jornadas e mantém a sessão somente em memória", async ({
  page,
}) => {
  const workspace = fixtureWorkspace();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await mockWorkspaceApi(page, workspace);
  await expect(
    page.getByRole("heading", { name: "Trabalho de hoje" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Radar de prontidão" }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(() => ({
      local: localStorage.length,
      session: sessionStorage.length,
    })),
  ).toEqual({ local: 0, session: 0 });
  await page
    .getByRole("navigation", { name: "Navegação principal" })
    .getByRole("button", { name: "Jornadas" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Radar de prontidão" }),
  ).toBeVisible();
  await expect(
    page.getByText(/Atividade crítica com prazo vencido/),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "Buscar pessoas ou jornadas" })
    .fill("Bruno");
  await page
    .getByRole("textbox", { name: "Buscar pessoas ou jornadas" })
    .press("Enter");
  await expect(
    page.getByRole("button", { name: /Bruno Almeida Designer/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Lia Martins Analista/ }),
  ).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("fila de RH mostra o contexto da prioridade e abre a atividade correta", async ({
  page,
}) => {
  const workspace = fixtureWorkspace();
  addRhTask(workspace);
  await mockWorkspaceApi(page, workspace);

  const queue = page.getByRole("region", { name: "Trabalho de hoje" });
  await expect(page.locator(".metric-strip")).toHaveCount(0);
  await expect(
    queue.getByRole("heading", { name: "Radar de prontidão" }),
  ).toHaveCount(0);
  await expect(
    queue.getByText("Conduzir conversa de boas-vindas", { exact: true }),
  ).toBeVisible();
  await expect(queue.getByText("Lia Martins").first()).toBeVisible();
  await expect(
    queue.getByText(/Responsável: Marina Costa/).first(),
  ).toBeVisible();
  await expect(queue.getByText(/Hoje/).first()).toBeVisible();
  await expect(
    queue.getByRole("button", { name: "Abrir atividade", exact: true }).first(),
  ).toBeVisible();

  await queue
    .getByRole("button", { name: "Abrir atividade", exact: true })
    .first()
    .click();
  const detail = page.getByRole("dialog");
  await expect(detail).toBeVisible();
  await expect(
    detail.getByRole("heading", { name: "Conduzir conversa de boas-vindas" }),
  ).toBeVisible();
});

test("iniciar jornada envia pessoa, modelo e responsáveis selecionados", async ({
  page,
}) => {
  const workspace = fixtureWorkspace();
  let received: unknown;
  await mockWorkspaceApi(page, workspace);
  await page.route("**/api/journeys", async (route) => {
    received = route.request().postDataJSON();
    await route.fulfill({ json: { data: workspace.journeys[0] } });
  });
  await page.getByRole("button", { name: "Nova jornada", exact: true }).click();
  const modal = page.getByRole("dialog");
  await modal
    .getByRole("combobox", { name: /^Colaborador/ })
    .selectOption("22");
  await modal
    .getByLabel("Data de admissão", { exact: false })
    .fill("2026-10-29");
  await modal.getByLabel("Modelo da jornada").selectOption("template-on");
  await modal.getByRole("button", { name: "Revisar atividades" }).click();
  await expect(
    modal.getByRole("heading", { name: "Revise o plano de trabalho" }),
  ).toBeVisible();
  await expect(modal.getByText(/perfil Vendedor/)).toBeVisible();
  await modal.getByLabel("Tecnologia", { exact: false }).selectOption("44");
  await modal.getByLabel("Gestor", { exact: false }).selectOption("11");
  await modal.getByRole("button", { name: "Iniciar jornada" }).click();
  await expect(
    page.getByRole("heading", { name: "Detalhes da jornada" }),
  ).toBeVisible();
  expect(received).toMatchObject({
    type: "onboarding",
    templateId: "template-on",
    employeeId: "22",
    referenceDate: "2026-10-29",
    assignees: { ti: "44", gestor: "11", colaborador: "22" },
  });
});

test("RH inicia um offboarding usando o modelo de saída selecionado", async ({
  page,
}) => {
  const workspace = fixtureWorkspace();
  let received: Record<string, unknown> | undefined;
  await mockWorkspaceApi(page, workspace);
  await page.route("**/api/journeys", async (route) => {
    received = route.request().postDataJSON();
    await route.fulfill({ json: { data: workspace.journeys[1] } });
  });
  await page.getByRole("button", { name: "Nova jornada", exact: true }).click();
  const modal = page.getByRole("dialog");
  await modal.getByRole("button", { name: /Offboarding/ }).click();
  await modal
    .getByRole("combobox", { name: /^Colaborador/ })
    .selectOption("33");
  await modal
    .getByLabel("Data de desligamento", { exact: false })
    .fill("2026-10-29");
  await modal.getByLabel("Modelo da jornada").selectOption("template-off");
  await modal.getByRole("button", { name: "Revisar atividades" }).click();
  await expect(
    modal.getByRole("heading", { name: "Revise o plano de trabalho" }),
  ).toBeVisible();
  await modal.getByRole("button", { name: "Iniciar jornada" }).click();
  await expect(
    page.getByRole("heading", { name: "Detalhes da jornada" }),
  ).toBeVisible();
  expect(received).toMatchObject({
    type: "offboarding",
    templateId: "template-off",
    employeeId: "33",
    referenceDate: "2026-10-29",
  });
});

test("RH revisa uma trilha sugerida antes de enviar plano aprovado para criar tarefas", async ({
  page,
}) => {
  const workspace = fixtureWorkspace(),
    calls: { path: string; body: unknown }[] = [];
  await mockWorkspaceApi(page, workspace, calls, true);
  let journeyBody: Record<string, unknown> | undefined;
  await page.route("**/api/ai/onboarding-trail", async (route) => {
    calls.push({
      path: "/api/ai/onboarding-trail",
      body: route.request().postDataJSON(),
    });
    await route.fulfill({
      json: {
        data: {
          templateId: "template-on",
          templateVersion: 1,
          profile: "Vendedor",
          competencies: [
            {
              name: "Colaboração",
              importance: "important",
              activityIds: ["activity-2"],
            },
          ],
          gaps: ["Conhecimento do produto"],
          activities: [
            {
              activityId: "activity-1",
              stageId: "stage-1",
              order: 0,
              offsetDays: -2,
              offsetUnit: "calendar_days",
              assigneeRole: "ti",
              reason: "Preparar ambiente antes da chegada.",
            },
            {
              activityId: "activity-2",
              stageId: "stage-2",
              order: 1,
              offsetDays: 7,
              offsetUnit: "business_days",
              assigneeRole: "gestor",
              reason: "A conversa apoia a integração no time.",
            },
          ],
        },
      },
    });
  });
  await page.route("**/api/journeys", async (route) => {
    journeyBody = route.request().postDataJSON();
    await route.fulfill({ json: { data: workspace.journeys[0] } });
  });
  await page.getByRole("button", { name: "Nova jornada", exact: true }).click();
  const modal = page.getByRole("dialog");
  await modal
    .getByRole("combobox", { name: /^Colaborador/ })
    .selectOption("22");
  await modal
    .getByLabel("Data de admissão", { exact: false })
    .fill("2026-10-29");
  await modal.getByLabel("Modelo da jornada").selectOption("template-on");
  await modal
    .getByLabel("Descrição da vaga")
    .fill(
      "Pessoa responsável pelo relacionamento com clientes B2B, colaboração com o time e uso das ferramentas comerciais.",
    );
  await modal.getByRole("button", { name: "Montar trilha com IA" }).click();
  expect(journeyBody).toBeUndefined();
  await modal.getByRole("button", { name: "Revisar atividades" }).click();
  await expect(modal.getByText("Proposta pronta para revisão")).toBeVisible();
  await expect(modal.getByText("Conhecimento do produto")).toBeVisible();
  await page.screenshot({ path: "test-results/nexo-trilha-review.png" });
  await modal.getByLabel("Tecnologia", { exact: false }).selectOption("44");
  await modal.getByLabel("Gestor", { exact: false }).selectOption("11");
  await modal.getByRole("button", { name: "Iniciar jornada" }).click();
  expect(
    calls.find((call) => call.path === "/api/ai/onboarding-trail")?.body,
  ).toEqual({
    templateId: "template-on",
    description:
      "Pessoa responsável pelo relacionamento com clientes B2B, colaboração com o time e uso das ferramentas comerciais.",
  });
  expect(journeyBody?.approvedTrail).toMatchObject({
    templateId: "template-on",
    competencies: [{ name: "Colaboração" }],
    activities: [
      { activityId: "activity-1", offsetDays: -2 },
      { activityId: "activity-2", offsetDays: 7, offsetUnit: "business_days" },
    ],
  });
  expect(JSON.stringify(journeyBody)).not.toContain(
    "Pessoa responsável pelo relacionamento",
  );
});

test("checklist obrigatório impede conclusão e status em aprovação continua pendente", async ({
  page,
}) => {
  const workspace = fixtureWorkspace();
  await mockWorkspaceApi(page, workspace);
  await page.route("**/api/tasks/*/action", async (route) => {
    const body = route.request().postDataJSON();
    const task = workspace.journeys[0].tasks[0];
    if (body.action === "check" && body.checklistId === "check-1")
      task.checklist[0].completed = true;
    else if (body.action === "complete") task.status = "awaiting_review";
    else
      return route.fulfill({
        status: 400,
        json: {
          error: {
            code: "UNEXPECTED_ACTION",
            message: "Ação inesperada no teste",
          },
        },
      });
    await route.fulfill({ json: { data: task } });
  });
  await page.getByRole("button", { name: "Jornadas", exact: true }).click();
  await page.getByRole("button", { name: /Lia Martins Analista/ }).click();
  const modal = page.getByRole("dialog");
  await expect(
    modal.getByRole("button", { name: "Concluir atividade", exact: true }),
  ).toBeDisabled();
  await expect(modal.getByText("Coluna no Kanban")).toBeVisible();
  await expect(modal.getByText("A fazer", { exact: true })).toBeVisible();
  await modal.getByLabel("Configurar o notebook").click();
  await expect(modal.getByLabel("Configurar o notebook")).toBeChecked();
  await expect(
    modal.getByRole("button", { name: "Concluir atividade", exact: true }),
  ).toBeEnabled();
  await modal
    .getByRole("button", { name: "Concluir atividade", exact: true })
    .click();
  await expect(modal.getByText("Aguardando aprovação no Bitrix")).toBeVisible();
  await expect(
    modal.getByRole("button", { name: "Concluir jornada", exact: true }),
  ).toBeDisabled();
});

test("edição de modelo preserva a versão da jornada existente", async ({
  page,
}) => {
  const workspace = fixtureWorkspace();
  let saved: unknown;
  await mockWorkspaceApi(page, workspace);
  await page.route("**/api/templates/template-on", async (route) => {
    saved = route.request().postDataJSON();
    workspace.templates[0] = {
      ...workspace.templates[0],
      name: "Integração da equipe",
      profile: "Liderança",
      version: 2,
    };
    await route.fulfill({ json: { data: workspace.templates[0] } });
  });
  await page.getByRole("button", { name: "Modelos", exact: true }).click();
  await page.getByRole("button", { name: "Editar modelo" }).first().click();
  const modal = page.getByRole("dialog");
  await modal
    .getByLabel("Nome do modelo", { exact: false })
    .fill("Integração da equipe");
  await modal.getByLabel("Perfil do colaborador").fill("Liderança");
  await modal.getByRole("button", { name: "Revisar modelo" }).click();
  await expect(
    modal.getByRole("heading", { name: "Integração da equipe" }),
  ).toBeVisible();
  await modal.getByRole("button", { name: "Salvar modelo" }).click();
  await expect(modal).toHaveCount(0);
  expect(saved).toMatchObject({
    name: "Integração da equipe",
    profile: "Liderança",
    stages: [{ title: "Antes da chegada" }, { title: "Primeiro dia" }],
  });
  expect(workspace.journeys[0].templateVersion).toBe(1);
  expect(workspace.journeys[0].templateProfile).toBe("Vendedor");
});

test("RH filtra modelos pelo perfil de destino", async ({ page }) => {
  const workspace = fixtureWorkspace();
  workspace.templates.push({
    ...workspace.templates[0],
    id: "template-rh",
    name: "Integração RH",
    profile: "RH",
  });
  await mockWorkspaceApi(page, workspace);
  await page.getByRole("button", { name: "Modelos", exact: true }).click();
  await page.getByLabel("Filtrar modelos por perfil").selectOption("RH");
  await expect(
    page.getByRole("heading", { name: "Integração RH" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Integração de novos colaboradores" }),
  ).toHaveCount(0);
});

test("configuração mostra o projeto privado e o acesso ao Kanban do Bitrix", async ({
  page,
}) => {
  const workspace = fixtureWorkspace();
  workspace.settings.rhProject = {
    id: "52",
    name: "Nexo · RH",
    url: "https://nexo-teste.bitrix24.com.br/workgroups/group/52/",
  };
  await mockWorkspaceApi(page, workspace);
  await page
    .getByRole("button", { name: "Configurações", exact: true })
    .click();
  await expect(page.getByText("Projeto privado do RH")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Abrir Kanban" }),
  ).toHaveAttribute("href", workspace.settings.rhProject.url);
  await expect(page.getByText(/ONTASKUPDATE/)).toBeVisible();
});

test("automação pode ser pausada sem ocultar o estado da instalação", async ({
  page,
}) => {
  const workspace = fixtureWorkspace();
  await mockWorkspaceApi(page, workspace);
  await page.route("**/api/setup", async (route) => {
    const body = route.request().postDataJSON();
    workspace.rules = body.rules;
    expect(body.settings.setupComplete).toBe(true);
    await route.fulfill({ json: { data: workspace.settings } });
  });
  await page.getByRole("button", { name: "Automações", exact: false }).click();
  await page
    .getByRole("switch", { name: "Desativar Admissão aprovada" })
    .click();
  await expect(
    page.getByRole("switch", { name: "Ativar Admissão aprovada" }),
  ).not.toBeChecked();
  await expect(
    page.getByText("Conclua a configuração para iniciar suas jornadas."),
  ).toHaveCount(0);
});

test("layout móvel permite navegar e abrir uma jornada sem vazamento horizontal", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const workspace = fixtureWorkspace();
  addRhTask(workspace);
  await mockWorkspaceApi(page, workspace);
  await page.screenshot({
    path: "output/playwright/nexo-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Abrir menu", exact: true }).click();
  await page.getByRole("button", { name: "Jornadas", exact: true }).click();
  await page.getByRole("button", { name: /Lia Martins Analista/ }).click();
  const modal = page.getByRole("dialog");
  await expect(modal).toBeVisible();
  const bounds = await modal.boundingBox();
  expect(bounds && bounds.x >= 0 && bounds.x + bounds.width <= 391).toBe(true);
  const horizontalOverflow = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
    containers: [
      ".app-main",
      ".page-content",
      ".workspace-section",
      ".table-scroll",
    ].map((selector) => {
      const element = document.querySelector<HTMLElement>(selector);
      const rect = element?.getBoundingClientRect();
      return {
        selector,
        left: rect?.left,
        right: rect?.right,
        width: rect?.width,
        scrollWidth: element?.scrollWidth,
        overflowX: element && getComputedStyle(element).overflowX,
      };
    }),
    offenders: [...document.querySelectorAll<HTMLElement>("body *")]
      .map((element) => ({
        tag: element.tagName,
        className: String(element.className).slice(0, 120),
        right: Math.round(element.getBoundingClientRect().right),
        scrollWidth: element.scrollWidth,
        clientWidth: element.clientWidth,
      }))
      .filter((element) => element.right > window.innerWidth + 1)
      .slice(0, 12),
  }));
  expect(
    horizontalOverflow.documentWidth,
    JSON.stringify(horizontalOverflow),
  ).toBeLessThanOrEqual(horizontalOverflow.viewportWidth);
});

test("telas operacionais mantêm título, navegação e detalhe sem transbordar no mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockWorkspaceApi(page, fixtureWorkspace());
  const navigation = page.getByRole("navigation", {
    name: "Navegação principal",
  });
  await expect(page.locator(".topbar-sync-status")).toContainText(
    "Atualizado agora",
  );
  const screens = [
    { nav: "Jornadas", heading: "Jornadas" },
    { nav: "Modelos", heading: "Modelos de jornada" },
    { nav: "Automações", heading: "Automações" },
    { nav: "Configurações", heading: "Configurações" },
  ];
  for (const screen of screens) {
    await page.getByRole("button", { name: "Abrir menu", exact: true }).click();
    await navigation
      .getByRole("button", { name: new RegExp(screen.nav) })
      .click();
    await expect(
      page.getByRole("heading", { name: screen.heading, exact: true }),
    ).toBeVisible();
    await expect(
      navigation.getByRole("button", { name: new RegExp(screen.nav) }),
    ).toHaveAttribute("aria-current", "page");
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(390);
  }
  await page.getByRole("button", { name: "Abrir menu", exact: true }).click();
  await navigation
    .getByRole("button", { name: "Jornadas", exact: true })
    .click();
  await page
    .getByRole("button", { name: /Lia Martins Analista de produto/ })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
});

test("capturas da interface usam apenas dados fictícios de testes", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 1000 });
  const workspace = fixtureWorkspace();
  addRhTask(workspace);
  await mockWorkspaceApi(page, workspace);
  await page.screenshot({
    path: "output/playwright/nexo-central.png",
    fullPage: true,
  });
  await page
    .getByRole("region", { name: "Trabalho de hoje" })
    .getByRole("button", { name: "Abrir atividade", exact: true })
    .click();
  await page.getByRole("dialog").waitFor();
  await page.waitForTimeout(180);
  await page.screenshot({
    path: "output/playwright/nexo-jornada.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Fechar janela" }).click();
  await page.getByRole("button", { name: "Modelos", exact: true }).click();
  await page.screenshot({
    path: "output/playwright/nexo-modelos.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Automações", exact: false }).click();
  await page.screenshot({
    path: "output/playwright/nexo-automacoes.png",
    fullPage: true,
  });
});

test("gera uma coleção de telas do Nexo com dados fictícios", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 1000 });
  const workspace = fixtureWorkspace();
  addRhTask(workspace);
  await mockWorkspaceApi(page, workspace, [], true);
  await page.route("**/api/ai/onboarding-trail", async (route) => {
    await route.fulfill({
      json: {
        data: {
          templateId: "template-on",
          templateVersion: 1,
          profile: "Vendedor",
          competencies: [
            {
              name: "Colaboração",
              importance: "important",
              activityIds: ["activity-2"],
            },
          ],
          gaps: ["Conhecimento do produto"],
          activities: [
            {
              activityId: "activity-1",
              stageId: "stage-1",
              order: 0,
              offsetDays: -2,
              offsetUnit: "calendar_days",
              assigneeRole: "ti",
              reason: "Preparar o ambiente antes da chegada.",
            },
            {
              activityId: "activity-2",
              stageId: "stage-2",
              order: 1,
              offsetDays: 7,
              offsetUnit: "business_days",
              assigneeRole: "gestor",
              reason: "A conversa apoia a integração no time.",
            },
          ],
        },
      },
    });
  });
  mkdirSync("output/playwright/nexo-demo", { recursive: true });
  const captured: string[] = [];
  const capture = async (name: string) => {
    await page.screenshot({
      path: `output/playwright/nexo-demo/${name}`,
      fullPage: true,
    });
    captured.push(name);
  };

  await capture("01-central-rh.png");
  await page
    .getByRole("region", { name: "Trabalho de hoje" })
    .getByRole("button", { name: "Abrir atividade", exact: true })
    .first()
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await capture("02-atividade-rh.png");
  await page.getByRole("button", { name: "Fechar janela" }).click();

  await page.getByRole("button", { name: "Jornadas", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Radar de prontidão" }),
  ).toBeVisible();
  await capture("03-radar-e-jornadas.png");
  await page.getByRole("button", { name: /Bruno Almeida/ }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await capture("04-detalhe-offboarding.png");
  await page.getByRole("button", { name: "Fechar janela" }).click();

  await page.getByRole("button", { name: "Modelos", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Modelos de jornada" }),
  ).toBeVisible();
  await capture("05-modelos-por-perfil.png");
  await page.getByRole("button", { name: "Editar modelo" }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await capture("06-editor-de-modelo.png");
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Automações", exact: false }).click();
  await capture("07-regras-de-automacao.png");
  await page
    .getByRole("button", { name: "Configurações", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Configurações", exact: true }),
  ).toBeVisible();
  await capture("08-configuracoes-bitrix.png");

  await page.getByRole("button", { name: "Visão geral", exact: true }).click();
  await page.getByRole("button", { name: "Nova jornada", exact: true }).click();
  const modal = page.getByRole("dialog");
  await expect(modal).toBeVisible();
  await capture("09-nova-jornada.png");
  await modal
    .getByRole("combobox", { name: /^Colaborador/ })
    .selectOption("22");
  await modal.getByLabel("Data de admissão", { exact: false }).fill("2026-10-29");
  await modal.getByLabel("Modelo da jornada").selectOption("template-on");
  await modal
    .getByLabel("Descrição da vaga")
    .fill("Relacionamento com clientes B2B e colaboração com o time comercial.");
  await modal.getByRole("button", { name: "Montar trilha com IA" }).click();
  await expect(
    modal.getByRole("button", { name: "Gerar nova sugestão" }),
  ).toBeDisabled();
  await modal.getByRole("button", { name: "Revisar atividades" }).click();
  await expect(modal.getByText("Proposta pronta para revisão")).toBeVisible();
  await capture("10-revisao-da-trilha-ia.png");

  await page.getByRole("button", { name: "Fechar janela" }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Abrir menu", exact: true }).click();
  await page.getByRole("button", { name: "Visão geral", exact: true }).click();
  await capture("11-central-rh-mobile.png");
  expect(captured).toHaveLength(11);
  expect(captured.every((name) => existsSync(`output/playwright/nexo-demo/${name}`))).toBe(true);
});

test("interface principal atende verificações automáticas de acessibilidade", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await mockWorkspaceApi(page, fixtureWorkspace());
  await page.addScriptTag({ path: require.resolve("axe-core/axe.min.js") });
  const violations = await page.evaluate(async () => {
    const axe = (window as typeof window & { axe: typeof import("axe-core") })
      .axe;
    const result = await axe.run(document, {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
    });
    return result.violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      nodes: violation.nodes.map((node) => ({
        target: node.target.join(" "),
        color: node.failureSummary?.match(
          /foreground color: (#[0-9a-f]+)/,
        )?.[1],
      })),
    }));
  });
  expect(violations).toEqual([]);
  await page.getByRole("button", { name: "Jornadas", exact: true }).click();
  await page.getByRole("button", { name: /Lia Martins Analista/ }).click();
  const modalViolations = await page.evaluate(async () => {
    const axe = (window as typeof window & { axe: typeof import("axe-core") })
      .axe;
    const result = await axe.run(document, {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
    });
    return result.violations.map((violation) => ({
      id: violation.id,
      nodes: violation.nodes.map((node) => ({
        target: node.target.join(" "),
        color: node.failureSummary?.match(
          /foreground color: (#[0-9a-f]+)/,
        )?.[1],
      })),
    }));
  });
  expect(modalViolations).toEqual([]);
});

test("guia público mantém contraste legível", async ({ page }) => {
  await page.goto("/");
  await page.addScriptTag({ path: require.resolve("axe-core/axe.min.js") });
  const violations = await page.evaluate(async () => {
    const axe = (window as typeof window & { axe: typeof import("axe-core") })
      .axe;
    const result = await axe.run(document, {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
    });
    return result.violations.map((violation) => ({
      id: violation.id,
      nodes: violation.nodes.map((node) => ({
        target: node.target.join(" "),
        color: node.failureSummary?.match(
          /foreground color: (#[0-9a-f]+)/,
        )?.[1],
      })),
    }));
  });
  expect(violations).toEqual([]);
});
