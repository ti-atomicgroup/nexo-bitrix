import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { fixtureWorkspace, mockWorkspaceApi } from "./fixtures";

test("guia público orienta instalação sem fabricar uma conexão", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Seu próximo processo começa aqui." }),
  ).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Navegação principal" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Guia de instalação" }).click();
  await expect(
    page.getByRole("heading", { name: "Guia rápido de instalação" }),
  ).toBeVisible();
  await expect(
    page.getByText("NEXO_ENCRYPTION_KEY", { exact: true }).first(),
  ).toBeVisible();
  mkdirSync("output/playwright", { recursive: true });
  await page.getByRole("button", { name: "Guia de instalação" }).click();
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
    page.getByRole("heading", { name: "Radar de prontidão" }),
  ).toBeVisible();
  await expect(page.getByText("Equipamento ainda não preparado")).toBeVisible();
  expect(new URL(page.url()).hash).toBe("");
  expect(
    await page.evaluate(() => ({
      local: localStorage.length,
      session: sessionStorage.length,
    })),
  ).toEqual({ local: 0, session: 0 });
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
  await page.getByRole("button", { name: /Lia Martins Analista/ }).click();
  const modal = page.getByRole("dialog");
  await expect(
    modal.getByRole("button", { name: "Concluir atividade", exact: true }),
  ).toBeDisabled();
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
  await modal.getByRole("button", { name: "Salvar modelo" }).click();
  await expect(modal).toHaveCount(0);
  expect(saved).toMatchObject({
    name: "Integração da equipe",
    stages: [{ title: "Antes da chegada" }, { title: "Primeiro dia" }],
  });
  expect(workspace.journeys[0].templateVersion).toBe(1);
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
  await mockWorkspaceApi(page, fixtureWorkspace());
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
  await page.screenshot({
    path: "output/playwright/nexo-mobile.png",
    fullPage: true,
  });
});

test("capturas da interface usam apenas dados fictícios de testes", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await mockWorkspaceApi(page, fixtureWorkspace());
  await page.screenshot({
    path: "output/playwright/nexo-central.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: /Lia Martins Analista/ }).click();
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
