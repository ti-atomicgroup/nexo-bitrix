import { describe, expect, it } from "vitest";
import { ledgerChecklistKey, ledgerGrants, ledgerItemText, matchLedgerKey, revokeChecklist } from "@/server/domain/ledger";
import { taskDescription, taskTitle } from "@/server/domain/task-text";
import { makeActivity, makeLedger } from "../../fakes/builders";

describe("texto das tarefas", () => {
  it("monta o título com pessoa, tipo e atividade", () => {
    expect(taskTitle("Ana Souza", "onboarding", "Criar conta Google Workspace")).toBe("Ana Souza · Onboarding — Criar conta Google Workspace");
    expect(taskTitle("Ana Souza", "offboarding", "Revogar acessos")).toBe("Ana Souza · Desligamento — Revogar acessos");
    const long = taskTitle("Ana", "onboarding", "x".repeat(400));
    expect(long).toHaveLength(250);
    expect(long.endsWith("…")).toBe(true);
  });

  it("descreve a tarefa em BBCode com contexto, instruções, links e rodapé", () => {
    const description = taskDescription({
      personName: "Ana Souza",
      kind: "onboarding",
      anchorDate: "2026-11-02",
      stageName: "Antes do 1º dia",
      instructions: "Crie a conta e ative o 2FA.",
      links: [{ label: "Guia [TI]", url: "https://exemplo.com/guia?a=1]" }],
    });
    expect(description).toContain("[B]Pessoa:[/B] Ana Souza");
    expect(description).toContain("[B]Jornada:[/B] Onboarding · 1º dia em 02/11/2026");
    expect(description).toContain("[B]Etapa:[/B] Antes do 1º dia");
    expect(description).toContain("Crie a conta e ative o 2FA.");
    expect(description).toContain("[URL=https://exemplo.com/guia?a=1%5D]Guia (TI)[/URL]");
    expect(description.endsWith("[I]Tarefa criada pelo Nexo.[/I]")).toBe(true);
    const offboarding = taskDescription({ personName: "Ana", kind: "offboarding", anchorDate: "2026-11-02", stageName: "Saída", instructions: "", links: [] });
    expect(offboarding).toContain("Desligamento · último dia em 02/11/2026");
    expect(offboarding).not.toContain("[B]Links[/B]");
  });
});

describe("inventário", () => {
  it("gera a lista Revogar e recolher a partir do que está com a pessoa", () => {
    const access = makeLedger({ id: "3f2504e0-4f89-11d3-9a0c-0305e82c3301", kind: "access", name: "Google Workspace" });
    const notebook = makeLedger({ id: "9a7b3c1d-0000-4000-8000-000000004471", kind: "equipment", name: "Notebook", detail: "4471" });
    const items = revokeChecklist([access, notebook]);
    expect(items).toEqual([
      { key: "ledger-3f2504e04f8911d39a0c0305e82c3301", text: "Revogar acesso: Google Workspace", done: false, bitrixItemId: null, ledger: null },
      { key: "ledger-9a7b3c1d000040008000000000004471", text: "Recolher equipamento: Notebook · 4471", done: false, bitrixItemId: null, ledger: null },
    ]);
    expect(items.every((item) => item.key.length <= 40)).toBe(true);
    expect(ledgerItemText(notebook)).toBe("Recolher equipamento: Notebook · 4471");
    expect(matchLedgerKey(ledgerChecklistKey(notebook.id), [access, notebook])?.id).toBe(notebook.id);
    expect(matchLedgerKey("google", [access, notebook])).toBeNull();
  });

  it("extrai concessões dos itens marcados com etiqueta de inventário", () => {
    const activity = makeActivity({
      checklist: [
        { key: "google", text: "Conta Google", done: true, bitrixItemId: "1", ledger: { kind: "access", name: "Google Workspace" } },
        { key: "notebook", text: "Notebook", done: false, bitrixItemId: "2", ledger: { kind: "equipment", name: "Notebook" } },
        { key: "guia", text: "Guia", done: true, bitrixItemId: "3", ledger: null },
      ],
    });
    expect(ledgerGrants(activity)).toEqual([
      { itemKey: "google", kind: "access", name: "Google Workspace", done: true },
      { itemKey: "notebook", kind: "equipment", name: "Notebook", done: false },
    ]);
  });
});
