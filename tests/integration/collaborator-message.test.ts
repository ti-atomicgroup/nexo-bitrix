import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { listAudit } from "@/server/db/repos/audit";
import { getWebhookRecord, setWebhookRecord } from "@/server/db/repos/settings";
import { createTemplate } from "@/server/db/repos/templates";
import { createJourney } from "@/server/engine";
import { createCollaboratorLink } from "@/server/services/collaborator";
import { sendCollaboratorMessage } from "@/server/services/collaborator-message";
import { taskStatus } from "@/server/services/tasks";
import { templateInput, type CreateJourneyInput } from "@/shared/schemas";
import { activityByTitle, advance, cycle, HR_ACTOR, prepare, setupEngine, type EngineEnv } from "../fakes/engine-setup";

let env: EngineEnv | null = null;
afterEach(() => {
  env?.cleanup();
  env = null;
});

const arrival = () =>
  createTemplate(
    templateInput.parse({
      kind: "onboarding",
      name: "Chegada",
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

async function start(person: CreateJourneyInput["person"] = { bitrixUserId: "12" }): Promise<string> {
  await prepare();
  const id = createJourney({ requestId: randomUUID(), kind: "onboarding", person, templateId: arrival().id, anchorDate: "2026-10-29", participants: {} }, HR_ACTOR).id;
  await cycle();
  return id;
}

/** Espera o envio em segundo plano terminar: devolve o resultado ou lança o erro do trabalho. */
async function settle(taskId: string): Promise<unknown> {
  for (let attempt = 0; attempt < 50; attempt++) {
    const status = taskStatus(taskId);
    if (status.state === "done") return status.result;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("o envio não terminou");
}

const actions = (journeyId: string) => listAudit({ entity: "journey", entityId: journeyId }).map((entry) => entry.action);

describe("mensagem no chat do Bitrix24", () => {
  it("envia o link recém-criado no chat da pessoa e registra no histórico", async () => {
    env = setupEngine();
    const id = await start();
    const url = `https://nexo.exemplo.com${createCollaboratorLink(id, HR_ACTOR).url}`;

    await expect(settle(sendCollaboratorMessage(id, { kind: "link", url }, HR_ACTOR))).resolves.toEqual({ sent: true });

    expect(env.fake.chat).toHaveLength(1);
    expect(env.fake.chat[0]).toMatchObject({ dialogId: "12" });
    expect(env.fake.chat[0]!.message).toContain(url);
    expect(env.fake.chat[0]!.message).toMatch(/^Olá, Ana! Este é o seu link pessoal/);
    expect(actions(id)).toContain("Link enviado pelo Bitrix24");
  });

  it("recusa um link que não é o ativo da jornada, sem chamar o Bitrix24", async () => {
    env = setupEngine();
    const id = await start();
    const old = createCollaboratorLink(id, HR_ACTOR).url!;
    createCollaboratorLink(id, HR_ACTOR);
    expect(() => sendCollaboratorMessage(id, { kind: "link", url: `https://nexo.exemplo.com${old}` }, HR_ACTOR)).toThrow(/não é o link ativo/);
    expect(env.fake.chat).toHaveLength(0);
  });

  it("lembra o que falta com atalho para a tarefa, no máximo uma vez por hora", async () => {
    env = setupEngine();
    const id = await start();
    const reading = activityByTitle(id, "Leia o guia de cultura");

    await settle(sendCollaboratorMessage(id, { kind: "reminder" }, HR_ACTOR));

    const message = env.fake.chat[0]!.message;
    expect(message).toMatch(/^Oi, Ana! Passando para lembrar o que falta/);
    expect(message).toMatch(new RegExp(`• \\[URL=[^\\]]*/task/view/${reading.bitrixTaskId}/\\]Leia o guia de cultura\\[/URL\\]`));
    expect(message).not.toContain("Preparar notebook");
    expect(actions(id)).toContain("Lembrete enviado pelo Bitrix24");

    expect(() => sendCollaboratorMessage(id, { kind: "reminder" }, HR_ACTOR)).toThrow(/há menos de 1 hora/);
    advance(61 * 60_000);
    await settle(sendCollaboratorMessage(id, { kind: "reminder" }, HR_ACTOR));
    expect(env.fake.chat).toHaveLength(2);
  });

  it("sem conta no Bitrix24 ou sem a permissão im, explica o que falta", async () => {
    env = setupEngine();
    const withoutAccount = await start({ name: "Paula Lima", email: "paula@pessoal.test" });
    expect(() => sendCollaboratorMessage(withoutAccount, { kind: "reminder" }, HR_ACTOR)).toThrow(/Paula ainda não tem conta no Bitrix24/);

    const record = getWebhookRecord()!;
    setWebhookRecord({ ...record, scopes: record.scopes.filter((scope) => scope !== "im") });
    const id = createJourney({ requestId: randomUUID(), kind: "onboarding", person: { bitrixUserId: "12" }, templateId: arrival().id, anchorDate: "2026-10-29", participants: {} }, HR_ACTOR).id;
    expect(() => sendCollaboratorMessage(id, { kind: "reminder" }, HR_ACTOR)).toThrow(/Bate-papo e notificações \(im\)/);
    expect(env.fake.chat).toHaveLength(0);
  });

  it("resposta incerta do Bitrix24: não reenvia e pede para conferir o chat", async () => {
    env = setupEngine();
    const id = await start();
    env.fake.failNext("im.message.add", "timeout", 3);
    await expect(settle(sendCollaboratorMessage(id, { kind: "reminder" }, HR_ACTOR))).rejects.toThrow(/Confira o chat com Ana antes de enviar de novo/);
    expect(actions(id)).not.toContain("Lembrete enviado pelo Bitrix24");
  });
});
