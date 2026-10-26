import { describe, expect, it } from "vitest";
import { activityLibrary } from "@/server/seeds/library";
import { starterTemplates } from "@/server/seeds/templates";
import { templateActivityInput, templateInput } from "@/shared/schemas";

describe("trilhas iniciais", () => {
  const templates = starterTemplates();

  it("traz as cinco trilhas válidas pelo esquema", () => {
    expect(templates.map((template) => template.name)).toEqual([
      "Onboarding · Geral",
      "Onboarding · Vendas",
      "Onboarding · Tecnologia",
      "Desligamento · Voluntário",
      "Desligamento · Involuntário",
    ]);
    for (const template of templates) expect(templateInput.safeParse(template).success).toBe(true);
  });

  it("marca acessos e equipamentos para o inventário e tem atividades do colaborador visíveis no link", () => {
    const general = templates[0]!;
    const items = general.stages.flatMap((stage) => stage.activities.flatMap((activity) => activity.checklist));
    expect(items.filter((item) => item.ledger?.kind === "access").map((item) => item.ledger?.name)).toEqual(["Google Workspace", "Notion", "Bitrix24"]);
    expect(items.filter((item) => item.ledger?.kind === "equipment").map((item) => item.ledger?.name)).toEqual(["Notebook", "Headset", "Crachá"]);
    const employee = general.stages.flatMap((stage) => stage.activities).filter((activity) => activity.role === "colaborador");
    expect(employee.length).toBeGreaterThan(0);
    expect(employee.every((activity) => activity.visibility === "employee")).toBe(true);
    expect(templates[1]!.stages[0]!.activities.some((activity) => activity.checklist.some((item) => item.ledger?.name === "CRM"))).toBe(true);
    expect(templates[2]!.stages[0]!.activities.some((activity) => activity.checklist.some((item) => item.ledger?.name === "GitHub"))).toBe(true);
  });

  it("usa liberação por início, data e etapa anterior; saídas têm a tarefa Revogar e recolher", () => {
    expect(templates[0]!.stages.map((stage) => stage.releaseMode)).toEqual(["start", "offset", "after_previous", "offset"]);
    expect(templates[3]!.stages.map((stage) => [stage.releaseMode, stage.releaseOffsetDays])).toEqual([
      ["start", 0],
      ["offset", -5],
      ["offset", 0],
      ["offset", 2],
    ]);
    for (const offboarding of templates.slice(3)) {
      const revoke = offboarding.stages.flatMap((stage) => stage.activities).filter((activity) => activity.ledgerRole === "revoke_and_collect");
      expect(revoke).toHaveLength(1);
      expect(revoke[0]).toMatchObject({ role: "ti", dueOffsetDays: 0 });
    }
  });

  it("não cita empresas, pessoas ou telefones reais", () => {
    const text = JSON.stringify(templates);
    expect(text).not.toMatch(/Atomic|Atômico|Koopere|People|WhatsApp|\(\d{2}\)\s?\d{4,5}-?\d{4}/);
  });
});

describe("biblioteca de atividades", () => {
  it("agrupa atividades válidas por tema", () => {
    const library = activityLibrary();
    expect(new Set(library.map((entry) => entry.group))).toEqual(new Set(["Boas-vindas", "Acessos e TI", "Gestão", "Cultura", "Desligamento"]));
    expect(new Set(library.map((entry) => entry.id)).size).toBe(library.length);
    for (const entry of library) expect(templateActivityInput.safeParse(entry.activity).success).toBe(true);
    expect(library.find((entry) => entry.activity.ledgerRole === "revoke_and_collect")?.journeyKind).toBe("offboarding");
  });
});
