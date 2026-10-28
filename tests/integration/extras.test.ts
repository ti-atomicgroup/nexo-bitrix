import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { setFeatures, setWebhookRecord, getWebhookRecord } from "@/server/db/repos/settings";
import { createTemplate } from "@/server/db/repos/templates";
import { addManualLedgerItem, createJourney } from "@/server/engine";
import { findPersonByBitrixId } from "@/server/db/repos/people";
import { buildJourneyDTO } from "@/server/services/read/journeys";
import { templateInput } from "@/shared/schemas";
import { advance, cycle, HR_ACTOR, prepare, setupEngine, type EngineEnv } from "../fakes/engine-setup";

let env: EngineEnv | null = null;
afterEach(() => env?.cleanup());

const DAY = 24 * 3_600_000;

const staged = (kind: "onboarding" | "offboarding") =>
  createTemplate(
    templateInput.parse({
      kind,
      name: `Etapas ${kind}`,
      stages: [
        { name: "Antes", releaseMode: "start", activities: [{ title: "Preparar", role: "ti", dueOffsetDays: -1 }] },
        {
          name: "Primeiro dia",
          releaseMode: "offset",
          releaseOffsetDays: 0,
          activities: [
            { title: "Leia o guia de cultura", role: "colaborador", kind: "reading", dueOffsetDays: 0, visibility: "employee" },
            { title: "Conversa com o gestor", role: "gestor", kind: "meeting", dueOffsetDays: 0, dueTime: "15:00" },
          ],
        },
      ],
    }),
  );

function start(templateIdValue: string, kind: "onboarding" | "offboarding" = "onboarding", position?: string): string {
  return createJourney(
    { requestId: randomUUID(), kind, person: { bitrixUserId: "12" }, position, templateId: templateIdValue, anchorDate: "2026-10-28", participants: {}, offboardingReason: kind === "offboarding" ? "involuntary" : undefined },
    HR_ACTOR,
  ).id;
}

describe("extras (im, calendar, log)", () => {
  it("avisa o colaborador quando uma etapa com atividades dele é liberada e agenda a reunião", async () => {
    env = setupEngine();
    await prepare();
    start(staged("onboarding").id);
    await cycle();
    expect(env.fake.notifications).toHaveLength(0);
    advance(2 * DAY);
    await cycle();
    expect(env.fake.notifications).toEqual([
      { id: 1, userId: 12, message: "Sua jornada avançou: começou a etapa “Primeiro dia”. Para você: Leia o guia de cultura." },
    ]);
    expect(env.fake.events).toEqual([expect.objectContaining({ name: "Conversa com o gestor · Ana Souza", from: "2026-10-28T15:00:00-03:00", attendees: [1, 13, 12] })]);
  });

  it("nunca avisa o colaborador numa saída", async () => {
    env = setupEngine();
    await prepare();
    addManualLedgerItem(findPersonByBitrixId("12")!.id, { kind: "access", name: "Notion", detail: "" }, HR_ACTOR);
    start(staged("offboarding").id, "offboarding");
    advance(2 * DAY);
    await cycle();
    expect(env.fake.notifications).toHaveLength(0);
  });

  it("sem o escopo ou com o recurso desligado, nada é enviado", async () => {
    env = setupEngine({ scopes: ["task", "user_brief", "crm", "sonet_group"] });
    await prepare();
    start(staged("onboarding").id);
    advance(2 * DAY);
    await cycle();
    expect(env.fake.notifications).toHaveLength(0);
    expect(env.fake.events).toHaveLength(0);
    expect(env.fake.calls.some((call) => call.method.startsWith("im.") || call.method.startsWith("calendar."))).toBe(false);
    env.cleanup();

    env = setupEngine();
    await prepare();
    setFeatures({ notifications: false, calendar: false, feed: false });
    start(staged("onboarding").id);
    advance(2 * DAY);
    await cycle();
    expect(env.fake.notifications).toHaveLength(0);
    expect(env.fake.events).toHaveLength(0);
  });

  it("publica as boas-vindas no Feed às 09:00 do primeiro dia", async () => {
    env = setupEngine();
    await prepare();
    start(staged("onboarding").id);
    await cycle();
    expect(env.fake.posts).toHaveLength(0);
    // 28/10 às 09:00 em São Paulo = 12:00 UTC.
    advance(Date.parse("2026-10-28T12:00:30Z") - Date.now());
    await cycle();
    expect(env.fake.posts).toEqual([
      {
        id: 1,
        title: "Boas-vindas, Ana!",
        message: "Hoje é o primeiro dia de [USER=12]Ana Souza[/USER], Analista, na Empresa Teste. Deixe sua mensagem de boas-vindas!",
        dest: ["UA"],
      },
    ]);
    await cycle();
    expect(env.fake.posts).toHaveLength(1);
  });

  it("os escopos considerados são os do webhook gravado", async () => {
    env = setupEngine();
    await prepare();
    const record = getWebhookRecord()!;
    setWebhookRecord({ ...record, scopes: record.scopes.filter((scope) => scope !== "log") });
    start(staged("onboarding").id);
    advance(Date.parse("2026-10-28T12:00:30Z") - Date.now());
    await cycle();
    expect(env.fake.posts).toHaveLength(0);
  });

  it("o cargo informado na jornada vai nas boas-vindas e no resumo, no lugar do cargo do cadastro", async () => {
    env = setupEngine();
    await prepare();
    const id = start(staged("onboarding").id, "onboarding", "Executiva de contas");
    expect(buildJourneyDTO(id).summary.person.position).toBe("Executiva de contas");
    advance(Date.parse("2026-10-28T12:00:30Z") - Date.now());
    await cycle();
    expect(env.fake.posts[0]?.message).toBe(
      "Hoje é o primeiro dia de [USER=12]Ana Souza[/USER], Executiva de contas, na Empresa Teste. Deixe sua mensagem de boas-vindas!",
    );
  });
});
