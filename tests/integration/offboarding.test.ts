import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { listActivities } from "@/server/db/repos/activities";
import { getJourney } from "@/server/db/repos/journeys";
import { getLedgerItem, listLedger } from "@/server/db/repos/ledger";
import { findPersonByBitrixId } from "@/server/db/repos/people";
import { createTemplate } from "@/server/db/repos/templates";
import { completionCheck } from "@/server/domain";
import { addManualLedgerItem, applyActivityAction, applyJourneyAction, createJourney, markDoneFromLink, waiveLedgerItem } from "@/server/engine";
import { templateInput } from "@/shared/schemas";
import { activityByTitle, advance, cycle, HR_ACTOR, prepare, setupEngine, templateId, type EngineEnv } from "../fakes/engine-setup";

let env: EngineEnv;
beforeEach(() => {
  env = setupEngine();
});
afterEach(() => env.cleanup());

/** Saída curta: TI "Revogar e recolher" no último dia, colaborador devolve, RH opcional. */
const shortOffboarding = () =>
  createTemplate(
    templateInput.parse({
      kind: "offboarding",
      name: "Saída curta",
      stages: [
        {
          name: "Último dia",
          releaseMode: "start",
          activities: [
            {
              title: "Revogar e recolher",
              role: "ti",
              dueOffsetDays: 0,
              ledgerRole: "revoke_and_collect",
              checklist: [{ key: "email", text: "Encaminhar o e-mail corporativo" }],
            },
            { title: "Devolva equipamentos e crachá", role: "colaborador", dueOffsetDays: 0, visibility: "employee", kind: "delivery" },
            { title: "Agradecer", role: "rh", dueOffsetDays: 1, required: false },
          ],
        },
      ],
    }),
  );

function personId(): string {
  return findPersonByBitrixId("12")!.id;
}

function startOffboarding(template: string): string {
  return createJourney(
    { requestId: randomUUID(), kind: "offboarding", person: { bitrixUserId: "12" }, templateId: template, anchorDate: "2026-10-30", participants: {}, offboardingReason: "voluntary" },
    HR_ACTOR,
  ).id;
}

describe("Tudo o que entrou, sai", () => {
  it("a saída cria uma tarefa de TI com exatamente o que está com a pessoa e só o inventário pendente bloqueia", async () => {
    await prepare();
    const google = addManualLedgerItem(personId(), { kind: "access", name: "Google Workspace", detail: "" }, HR_ACTOR);
    const notebook = addManualLedgerItem(personId(), { kind: "equipment", name: "Notebook", detail: "4471" }, HR_ACTOR);
    const id = startOffboarding(shortOffboarding().id);

    const revoke = activityByTitle(id, "Revogar e recolher");
    expect(revoke.checklist.map((item) => item.text)).toEqual(["Encaminhar o e-mail corporativo", "Revogar acesso: Google Workspace", "Recolher equipamento: Notebook · 4471"]);
    expect([getLedgerItem(google.id)?.status, getLedgerItem(notebook.id)?.status]).toEqual(["return_requested", "return_requested"]);
    expect(getLedgerItem(google.id)).toMatchObject({ closingJourneyId: id, closingActivityId: revoke.id });

    await cycle();
    const taskId = activityByTitle(id, "Revogar e recolher").bitrixTaskId!;
    const items = env.fake.checklistOf(taskId);
    expect(items.find((item) => item.parentId === 0)?.title).toBe("Revogar e recolher");
    expect(items.filter((item) => item.parentId !== 0).map((item) => item.title)).toEqual([
      "Encaminhar o e-mail corporativo",
      "Revogar acesso: Google Workspace",
      "Recolher equipamento: Notebook · 4471",
    ]);

    // O colaborador marca pelo link; a TI marca o acesso e fecha a tarefa no Bitrix.
    expect(markDoneFromLink(id, activityByTitle(id, "Devolva equipamentos e crachá").id)).toEqual({ ok: true, message: "Pronto! Marcamos como feita." });
    expect(markDoneFromLink(id, activityByTitle(id, "Agradecer").id).ok).toBe(false);
    env.fake.checkItem(taskId, "Revogar acesso: Google Workspace");
    env.fake.closeTask(taskId);
    await cycle();
    expect(getLedgerItem(google.id)).toMatchObject({ status: "closed", closingActivityId: revoke.id });
    expect(getLedgerItem(google.id)?.closedAt).not.toBeNull();

    const journey = getJourney(id)!;
    expect(completionCheck(journey, listActivities(id), listLedger(personId())).blockers).toEqual(["1 item do inventário ainda com a pessoa."]);
    expect(() => applyJourneyAction(id, { action: "complete" }, HR_ACTOR)).toThrow("1 item do inventário ainda com a pessoa.");
    expect(() => waiveLedgerItem(notebook.id, "  ", HR_ACTOR)).toThrow("Informe o motivo da dispensa.");
    expect(waiveLedgerItem(notebook.id, "Equipamento extraviado, com boletim registrado", HR_ACTOR)).toMatchObject({ status: "waived", waivedReason: "Equipamento extraviado, com boletim registrado" });

    applyJourneyAction(id, { action: "complete" }, HR_ACTOR);
    const completed = getJourney(id)!;
    expect(completed.status).toBe("completed");
    expect(Date.parse(completed.linkExpiresAt!) - Date.now()).toBe(30 * 24 * 3_600_000);
  });

  it("trilha sem a tarefa de revogação ganha uma para a TI no dia da saída quando a pessoa tem inventário", async () => {
    await prepare();
    addManualLedgerItem(personId(), { kind: "equipment", name: "Headset", detail: "" }, HR_ACTOR);
    const template = createTemplate(
      templateInput.parse({
        kind: "offboarding",
        name: "Sem revogação",
        stages: [
          { name: "Antes", releaseMode: "start", activities: [{ title: "Passagem de conhecimento", role: "gestor", dueOffsetDays: -2 }] },
          { name: "Último dia", releaseMode: "offset", releaseOffsetDays: 0, activities: [{ title: "Registrar saída", role: "rh", dueOffsetDays: 0 }] },
          { name: "Depois", releaseMode: "offset", releaseOffsetDays: 3, activities: [{ title: "Pesquisa", role: "rh", dueOffsetDays: 3, required: false }] },
        ],
      }),
    );
    const id = startOffboarding(template.id);
    const added = activityByTitle(id, "Revogar acessos e recolher equipamentos");
    expect(added).toMatchObject({ role: "ti", stagePosition: 1, ledgerRole: "revoke_and_collect", dueAt: "2026-10-30T18:00:00-03:00", required: true });
    expect(added.checklist.map((item) => item.text)).toEqual(["Recolher equipamento: Headset"]);
    expect(getJourney(id)!.snapshot.stages[1]!.activities.some((activity) => activity.ledgerRole === "revoke_and_collect")).toBe(true);
  });

  it("entrada manual durante a saída entra na lista e vai para o checklist da tarefa no Bitrix", async () => {
    await prepare();
    addManualLedgerItem(personId(), { kind: "access", name: "Notion", detail: "" }, HR_ACTOR);
    const id = startOffboarding(shortOffboarding().id);
    await cycle();
    const late = addManualLedgerItem(personId(), { kind: "equipment", name: "Crachá", detail: "" }, HR_ACTOR);
    expect(getLedgerItem(late.id)?.status).toBe("return_requested");
    const revoke = activityByTitle(id, "Revogar e recolher");
    expect(revoke.checklist.at(-1)?.text).toBe("Recolher equipamento: Crachá");
    await cycle();
    const items = env.fake.checklistOf(revoke.bitrixTaskId!);
    const root = items.find((item) => item.parentId === 0)!;
    expect(items.filter((item) => item.parentId === root.id).map((item) => item.title)).toContain("Recolher equipamento: Crachá");
    expect(items.filter((item) => item.parentId === 0)).toHaveLength(1);
  });

  it("cancelar a saída devolve o inventário para 'com a pessoa' e revoga o link", async () => {
    await prepare();
    const item = addManualLedgerItem(personId(), { kind: "access", name: "Notion", detail: "" }, HR_ACTOR);
    const id = startOffboarding(shortOffboarding().id);
    applyJourneyAction(id, { action: "cancel", reason: "A pessoa decidiu ficar" }, HR_ACTOR);
    expect(getLedgerItem(item.id)).toMatchObject({ status: "active", closingJourneyId: null });
    const journey = getJourney(id)!;
    expect(journey).toMatchObject({ status: "cancelled", cancelReason: "A pessoa decidiu ficar" });
    expect(Date.parse(journey.linkExpiresAt!)).toBeLessThanOrEqual(Date.now());
    expect(listActivities(id).every((activity) => activity.status === "cancelled")).toBe(true);
    expect(() => applyActivityAction(listActivities(id)[0]!.id, { action: "complete" }, HR_ACTOR)).toThrow("Esta jornada já foi encerrada.");
  });

  it("desmarcar um item de revogação devolve o item para a lista de devolução", async () => {
    await prepare();
    const item = addManualLedgerItem(personId(), { kind: "access", name: "Notion", detail: "" }, HR_ACTOR);
    const id = startOffboarding(shortOffboarding().id);
    await cycle();
    const revoke = activityByTitle(id, "Revogar e recolher");
    const key = revoke.checklist.find((entry) => entry.text === "Revogar acesso: Notion")!.key;
    applyActivityAction(revoke.id, { action: "toggle_item", itemKey: key, done: true }, HR_ACTOR);
    expect(getLedgerItem(item.id)?.status).toBe("closed");
    applyActivityAction(revoke.id, { action: "toggle_item", itemKey: key, done: false }, HR_ACTOR);
    expect(getLedgerItem(item.id)?.status).toBe("return_requested");
  });

  it("checklists das tarefas abertas são relidos a cada ~4 min e refletem no inventário", async () => {
    await prepare();
    const item = addManualLedgerItem(personId(), { kind: "access", name: "Notion", detail: "" }, HR_ACTOR);
    const id = startOffboarding(shortOffboarding().id);
    await cycle();
    const taskId = activityByTitle(id, "Revogar e recolher").bitrixTaskId!;
    env.fake.checkItem(taskId, "Revogar acesso: Notion");
    await cycle();
    expect(getLedgerItem(item.id)?.status).toBe("return_requested");
    advance(4 * 60_000 + 1_000);
    await cycle();
    expect(getLedgerItem(item.id)?.status).toBe("closed");
  });
});

describe("trilhas iniciais de saída", () => {
  it("o desligamento voluntário libera por datas e entrega a lista de revogação à TI", async () => {
    await prepare();
    addManualLedgerItem(personId(), { kind: "access", name: "Google Workspace", detail: "" }, HR_ACTOR);
    const id = createJourney(
      {
        requestId: randomUUID(),
        kind: "offboarding",
        person: { bitrixUserId: "12" },
        templateId: templateId("Desligamento · Voluntário"),
        anchorDate: "2026-11-09",
        participants: {},
        offboardingReason: "voluntary",
      },
      HR_ACTOR,
    ).id;
    // Hoje (26/10) é antes de −10 dias? 30/10 é −10: só a primeira etapa (start) sai agora.
    expect(listActivities(id).filter((activity) => activity.status === "open").map((activity) => activity.stagePosition)).toEqual([0, 0]);
    advance(15 * 24 * 3_600_000);
    await cycle();
    const revoke = activityByTitle(id, "Revogar e recolher");
    expect(revoke.status).toBe("open");
    expect(revoke.checklist.map((item) => item.text)).toContain("Revogar acesso: Google Workspace");
    expect(env.fake.tasks.get(Number(revoke.bitrixTaskId))?.title).toBe("Ana Souza · Desligamento — Revogar e recolher");
  });
});
