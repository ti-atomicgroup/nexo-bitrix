import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { listAudit } from "@/server/db/repos/audit";
import { getJourney } from "@/server/db/repos/journeys";
import { findPerson } from "@/server/db/repos/people";
import { createTemplate } from "@/server/db/repos/templates";
import { createJourney, inviteJourneyPerson } from "@/server/engine";
import { getSettings } from "@/server/services/settings";
import { createJourneyInput, templateInput, type CreateJourneyInput } from "@/shared/schemas";
import { activityByTitle, advance, cycle, HR_ACTOR, prepare, setupEngine, type EngineEnv } from "../fakes/engine-setup";

let env: EngineEnv | null = null;
afterEach(() => {
  env?.cleanup();
  env = null;
});

const WITH_USER = ["task", "user", "crm", "sonet_group", "im", "calendar", "log"];

const welcome = () =>
  createTemplate(
    templateInput.parse({
      kind: "onboarding",
      name: "Boas-vindas",
      stages: [
        {
          name: "Antes do 1º dia",
          releaseMode: "start",
          activities: [
            { title: "Preparar notebook", role: "ti", dueOffsetDays: -1 },
            { title: "Leia o guia de cultura", role: "colaborador", kind: "reading", dueOffsetDays: -1, visibility: "employee" },
          ],
        },
      ],
    }),
  );

function start(person: CreateJourneyInput["person"]): string {
  return createJourney({ requestId: randomUUID(), kind: "onboarding", person, templateId: welcome().id, anchorDate: "2026-10-29", participants: {} }, HR_ACTOR).id;
}

const personOf = (journeyId: string) => findPerson(getJourney(journeyId)!.personId)!;

describe("convite para o Bitrix24", () => {
  it("convida pelo e-mail no departamento do gestor e a conta nova recebe as tarefas da pessoa", async () => {
    env = setupEngine({ scopes: WITH_USER });
    env.fake.departments.set(13, [7]);
    await prepare();
    const id = start({ name: "Paula Lima Prado", email: "paula@pessoal.test", invite: true });
    expect(personOf(id)).toMatchObject({ bitrixUserId: null, inviteStatus: "sending", email: "paula@pessoal.test" });

    await cycle();

    const added = env.fake.calls.find((call) => call.method === "user.add")!;
    expect(added.params).toMatchObject({ EMAIL: "paula@pessoal.test", NAME: "Paula", LAST_NAME: "Lima Prado", UF_DEPARTMENT: [7] });
    const person = personOf(id);
    expect(person.bitrixUserId).not.toBeNull();
    expect(person).toMatchObject({ inviteStatus: null, inviteError: null });
    const reading = activityByTitle(id, "Leia o guia de cultura");
    expect(env.fake.tasks.get(Number(reading.bitrixTaskId))!.responsibleId).toBe(Number(person.bitrixUserId));
    expect(listAudit({ entity: "journey", entityId: id }).map((entry) => entry.action)).toContain("Convite enviado pelo Bitrix24");
  });

  it("e-mail que já tem conta: vincula a conta em vez de convidar de novo", async () => {
    env = setupEngine({ scopes: WITH_USER });
    await prepare();
    const id = start({ name: "Ana Souza", email: "ana@empresa.test", invite: true });
    await cycle();
    expect(env.fake.calls.some((call) => call.method === "user.add")).toBe(false);
    expect(personOf(id).bitrixUserId).toBe("12");
  });

  it("resposta incerta do user.add: confere pelo e-mail na próxima tentativa, sem convite duplicado", async () => {
    env = setupEngine({ scopes: WITH_USER });
    await prepare();
    env.fake.failNext("user.add", "commitThenTimeout");
    const id = start({ name: "Paula Lima", email: "paula@pessoal.test", invite: true });
    await cycle();
    expect(personOf(id)).toMatchObject({ bitrixUserId: null, inviteStatus: "sending" });
    advance(5 * 60_000);
    await cycle();
    expect(env.fake.calls.filter((call) => call.method === "user.add")).toHaveLength(1);
    expect([...env.fake.users.values()].filter((user) => user.email === "paula@pessoal.test")).toHaveLength(1);
    expect(personOf(id).bitrixUserId).not.toBeNull();
  });

  it("dono do webhook sem ser administrador: o convite falha com o motivo e pode ser pedido de novo", async () => {
    env = setupEngine({ scopes: WITH_USER });
    env.fake.ownerIsAdmin = false;
    await prepare();
    const id = start({ name: "Paula Lima", email: "paula@pessoal.test", invite: true });
    await cycle();
    expect(personOf(id)).toMatchObject({ bitrixUserId: null, inviteStatus: "failed" });
    expect(personOf(id).inviteError).toMatch(/administradora do portal/);

    env.fake.ownerIsAdmin = true;
    inviteJourneyPerson(id, "paula.lima@pessoal.test", HR_ACTOR);
    expect(personOf(id)).toMatchObject({ inviteStatus: "sending", inviteError: null, email: "paula.lima@pessoal.test" });
    await cycle();
    expect(personOf(id).bitrixUserId).not.toBeNull();
  });

  it("sem a permissão Usuários (user) no webhook, o Nexo não oferece nem aceita o convite", async () => {
    env = setupEngine();
    await prepare();
    expect(getSettings().invitesEnabled).toBe(false);
    expect(() => start({ name: "Paula Lima", email: "paula@pessoal.test", invite: true })).toThrow(/permissão Usuários \(user\)/);
  });

  it("convite exige o e-mail", () => {
    const parsed = createJourneyInput.safeParse({
      requestId: randomUUID(),
      kind: "onboarding",
      person: { name: "Paula Lima", invite: true },
      templateId: "t",
      anchorDate: "2026-10-29",
    });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.message).toBe("Informe o e-mail para enviar o convite do Bitrix24.");
  });
});
