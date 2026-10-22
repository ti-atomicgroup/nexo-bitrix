import { describe, expect, it } from "vitest";
import { templateSchema } from "../../src/server/validation";
import { starterTemplates } from "../../src/server/seeds";

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
      expect(activities.find((item) => item.id.endsWith("acessos"))?.visibility).toBe("hr");
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
});
