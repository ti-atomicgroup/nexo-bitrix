import { describe, expect, it } from "vitest";
import { templateSchema } from "../../src/server/validation";
import { starterTemplates } from "../../src/server/seeds";
import { deadlineAt } from "../../src/server/domain";

describe("modelos iniciais de offboarding", () => {
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
