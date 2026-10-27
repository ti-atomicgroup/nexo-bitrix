import { describe, expect, it } from "vitest";
import { collaboratorPending, reminderMessage } from "@/features/journeys/journey/reminder";
import type { ActivityDTO, JourneyDTO, ReceivedDocumentDTO } from "@/shared/contracts";

const file = (rejected = false): ReceivedDocumentDTO => ({
  id: "f",
  fileName: "x.pdf",
  size: 1,
  receivedAt: "2026-10-27T10:00:00-03:00",
  status: "sent",
  bitrixUrl: null,
  error: null,
  rejectedAt: rejected ? "2026-10-27T11:00:00-03:00" : null,
  rejectedReason: rejected ? "Ilegível" : null,
});

const activity = (overrides: Partial<ActivityDTO>): ActivityDTO => ({ role: "colaborador", visibility: "employee", status: "open", title: "Atividade", ...overrides }) as ActivityDTO;

const journey = (activities: ActivityDTO[]) => ({ stages: [{ activities }] }) as unknown as JourneyDTO;

describe("lembrete ao colaborador", () => {
  it("lista documentos obrigatórios que faltam (inclusive os pedidos de novo) e atividades dele em aberto", () => {
    const pending = collaboratorPending(
      journey([
        activity({
          title: "Envie seus documentos",
          documents: [
            { key: "rg", name: "Documento com foto", hint: "", required: true, files: [file()] },
            { key: "end", name: "Comprovante de residência", hint: "", required: true, files: [] },
            { key: "banco", name: "Dados bancários", hint: "", required: false, files: [] },
            { key: "ctps", name: "Carteira de trabalho", hint: "", required: true, files: [file(true)] },
          ],
        }),
        activity({ title: "Leia o guia de cultura" }),
        activity({ title: "Já feita", status: "done" }),
        activity({ title: "Ainda bloqueada", status: "locked" }),
        activity({ title: "Do gestor", role: "gestor" }),
      ]),
    );
    expect(pending).toEqual(["Comprovante de residência", "Carteira de trabalho (pedimos de novo)", "Leia o guia de cultura"]);
  });

  it("monta a mensagem de chegada e de saída, com o link quando ele acabou de ser criado", () => {
    expect(reminderMessage("onboarding", "Ana", ["Comprovante de residência"], null)).toBe(
      "Oi, Ana! Passando para lembrar o que falta para a sua chegada:\n• Comprovante de residência\nÉ só abrir o seu link pessoal do Nexo, o mesmo que enviamos antes. Qualquer dúvida, fale com o RH.",
    );
    expect(reminderMessage("offboarding", "Rui", ["Devolver o notebook"], "https://nexo.test/j/abc")).toContain("É só abrir o seu link pessoal: https://nexo.test/j/abc");
  });
});
