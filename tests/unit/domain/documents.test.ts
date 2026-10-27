import { describe, expect, it } from "vitest";
import { detectFileType, driveFileName, journeyFolderName, MAX_DOCUMENT_BYTES, missingRequired } from "@/server/domain/documents";

const bytes = (...values: number[]) => new Uint8Array([...values, ...new Array(16).fill(0)]);
const ascii = (text: string) => [...text].map((char) => char.charCodeAt(0));

describe("detectFileType", () => {
  it("reconhece PDF, JPEG, PNG, WebP e HEIC pelo conteúdo, não pelo nome", () => {
    expect(detectFileType(bytes(...ascii("%PDF-1.7")))).toEqual({ mime: "application/pdf", ext: "pdf" });
    expect(detectFileType(bytes(0xff, 0xd8, 0xff, 0xe0))).toEqual({ mime: "image/jpeg", ext: "jpg" });
    expect(detectFileType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toEqual({ mime: "image/png", ext: "png" });
    expect(detectFileType(bytes(...ascii("RIFF"), 1, 2, 3, 4, ...ascii("WEBP")))).toEqual({ mime: "image/webp", ext: "webp" });
    expect(detectFileType(bytes(0, 0, 0, 0x18, ...ascii("ftypheic")))).toEqual({ mime: "image/heic", ext: "heic" });
  });

  it("recusa outros formatos (executável, zip, texto, vazio)", () => {
    expect(detectFileType(bytes(...ascii("MZ")))).toBeNull();
    expect(detectFileType(bytes(0x50, 0x4b, 0x03, 0x04))).toBeNull();
    expect(detectFileType(new Uint8Array(ascii("olá")))).toBeNull();
    expect(detectFileType(new Uint8Array())).toBeNull();
  });

  it("limita o arquivo a 10 MB", () => {
    expect(MAX_DOCUMENT_BYTES).toBe(10 * 1024 * 1024);
  });
});

describe("nomes no Drive", () => {
  it("nomeia o arquivo pelo pedido e pela pessoa, com um sufixo único e sem caracteres proibidos", () => {
    expect(driveFileName({ requestName: "Documento com foto", personName: "Ana Souza", ext: "pdf", id: "3f2a9c1d-0000" })).toBe(
      "Documento com foto - Ana Souza - 3f2a9c.pdf",
    );
    expect(driveFileName({ requestName: 'Contrato: "via/2"', personName: "Zé*", ext: "jpg", id: "abcdef12" })).toBe("Contrato via 2 - Zé - abcdef.jpg");
  });

  it("nomeia a pasta da jornada pela pessoa, tipo e data", () => {
    expect(journeyFolderName({ personName: "Ana Souza", kind: "onboarding", anchorDate: "2026-11-03" })).toBe("Ana Souza · Entrada 2026-11-03");
    expect(journeyFolderName({ personName: "B/runo", kind: "offboarding", anchorDate: "2026-12-01" })).toBe("B runo · Saída 2026-12-01");
  });
});

describe("missingRequired", () => {
  const requests = [
    { key: "rg", name: "RG", hint: "", required: true },
    { key: "residencia", name: "Comprovante", hint: "", required: true },
    { key: "banco", name: "Dados bancários", hint: "", required: false },
  ];

  it("lista os obrigatórios que ainda não chegaram", () => {
    expect(missingRequired(requests, ["rg", "banco"]).map((request) => request.key)).toEqual(["residencia"]);
    expect(missingRequired(requests, ["rg", "residencia"])).toEqual([]);
  });

  it("sem pedidos, não falta nada", () => {
    expect(missingRequired([], [])).toEqual([]);
  });
});
