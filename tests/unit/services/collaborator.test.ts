import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as documentRoute } from "@/app/j/[token]/documento/route";
import { POST as doneRoute } from "@/app/j/[token]/feito/route";
import { getDb } from "@/server/db";
import { getJourney, updateJourney, type JourneyRow } from "@/server/db/repos/journeys";
import { DEFAULT_CONTENT } from "@/server/db/repos/settings";
import * as engine from "@/server/engine";
import { AppError } from "@/server/errors";
import { hashToken } from "@/server/security/crypto";
import { resetRateLimitsForTests } from "@/server/security/rate-limit";
import { createCollaboratorLink, loadCollaboratorView, revokeCollaboratorLink } from "@/server/services/collaborator";
import { activityRow, seedActivities, seedJourney, seedManualPerson, seedTemplate } from "../../api/support/seed";
import { useTestDb } from "../../support/db";

vi.mock("@/server/engine", async () => (await import("../../api/support/engine-mock")).engineMock());
vi.mock("@/server/domain", async () => (await import("../../api/support/domain-fake")).domainFake());

const RH = { type: "user" as const, id: "u1", name: "Marina RH" };
const DAY = 24 * 60 * 60 * 1000;

let cleanup: () => void;
beforeEach(() => {
  cleanup = useTestDb().cleanup;
  resetRateLimitsForTests();
  vi.mocked(engine.markDoneFromLink).mockReset();
  vi.mocked(engine.markDoneFromLink).mockImplementation(() => ({ ok: true, message: "Feito." }));
  vi.spyOn(console, "log").mockImplementation(() => undefined);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** Desligamento involuntário com atividades de todas as visibilidades. */
function seedOffboarding() {
  const person = seedManualPerson("Ana Souza");
  const journey = seedJourney({
    person,
    template: seedTemplate("offboarding"),
    offboardingReason: "involuntary",
    participants: {
      gestor: { bitrixUserId: "10", name: "Bruno Gestor", position: "Coordenador" },
      rh: { bitrixUserId: "11", name: "Marina RH", position: null },
      ti: { bitrixUserId: "12", name: "Diego TI", position: null },
    },
  });
  const [hiddenTeam, hiddenHr, mine, theirs, done, cancelled, mineDone] = seedActivities([
    activityRow({ journeyId: journey.id, stagePosition: 0, role: "ti", visibility: "team", title: "Revogar acessos internos" }),
    activityRow({ journeyId: journey.id, stagePosition: 0, role: "rh", visibility: "hr", title: "Calcular rescisão confidencial" }),
    activityRow({
      journeyId: journey.id,
      stagePosition: 1,
      role: "colaborador",
      visibility: "employee",
      title: "Devolver o notebook",
      instructions: "Leve à recepção.",
      assigneeBitrixId: "77",
      assigneeName: "Responsável Interno",
      bitrixTaskId: "98765",
      checklist: [{ key: "carregador", text: "Item interno XPTO", done: false, bitrixItemId: "5", ledger: null }],
      links: [{ label: "Política de devolução", url: "https://intranet.exemplo.com/devolucao" }],
    }),
    activityRow({ journeyId: journey.id, stagePosition: 1, role: "ti", visibility: "employee", status: "locked", title: "TI recolhe o crachá", assigneeName: "Diego Técnico" }),
    activityRow({ journeyId: journey.id, stagePosition: 2, role: "gestor", visibility: "employee", status: "done", title: "Conversa de despedida" }),
    activityRow({ journeyId: journey.id, stagePosition: 0, role: "rh", visibility: "employee", status: "cancelled", title: "Atividade cancelada" }),
    activityRow({ journeyId: journey.id, stagePosition: 2, role: "colaborador", visibility: "employee", status: "done", title: "Responder a pesquisa" }),
  ]);
  return { person, journey, hiddenTeam: hiddenTeam!, hiddenHr: hiddenHr!, mine: mine!, theirs: theirs!, done: done!, cancelled: cancelled!, mineDone: mineDone! };
}

function tokenOf(url: string | undefined): string {
  expect(url).toMatch(/^\/j\/[A-Za-z0-9_-]{43}$/);
  return url!.slice(3);
}

describe("link pessoal do colaborador", () => {
  it("guarda só o hash do token e devolve o endereço relativo uma única vez", () => {
    const { journey } = seedOffboarding();
    const link = createCollaboratorLink(journey.id, RH);
    const token = tokenOf(link.url);
    expect(link).toMatchObject({ active: true, expiresAt: null });
    expect(getJourney(journey.id)?.linkTokenHash).toBe(hashToken(token));
    const stored = JSON.stringify(getDb().prepare("SELECT * FROM journeys").all());
    expect(stored).not.toContain(token);
    // Um link novo invalida o anterior.
    const second = tokenOf(createCollaboratorLink(journey.id, RH).url);
    expect(loadCollaboratorView(token)).toBeNull();
    expect(loadCollaboratorView(second)).not.toBeNull();
  });

  it("mostra só as atividades visíveis ao colaborador, sem motivo do desligamento nem dados internos", () => {
    const { journey, mine, theirs, done, mineDone } = seedOffboarding();
    const token = tokenOf(createCollaboratorLink(journey.id, RH).url);
    const view = loadCollaboratorView(token)!;

    expect(view).toMatchObject({
      kind: "offboarding",
      company: "Minha empresa",
      person: { firstName: "Ana", name: "Ana Souza" },
      anchorDate: "2026-11-03",
      message: DEFAULT_CONTENT.farewellMessage,
      faq: DEFAULT_CONTENT.faqOffboarding,
      completed: false,
      people: [
        { role: "gestor", name: "Bruno Gestor", position: "Coordenador" },
        { role: "rh", name: "Marina RH", position: null },
      ],
      progress: { done: 2, total: 4, percent: 50 },
    });
    expect(typeof view.daysUntilAnchor).toBe("number");
    // A etapa só com atividades internas fica de fora (o nome da etapa pode ser interno).
    expect(view.stages.map((stage) => stage.position)).toEqual([1, 2]);
    expect(view.stages[0]?.activities).toEqual([
      {
        id: mine.id,
        title: "Devolver o notebook",
        instructions: "Leve à recepção.",
        kind: "task",
        dueAt: mine.dueAt,
        status: "todo",
        mine: true,
        ownerLabel: "Colaborador",
        links: [{ label: "Política de devolução", url: "https://intranet.exemplo.com/devolucao" }],
      },
      expect.objectContaining({ id: theirs.id, status: "waiting", mine: false, ownerLabel: "TI" }),
    ]);
    expect(view.stages[1]?.activities.map((activity) => [activity.id, activity.status, activity.ownerLabel])).toEqual([
      [done.id, "done", "Gestor"],
      [mineDone.id, "done", "Colaborador"],
    ]);

    const serialized = JSON.stringify(view);
    for (const secret of ["involuntary", "voluntary", "Revogar acessos internos", "Calcular rescisão", "Atividade cancelada", "98765", "Item interno XPTO", "Responsável Interno", "Diego", "linkTokenHash", "assignee", "bitrix", "checklist", "syncState"]) {
      expect(serialized).not.toContain(secret);
    }
  });

  it("link revogado, expirado, de jornada cancelada ou inexistente → nada (404)", () => {
    const { journey } = seedOffboarding();
    const revoked = tokenOf(createCollaboratorLink(journey.id, RH).url);
    expect(revokeCollaboratorLink(journey.id, RH)).toEqual({ active: false, expiresAt: null });
    expect(loadCollaboratorView(revoked)).toBeNull();

    const expired = tokenOf(createCollaboratorLink(journey.id, RH).url);
    updateJourney(journey.id, { linkExpiresAt: new Date(Date.now() - 1000).toISOString() });
    expect(loadCollaboratorView(expired)).toBeNull();

    const cancelled = tokenOf(createCollaboratorLink(journey.id, RH).url);
    updateJourney(journey.id, { status: "cancelled" });
    expect(loadCollaboratorView(cancelled)).toBeNull();
    expect(() => createCollaboratorLink(journey.id, RH)).toThrow(AppError);

    for (const junk of ["", "abc", "../../etc/passwd", "x".repeat(43), "%2F%2E%2E"]) expect(loadCollaboratorView(junk)).toBeNull();
  });

  it("depois de concluída, a jornada mantém o link por 30 dias", () => {
    const { journey } = seedOffboarding();
    updateJourney(journey.id, { status: "completed", completedAt: new Date(Date.now() - 5 * DAY).toISOString() });
    const link = createCollaboratorLink(journey.id, RH);
    expect(Date.parse(link.expiresAt!)).toBeGreaterThan(Date.now() + 24 * DAY);
    expect(loadCollaboratorView(tokenOf(link.url))?.completed).toBe(true);

    updateJourney(journey.id, { completedAt: new Date(Date.now() - 31 * DAY).toISOString(), linkExpiresAt: null });
    expect(loadCollaboratorView(tokenOf(link.url))).toBeNull();
    expect(() => createCollaboratorLink(journey.id, RH)).toThrow(/30 dias/);
  });
});

describe("POST /j/:token/feito", () => {
  function post(token: string, activityId?: string): Promise<Response> {
    const body = new URLSearchParams(activityId === undefined ? {} : { activityId });
    return doneRoute(new Request(`http://localhost/j/${token}/feito`, { method: "POST", body }), { params: Promise.resolve({ token }) });
  }

  function setup(): { journey: JourneyRow; token: string } & ReturnType<typeof seedOffboarding> {
    const seeded = seedOffboarding();
    return { ...seeded, token: tokenOf(createCollaboratorLink(seeded.journey.id, RH).url) };
  }

  it("marca a atividade do colaborador e volta (303) por caminho relativo", async () => {
    const { journey, mine, token } = setup();
    const response = await post(token, mine.id);
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(`/j/${token}?feito=1`);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(engine.markDoneFromLink).toHaveBeenCalledWith(journey.id, mine.id);
  });

  it("recusa o que não é do colaborador sem chamar o motor; repetir o envio não vira erro", async () => {
    const { theirs, hiddenTeam, mineDone, token } = setup();
    for (const activityId of [theirs.id, hiddenTeam.id, "nao-existe", undefined]) {
      const response = await post(token, activityId);
      expect(response.headers.get("location")).toBe(`/j/${token}?erro=1`);
    }
    expect(engine.markDoneFromLink).not.toHaveBeenCalled();
    expect((await post(token, mineDone.id)).headers.get("location")).toBe(`/j/${token}?feito=1`);
  });

  it("falha do motor volta com ?erro=1", async () => {
    const { mine, token } = setup();
    vi.mocked(engine.markDoneFromLink).mockImplementation(() => ({ ok: false, message: "Ainda não liberada." }));
    expect((await post(token, mine.id)).headers.get("location")).toBe(`/j/${token}?erro=1`);
    vi.mocked(engine.markDoneFromLink).mockImplementation(() => {
      throw new Error("falha interna");
    });
    expect((await post(token, mine.id)).headers.get("location")).toBe(`/j/${token}?erro=1`);
  });

  it("token desconhecido ou revogado → 404", async () => {
    const { journey, mine, token } = setup();
    const unknown = await post("y".repeat(43), mine.id);
    expect(unknown.status).toBe(404);
    expect(await unknown.text()).toContain("Peça um novo link");
    revokeCollaboratorLink(journey.id, RH);
    expect((await post(token, mine.id)).status).toBe(404);
  });

  it("limita a 30 envios a cada 10 minutos por link", async () => {
    const { mine, token } = setup();
    for (let attempt = 0; attempt < 30; attempt++) expect((await post(token, mine.id)).headers.get("location")).toBe(`/j/${token}?feito=1`);
    expect((await post(token, mine.id)).headers.get("location")).toBe(`/j/${token}?erro=1`);
    expect(engine.markDoneFromLink).toHaveBeenCalledTimes(30);
  });
});

describe("POST /j/:token/documento", () => {
  const PDF = new Uint8Array(Buffer.from("%PDF-1.7\nconteúdo"));

  /** Como o navegador manda: multipart com o tamanho declarado. */
  async function post(token: string, fields: { activityId?: string; key?: string; file?: Blob }): Promise<Response> {
    const form = new FormData();
    if (fields.activityId !== undefined) form.set("activityId", fields.activityId);
    if (fields.key !== undefined) form.set("key", fields.key);
    if (fields.file) form.set("file", fields.file, "foto.pdf");
    const encoded = new Request("http://localhost/", { method: "POST", body: form });
    const body = await encoded.arrayBuffer();
    const headers = { "content-type": encoded.headers.get("content-type")!, "content-length": String(body.byteLength) };
    return documentRoute(new Request(`http://localhost/j/${token}/documento`, { method: "POST", body, headers }), { params: Promise.resolve({ token }) });
  }

  function setup() {
    const seeded = seedOffboarding();
    vi.mocked(engine.documentsEnabled).mockReturnValue(true);
    vi.mocked(engine.receiveDocument).mockReset();
    vi.mocked(engine.receiveDocument).mockImplementation(() => ({ document: {} as never, duplicate: false, completed: false }));
    return { ...seeded, token: tokenOf(createCollaboratorLink(seeded.journey.id, RH).url) };
  }

  it("confere o tipo pelo conteúdo, entrega ao motor e volta para a atividade", async () => {
    const { journey, mine, token } = setup();
    const response = await post(token, { activityId: mine.id, key: "rg", file: new Blob([PDF]) });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(`/j/${token}?enviado=1#atividade-${mine.id}`);
    const [passedJourney, activityId, key, file] = vi.mocked(engine.receiveDocument).mock.calls[0]!;
    expect([passedJourney.id, activityId, key, file.type]).toEqual([journey.id, mine.id, "rg", { mime: "application/pdf", ext: "pdf" }]);
    vi.mocked(engine.receiveDocument).mockImplementation(() => ({ document: {} as never, duplicate: false, completed: true }));
    expect((await post(token, { activityId: mine.id, key: "rg", file: new Blob([PDF]) })).headers.get("location")).toBe(`/j/${token}?enviado=completo#atividade-${mine.id}`);
  });

  it("recusa tipo errado, arquivo grande demais e campos faltando sem chamar o motor", async () => {
    const { mine, token } = setup();
    const zip = new Blob([new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3])]);
    expect((await post(token, { activityId: mine.id, key: "rg", file: zip })).headers.get("location")).toBe(`/j/${token}?erro=tipo#atividade-${mine.id}`);
    const big = new Blob([PDF, new Uint8Array(10 * 1024 * 1024)]);
    expect((await post(token, { activityId: mine.id, key: "rg", file: big })).headers.get("location")).toBe(`/j/${token}?erro=grande#atividade-${mine.id}`);
    expect((await post(token, { activityId: mine.id, key: "rg" })).headers.get("location")).toBe(`/j/${token}?erro=documento#atividade-${mine.id}`);
    expect((await post(token, { activityId: mine.id, key: "Chave Inválida", file: new Blob([PDF]) })).headers.get("location")).toBe(`/j/${token}?erro=documento`);
    expect(engine.receiveDocument).not.toHaveBeenCalled();
  });

  it("sem a permissão Drive ou com recusa do motor, volta com erro; token revogado → 404", async () => {
    const { journey, mine, token } = setup();
    vi.mocked(engine.receiveDocument).mockImplementation(() => {
      throw new AppError("DOCUMENT_NOT_REQUESTED", "Este documento não foi pedido pelo RH.", 422);
    });
    expect((await post(token, { activityId: mine.id, key: "rg", file: new Blob([PDF]) })).headers.get("location")).toBe(`/j/${token}?erro=documento#atividade-${mine.id}`);
    vi.mocked(engine.documentsEnabled).mockReturnValue(false);
    expect((await post(token, { activityId: mine.id, key: "rg", file: new Blob([PDF]) })).headers.get("location")).toBe(`/j/${token}?erro=documento#atividade-${mine.id}`);
    revokeCollaboratorLink(journey.id, RH);
    expect((await post(token, { activityId: mine.id, key: "rg", file: new Blob([PDF]) })).status).toBe(404);
    expect((await post(token, {})).status).toBe(404);
  });

  it("não lê o corpo sem link válido nem sem tamanho declarado", async () => {
    const { mine, token } = setup();
    const unread = (headers: Record<string, string>, to = token) => {
      const body = new ReadableStream({ pull: () => { throw new Error("corpo lido"); } });
      return documentRoute(new Request(`http://localhost/j/${to}/documento`, { method: "POST", body, headers, duplex: "half" } as RequestInit), { params: Promise.resolve({ token: to }) });
    };
    // Envio em partes (sem content-length): recusado antes de ler.
    expect((await unread({ "content-type": "multipart/form-data; boundary=x" })).headers.get("location")).toBe(`/j/${token}?erro=documento`);
    expect((await unread({ "content-type": "multipart/form-data; boundary=x", "content-length": String(11 * 1024 * 1024) })).headers.get("location")).toBe(`/j/${token}?erro=grande`);
    expect((await unread({ "content-length": "100" }, "a".repeat(43))).status).toBe(404);
    expect(engine.receiveDocument).not.toHaveBeenCalled();
    expect((await post(token, { activityId: mine.id, key: "rg", file: new Blob([PDF]) })).headers.get("location")).toBe(`/j/${token}?enviado=1#atividade-${mine.id}`);
  });

  it("limita a 20 envios a cada 10 minutos por link", async () => {
    const { mine, token } = setup();
    for (let attempt = 0; attempt < 20; attempt++) await post(token, { activityId: mine.id, key: "rg", file: new Blob([PDF]) });
    expect((await post(token, { activityId: mine.id, key: "rg", file: new Blob([PDF]) })).headers.get("location")).toBe(`/j/${token}?erro=documento#atividade-${mine.id}`);
    expect(engine.receiveDocument).toHaveBeenCalledTimes(20);
  });
});
