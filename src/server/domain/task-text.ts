import "server-only";
import type { DocumentRequest, LinkItem } from "@/shared/contracts";
import type { JourneyKind } from "@/shared/enums";
import { formatDateBr } from "./dates";

const KIND_LABEL: Record<JourneyKind, string> = { onboarding: "Onboarding", offboarding: "Desligamento" };
const ANCHOR_LABEL: Record<JourneyKind, string> = { onboarding: "1º dia em", offboarding: "último dia em" };
const MAX_TITLE = 250;

export function taskTitle(personName: string, kind: JourneyKind, activityTitle: string): string {
  const title = `${personName.trim()} · ${KIND_LABEL[kind]} — ${activityTitle.trim()}`;
  return title.length <= MAX_TITLE ? title : `${title.slice(0, MAX_TITLE - 1)}…`;
}

export interface TaskDescriptionInput {
  personName: string;
  kind: JourneyKind;
  anchorDate: string;
  stageName: string;
  instructions: string;
  links: LinkItem[];
  /** Documentos pedidos ao colaborador: chegam anexados à tarefa. */
  documents?: DocumentRequest[];
}

/** Colchetes quebrariam a marcação [URL=…]…[/URL]. */
const safeUrl = (url: string) => url.replaceAll("[", "%5B").replaceAll("]", "%5D");
const safeLabel = (label: string) => label.replaceAll("[", "(").replaceAll("]", ")");

/** Descrição em BBCode do Bitrix24. Nunca inclui o motivo do desligamento. */
export function taskDescription(input: TaskDescriptionInput): string {
  const lines = [
    `[B]Pessoa:[/B] ${input.personName}`,
    `[B]Jornada:[/B] ${KIND_LABEL[input.kind]} · ${ANCHOR_LABEL[input.kind]} ${formatDateBr(input.anchorDate)}`,
    `[B]Etapa:[/B] ${input.stageName}`,
  ];
  const instructions = input.instructions.trim();
  if (instructions) lines.push("", "[B]O que fazer[/B]", instructions);
  if (input.links.length) {
    lines.push("", "[B]Links[/B]", ...input.links.map((link) => `[URL=${safeUrl(link.url)}]${safeLabel(link.label)}[/URL]`));
  }
  if (input.documents?.length) {
    lines.push(
      "",
      "[B]Documentos pedidos[/B]",
      ...input.documents.map((document) => `• ${safeLabel(document.name)}${document.required ? "" : " (opcional)"}`),
      "O colaborador envia pelo link pessoal do Nexo. Cada arquivo vai para o Drive do projeto e é anexado a esta tarefa.",
    );
  }
  lines.push("", "[I]Tarefa criada pelo Nexo.[/I]");
  return lines.join("\n");
}
