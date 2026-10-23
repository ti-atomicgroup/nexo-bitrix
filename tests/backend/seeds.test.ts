import { describe, expect, it } from "vitest";
import { templateSchema } from "../../src/server/validation";
import { starterTemplates } from "../../src/server/seeds";
import { deadlineAt } from "../../src/server/domain";
import { journeySchema, settingsSchema, taskSchema, templateSchema as sharedTemplateSchema } from "../../src/shared/validation";

describe("modelos iniciais de offboarding", () => {
  it("lê registros antigos com defaults e preserva perfil e coluna Kanban quando presentes", () => {
    const oldTemplate = { id: "legacy", name: "Geral", description: "", type: "onboarding", version: 1, stages: [{ id: "s", title: "Entrada", activities: [{ id: "a", title: "Boas-vindas", description: "", assigneeRole: "rh", offsetDays: 0, required: true, critical: false, visibility: "hr", checklist: [], documents: [] }] }], updatedAt: "2026-10-23" };
    expect(sharedTemplateSchema.parse(oldTemplate).profile).toBe("Geral");
    expect(sharedTemplateSchema.parse(oldTemplate).stages[0]?.activities[0]?.competencies).toEqual([]);
    expect(templateSchema.parse({ ...oldTemplate, profile: "Vendedor" }).profile).toBe("Vendedor");
    expect(templateSchema.parse({ ...oldTemplate, stages: [{ ...oldTemplate.stages[0], activities: [{ ...oldTemplate.stages[0]?.activities[0], competencies: ["Negociação", "CRM"] }] }] }).stages[0]?.activities[0]?.competencies).toEqual(["Negociação", "CRM"]);

    const oldTask = { id: "t", journeyId: "j", title: "Tarefa", description: "", stageTitle: "Entrada", stageOrder: 0, assigneeRole: "rh", assignee: null, dueAt: "2026-10-23", required: true, critical: false, visibility: "hr", bitrixTaskId: "9", bitrixUrl: null, status: "pending", syncState: "synced", checklist: [], documents: [] };
    expect(taskSchema.parse(oldTask)).toMatchObject({ bitrixStageId: null, bitrixStageTitle: null });
    expect(taskSchema.parse({ ...oldTask, bitrixStageId: "2", bitrixStageTitle: "Em andamento" })).toMatchObject({ bitrixStageId: "2", bitrixStageTitle: "Em andamento" });

    const user = { id: "3", name: "Ana", position: "Vendedora", department: "Comercial", active: true };
    const oldJourney = { id: "j", type: "onboarding", employee: user, templateId: "legacy", templateName: "Geral", templateVersion: 1, referenceDate: "2026-10-23", status: "active", source: "manual", sourceItemId: null, sourceUrl: null, createdAt: "2026-10-23", completedAt: null, progress: 0, taskCount: 1, completedCount: 0, radar: "ok", tasks: [oldTask] };
    expect(journeySchema.parse(oldJourney)).toMatchObject({ templateProfile: "Geral", approvedTrail: null, tasks: [{ bitrixStageId: null }] });
    const settings = { companyName: "Atomic", timezone: "America/Sao_Paulo", portalDomain: "helpbr24.bitrix24.com.br", applicationClientId: "", automationUserId: null, roleAssignments: { admin: [], rh: [], gestor: [], executor: [], colaborador: [] }, defaultAssignees: {}, process: null, setupComplete: false };
    expect(settingsSchema.parse(settings).rhProject).toBeNull();
  });

  it("mantém modelos distintos e válidos para saída voluntária e involuntária", () => {
    expect(starterTemplates.every((template) => templateSchema.safeParse(template).success)).toBe(true);
    expect(new Set(starterTemplates.map((template) => template.id)).size).toBe(starterTemplates.length);
    expect(starterTemplates.filter((template) => template.type === "offboarding").map((template) => template.name)).toEqual([
      "Saída voluntária",
      "Saída involuntária",
    ]);
  });

  it("exige devolução, revogação, orientações e registro sem expor tarefas internas", () => {
    for (const template of starterTemplates.filter((item) => item.type === "offboarding")) {
      const activities = template.stages.flatMap((stage) => stage.activities);
      for (const id of ["equipamentos", "acessos", "orientacoes", "registro"]) {
        const activity = activities.find((item) => item.id.endsWith(id));
        expect(activity, `${template.name}: ${id}`).toBeDefined();
        expect(activity?.required).toBe(true);
        expect(activity?.checklist.every((item) => item.required)).toBe(true);
      }
      expect(activities.find((item) => item.id.endsWith("acessos"))?.visibility).toBe("team");
      expect(activities.find((item) => item.id.endsWith("orientacoes"))?.visibility).toBe("employee");
      expect(activities.find((item) => item.id.endsWith("registro"))?.visibility).toBe("hr");
    }
    const voluntary = starterTemplates.find((template) => template.id === "nexo-offboarding-voluntario");
    expect(voluntary?.stages.flatMap((stage) => stage.activities).find((item) => item.id === "voluntario-entrevista")?.visibility).toBe("hr");
    const faq = voluntary?.stages.flatMap((stage) => stage.activities).find((item) => item.id === "voluntario-faq");
    expect(faq?.description).toContain("Como falar com a Koopere?");
    expect(faq?.description).toContain("Como falar com a Atomic Group?");
    expect(faq?.description).toContain("saída voluntária");
    expect(faq?.description).toContain("saída involuntária");
  });

  it("avisa TI em dias úteis e cobre o SOP de acessos", () => {
    const onboarding = starterTemplates.find((template) => template.type === "onboarding");
    const arrival = onboarding?.stages.flatMap((stage) => stage.activities) ?? [];
    const arrivalNotice = arrival.find((activity) => activity.id === "onboarding-ti-aviso");
    expect([arrivalNotice?.assigneeRole, arrivalNotice?.offsetDays, arrivalNotice?.offsetUnit]).toEqual(["ti", -3, "business_days"]);
    const arrivalChecks = arrival.find((activity) => activity.id === "onboarding-ti")?.checklist.map((item) => item.title).join(" ") ?? "";
    for (const system of ["Google Workspace", "Notion", "Bitrix24", "2FA", "segurança", "área"]) expect(arrivalChecks).toContain(system);
    for (const template of starterTemplates.filter((item) => item.type === "offboarding")) {
      const activities = template.stages.flatMap((stage) => stage.activities);
      const notice = activities.find((activity) => activity.id.endsWith("ti-aviso"));
      expect([notice?.assigneeRole, notice?.offsetDays, notice?.offsetUnit]).toEqual(["ti", -1, "business_days"]);
      const shutdownChecks = activities.find((activity) => activity.id.endsWith("acessos"))?.checklist.map((item) => item.title).join(" ") ?? "";
      for (const system of ["Google Workspace", "Google Drive", "Notion", "Bitrix24", "demais sistemas", "controle de acessos"]) expect(shutdownChecks).toContain(system);
    }
  });

  it("calcula avisos úteis atravessando o fim de semana", () => {
    expect(deadlineAt("2026-10-26", -3, "America/Sao_Paulo", "business_days")).toBe("2026-10-21T21:00:00.000Z");
    expect(deadlineAt("2026-10-26", -1, "America/Sao_Paulo", "business_days")).toBe("2026-10-23T21:00:00.000Z");
    expect(deadlineAt("2026-10-26", -1, "America/Sao_Paulo")).toBe("2026-10-25T21:00:00.000Z");
  });
});
