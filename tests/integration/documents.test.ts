import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { getDataDir, getDb } from "@/server/db";
import { getActivity } from "@/server/db/repos/activities";
import { getDocument, listDocumentsByActivity } from "@/server/db/repos/documents";
import { getJourney } from "@/server/db/repos/journeys";
import { getWebhookRecord, setWebhookRecord } from "@/server/db/repos/settings";
import { createTemplate } from "@/server/db/repos/templates";
import { createJourney, receiveDocument, resendDocuments } from "@/server/engine";
import { DOCUMENTS_ROOT_FOLDER, markDocumentFailed } from "@/server/engine/documents";
import { markOperationFailed } from "@/server/db/repos/operations";
import { templateInput } from "@/shared/schemas";
import { activityByTitle, advance, cycle, HR_ACTOR, prepare, setupEngine, type EngineEnv } from "../fakes/engine-setup";

let env: EngineEnv | null = null;
afterEach(() => env?.cleanup());

const WITH_DISK = ["task", "user_brief", "crm", "sonet_group", "im", "calendar", "log", "disk"];
const TITLE = "Envie seus documentos";
const pdf = (text: string) => new Uint8Array(Buffer.from(`%PDF-1.7\n${text}`));
const PDF_TYPE = { mime: "application/pdf", ext: "pdf" };

const DEFAULT_DOCUMENTS = [
  { key: "documento-com-foto", name: "Documento com foto", required: true },
  { key: "dados-bancarios", name: "Dados bancários", required: false },
];

function documentsTemplate(documents = DEFAULT_DOCUMENTS) {
  return createTemplate(
    templateInput.parse({
      kind: "onboarding",
      name: "Com documentos",
      stages: [
        {
          name: "Antes do 1º dia",
          releaseMode: "start",
          activities: [
            {
              title: TITLE,
              role: "colaborador",
              kind: "delivery",
              visibility: "employee",
              dueOffsetDays: -2,
              documents,
            },
          ],
        },
      ],
    }),
  );
}

function start(person: { bitrixUserId: string } | { name: string }, participants: Record<string, string> = {}, documents = DEFAULT_DOCUMENTS): string {
  return createJourney(
    { requestId: randomUUID(), kind: "onboarding", person, templateId: documentsTemplate(documents).id, anchorDate: "2026-11-03", participants },
    HR_ACTOR,
  ).id;
}

const receive = (journeyId: string, key: string, bytes: Uint8Array) => receiveDocument(getJourney(journeyId)!, activityByTitle(journeyId, TITLE).id, key, { bytes, type: PDF_TYPE });

describe("documentos pelo link pessoal", () => {
  it("sem conta do colaborador, a tarefa fica com o RH e recebe o arquivo anexado vindo do Drive do projeto", async () => {
    env = setupEngine({ scopes: WITH_DISK });
    await prepare();
    const journeyId = start({ name: "Paula Nova" });
    await cycle();
    const activity = activityByTitle(journeyId, TITLE);
    expect(activity.assigneeBitrixId).toBe("10");
    const task = env.fake.taskByXmlId(`nexo:${activity.id}`)!;
    expect(task.responsibleId).toBe(10);
    expect(task.description).toContain("[B]Documentos pedidos[/B]");

    const result = receive(journeyId, "documento-com-foto", pdf("rg"));
    expect(result).toMatchObject({ duplicate: false, completed: true });
    expect(result.document.fileName).toMatch(/^Documento com foto - Paula Nova - [a-f0-9]{6}\.pdf$/);
    const localPath = join(getDataDir(), "documents", result.document.localFile!);
    expect(existsSync(localPath)).toBe(true);
    expect(getActivity(activity.id)?.status).toBe("done");

    await cycle();
    const root = env.fake.driveFolder(DOCUMENTS_ROOT_FOLDER)!;
    const folder = env.fake.driveFolder("Paula Nova · Entrada 2026-11-03")!;
    expect(folder.parentId).toBe(root.id);
    const [file] = env.fake.driveFiles(folder.id);
    expect(file?.name).toBe(result.document.fileName);
    expect(file?.content?.toString()).toBe("%PDF-1.7\nrg");
    expect(env.fake.attachments).toEqual([{ id: 1, taskId: task.id, fileId: file!.id }]);
    expect(env.fake.comments.at(-1)?.message).toContain("Paula Nova enviou “Documento com foto” pelo link pessoal");
    expect(task.status).toBe(5);

    const sent = getDocument(result.document.id)!;
    expect(sent).toMatchObject({ status: "sent", localFile: null, driveFileId: String(file!.id), error: null });
    expect(sent.bitrixUrl).toContain(`/drive/${file!.id}/`);
    expect(existsSync(localPath)).toBe(false);
  });

  it("guarda o mesmo arquivo uma vez só e aceita os opcionais depois da atividade concluída", async () => {
    env = setupEngine({ scopes: WITH_DISK });
    await prepare();
    const journeyId = start({ bitrixUserId: "12" });
    await cycle();
    const optional = receive(journeyId, "dados-bancarios", pdf("banco"));
    expect(optional.completed).toBe(false);
    expect(receive(journeyId, "dados-bancarios", pdf("banco"))).toMatchObject({ duplicate: true, document: { id: optional.document.id } });
    expect(receive(journeyId, "documento-com-foto", pdf("rg")).completed).toBe(true);
    await cycle();
    expect(listDocumentsByActivity(activityByTitle(journeyId, TITLE).id).map((document) => document.status)).toEqual(["sent", "sent"]);
    // Colaborador com conta: a tarefa é dele.
    expect(env.fake.taskByXmlId(`nexo:${activityByTitle(journeyId, TITLE).id}`)?.responsibleId).toBe(12);
    expect(env.fake.attachments).toHaveLength(2);
    expect(() => receive(journeyId, "nao-pedido", pdf("x"))).toThrow("não foi pedido");
  });

  it("atividade só com documentos opcionais não conclui sozinha no primeiro envio", async () => {
    env = setupEngine({ scopes: WITH_DISK });
    await prepare();
    const journeyId = start({ bitrixUserId: "12" }, {}, [{ key: "dados-bancarios", name: "Dados bancários", required: false }]);
    await cycle();
    expect(receive(journeyId, "dados-bancarios", pdf("banco")).completed).toBe(false);
    expect(activityByTitle(journeyId, TITLE).status).toBe("open");
  });

  it("sem a permissão Drive, o documento espera com erro e segue quando o webhook ganha a permissão", async () => {
    env = setupEngine();
    await prepare();
    const journeyId = start({ bitrixUserId: "12" });
    await cycle();
    const { document } = receive(journeyId, "documento-com-foto", pdf("rg"));
    await cycle();
    expect(getDocument(document.id)).toMatchObject({ status: "error", error: expect.stringContaining("permissão Drive") });
    expect(env.fake.countCalls("disk.folder.uploadfile")).toBe(0);

    env.fake.scopes.push("disk");
    setWebhookRecord({ ...getWebhookRecord()!, scopes: [...env.fake.scopes] });
    expect(resendDocuments()).toBe(1);
    await cycle();
    expect(getDocument(document.id)?.status).toBe("sent");
    expect(env.fake.driveFiles()).toHaveLength(1);
  });

  it("depois de um envio incerto, procura o arquivo pelo nome em vez de gravar de novo", async () => {
    env = setupEngine({ scopes: WITH_DISK });
    await prepare();
    const journeyId = start({ bitrixUserId: "12" });
    await cycle();
    const { document } = receive(journeyId, "documento-com-foto", pdf("rg"));
    env.fake.failNext("disk.folder.uploadfile", "commitThenTimeout");
    await cycle();
    expect(getDocument(document.id)?.status).toBe("received");
    advance(31_000);
    await cycle();
    expect(env.fake.countCalls("disk.folder.uploadfile")).toBe(1);
    expect(env.fake.driveFiles()).toHaveLength(1);
    expect(getDocument(document.id)).toMatchObject({ status: "sent", localFile: null });
    expect(env.fake.attachments).toHaveLength(1);
  });

  it("documento parado com erro depois de um envio que gravou atrasado: o reenvio acha o arquivo pelo nome", async () => {
    env = setupEngine({ scopes: WITH_DISK });
    await prepare();
    const journeyId = start({ bitrixUserId: "12" });
    await cycle();
    const { document } = receive(journeyId, "documento-com-foto", pdf("rg"));
    env.fake.failNext("disk.folder.uploadfile", "commitThenTimeout");
    await cycle();
    // Estado ruim de antes da correção: tentativa marcada como falha e documento com erro.
    markOperationFailed(`document:upload:${document.id}`);
    markDocumentFailed(document.id, "Nome já existe");
    expect(resendDocuments()).toBe(1);
    advance(31_000);
    await cycle();
    expect(env.fake.countCalls("disk.folder.uploadfile")).toBe(1);
    expect(getDocument(document.id)).toMatchObject({ status: "sent", localFile: null });
    expect(env.fake.attachments).toHaveLength(1);
  });

  it("nome já existe no Drive sem registro da tentativa: usa o arquivo que está lá", async () => {
    env = setupEngine({ scopes: WITH_DISK });
    await prepare();
    const journeyId = start({ bitrixUserId: "12" });
    await cycle();
    const { document } = receive(journeyId, "documento-com-foto", pdf("rg"));
    env.fake.failNext("disk.folder.uploadfile", "commitThenTimeout");
    await cycle();
    getDb().prepare("DELETE FROM operations WHERE key = ?").run(`document:upload:${document.id}`);
    advance(31_000);
    await cycle();
    expect(env.fake.countCalls("disk.folder.uploadfile")).toBe(2);
    expect(env.fake.driveFiles()).toHaveLength(1);
    expect(getDocument(document.id)).toMatchObject({ status: "sent", localFile: null });
  });

  it("anexo incerto: confere os anexos da tarefa em vez de anexar de novo", async () => {
    env = setupEngine({ scopes: WITH_DISK });
    await prepare();
    const journeyId = start({ bitrixUserId: "12" });
    await cycle();
    const { document } = receive(journeyId, "documento-com-foto", pdf("rg"));
    env.fake.failNext("tasks.task.files.attach", "commitThenTimeout");
    await cycle();
    expect(getDocument(document.id)).toMatchObject({ status: "received", attachmentId: null });
    advance(31_000);
    await cycle();
    expect(env.fake.countCalls("tasks.task.files.attach")).toBe(1);
    expect(env.fake.attachments).toHaveLength(1);
    expect(getDocument(document.id)).toMatchObject({ status: "sent", attachmentId: String(env.fake.attachments[0]!.id) });
  });

  it("recria a pasta quando ela foi apagada no Drive", async () => {
    env = setupEngine({ scopes: WITH_DISK });
    await prepare();
    const journeyId = start({ bitrixUserId: "12" });
    await cycle();
    receive(journeyId, "dados-bancarios", pdf("banco"));
    await cycle();
    env.fake.deleteDriveObject(env.fake.driveFolder(DOCUMENTS_ROOT_FOLDER)!.id);
    const { document } = receive(journeyId, "documento-com-foto", pdf("rg"));
    await cycle();
    advance(2_000);
    await cycle();
    expect(getDocument(document.id)?.status).toBe("sent");
    expect(env.fake.driveFiles()).toHaveLength(1);
  });
});
