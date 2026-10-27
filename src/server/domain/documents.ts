import "server-only";
import type { DocumentRequest } from "@/shared/contracts";
import type { JourneyKind } from "@/shared/enums";

/** Teto por arquivo: cabe numa chamada REST (base64) ao Bitrix24 e na memória do servidor da Onnira. */
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

export interface FileType {
  mime: string;
  ext: string;
}

const startsWith = (bytes: Uint8Array, signature: number[], offset = 0) => signature.every((value, index) => bytes[offset + index] === value);
const ascii = (text: string) => [...text].map((char) => char.charCodeAt(0));
const HEIF_BRANDS = ["heic", "heix", "heif", "mif1", "msf1"];

/** Tipo real do arquivo pelos primeiros bytes (o nome e o tipo informados pelo navegador não valem). Só PDF e fotos. */
export function detectFileType(bytes: Uint8Array): FileType | null {
  if (startsWith(bytes, ascii("%PDF-"))) return { mime: "application/pdf", ext: "pdf" };
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return { mime: "image/jpeg", ext: "jpg" };
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { mime: "image/png", ext: "png" };
  if (startsWith(bytes, ascii("RIFF")) && startsWith(bytes, ascii("WEBP"), 8)) return { mime: "image/webp", ext: "webp" };
  if (startsWith(bytes, ascii("ftyp"), 4) && HEIF_BRANDS.some((brand) => startsWith(bytes, ascii(brand), 8))) return { mime: "image/heic", ext: "heic" };
  return null;
}

/** Sem os caracteres que o Drive recusa em nomes de arquivo e pasta. */
function cleanName(value: string): string {
  return value
    .replace(/[\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

/** "Documento com foto - Ana Souza - 3f2a9c.pdf": o sufixo vem do id do documento e permite reencontrar o arquivo no Drive. */
export function driveFileName(input: { requestName: string; personName: string; ext: string; id: string }): string {
  const suffix = input.id.replace(/[^a-z0-9]/gi, "").slice(0, 6).toLowerCase();
  return `${cleanName(input.requestName)} - ${cleanName(input.personName)} - ${suffix}.${input.ext}`;
}

/** "Ana Souza · Entrada 2026-11-03": uma pasta por jornada dentro de "Nexo · Documentos". */
export function journeyFolderName(input: { personName: string; kind: JourneyKind; anchorDate: string }): string {
  return `${cleanName(input.personName)} · ${input.kind === "onboarding" ? "Entrada" : "Saída"} ${input.anchorDate}`;
}

/** Pedidos obrigatórios que ainda não receberam nenhum arquivo. */
export function missingRequired(requests: DocumentRequest[], receivedKeys: Iterable<string>): DocumentRequest[] {
  const received = new Set(receivedKeys);
  return requests.filter((request) => request.required && !received.has(request.key));
}
