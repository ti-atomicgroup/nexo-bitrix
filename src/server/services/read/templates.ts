import "server-only";
import type { LibraryActivityDTO, TemplateDTO, TemplateSummaryDTO } from "@/shared/contracts";
import type { TemplateInput } from "@/shared/schemas";
import { activityLibrary, type Actor } from "@/server/engine";
import { archiveTemplate, createTemplate, getTemplate, listTemplates, updateTemplate } from "../../db/repos/templates";
import { AppError } from "../../errors";
import { auditAs } from "../audit";

const templateNotFound = () => new AppError("NOT_FOUND", "Não encontramos esta trilha.", 404);

/** Galeria: só trilhas ativas (arquivadas não aparecem para iniciar jornadas). */
export function listTemplateSummaries(): TemplateSummaryDTO[] {
  return listTemplates();
}

export function getTemplateDTO(id: string): TemplateDTO {
  const template = getTemplate(id);
  if (!template) throw templateNotFound();
  return template;
}

export function createTemplateFromInput(input: TemplateInput, actor: Actor): TemplateDTO {
  const template = createTemplate(input);
  auditAs(actor, "Trilha criada", "template", template.id, template.name);
  return template;
}

/** Edita e incrementa a versão; jornadas em andamento seguem com a cópia da versão antiga. */
export function updateTemplateFromInput(id: string, input: TemplateInput, actor: Actor): TemplateDTO {
  const template = updateTemplate(id, input);
  if (!template) throw templateNotFound();
  auditAs(actor, "Trilha atualizada", "template", template.id, `${template.name} · versão ${template.version}`);
  return template;
}

export function archiveTemplateById(id: string, actor: Actor): { ok: true } {
  const template = getTemplate(id);
  if (!template || !archiveTemplate(id)) throw templateNotFound();
  auditAs(actor, "Trilha arquivada", "template", id, template.name);
  return { ok: true };
}

export function libraryActivities(): LibraryActivityDTO[] {
  return activityLibrary();
}
