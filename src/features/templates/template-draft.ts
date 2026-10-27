/**
 * Rascunho editável de uma trilha. Cada item tem um `uid` local (chave do React); ao salvar vira o formato
 * do esquema `templateInput`, com as chaves do checklist geradas a partir do texto.
 */
import type { TemplateBody } from "@/lib/api-client";
import type { LedgerTag, LibraryActivityDTO, TemplateActivityDTO, TemplateDTO } from "@/shared/contracts";
import type { ActivityKind, ActivityRole, JourneyKind, OffsetUnit, ReleaseMode, Visibility } from "@/shared/enums";

export interface ChecklistDraft {
  uid: string;
  key: string;
  text: string;
  ledger: LedgerTag | null;
}

export interface LinkDraft {
  uid: string;
  label: string;
  url: string;
}

export interface DocumentDraft {
  uid: string;
  key: string;
  name: string;
  hint: string;
  required: boolean;
}

export interface ActivityDraft {
  uid: string;
  id?: string;
  title: string;
  instructions: string;
  kind: ActivityKind;
  role: ActivityRole;
  dueOffsetDays: number;
  dueOffsetUnit: OffsetUnit;
  dueTime: string;
  required: boolean;
  visibility: Visibility;
  requiresApproval: boolean;
  ledgerRole: "revoke_and_collect" | null;
  checklist: ChecklistDraft[];
  links: LinkDraft[];
  /** Documentos pedidos ao colaborador (só valem em atividade do colaborador visível no link). */
  documents: DocumentDraft[];
}

export interface StageDraft {
  uid: string;
  id?: string;
  name: string;
  description: string;
  releaseMode: ReleaseMode;
  releaseOffsetDays: number;
  releaseOffsetUnit: OffsetUnit;
  /** Data-limite de "quando a etapa anterior terminar"; nulo = sem limite. */
  releaseLatestOffsetDays: number | null;
  activities: ActivityDraft[];
}

export interface TemplateDraft {
  kind: JourneyKind;
  name: string;
  profile: string;
  description: string;
  stages: StageDraft[];
}

let counter = 0;
export function uid(): string {
  counter += 1;
  return `r${counter}`;
}

export function emptyActivity(): ActivityDraft {
  return {
    uid: uid(),
    title: "",
    instructions: "",
    kind: "task",
    role: "rh",
    dueOffsetDays: 0,
    dueOffsetUnit: "business",
    dueTime: "18:00",
    required: true,
    visibility: "team",
    requiresApproval: false,
    ledgerRole: null,
    checklist: [],
    links: [],
    documents: [],
  };
}

export function emptyStage(first: boolean): StageDraft {
  return {
    uid: uid(),
    name: "",
    description: "",
    releaseMode: first ? "start" : "after_previous",
    releaseOffsetDays: 0,
    releaseOffsetUnit: "calendar",
    releaseLatestOffsetDays: null,
    activities: [emptyActivity()],
  };
}

export function emptyTemplate(kind: JourneyKind = "onboarding"): TemplateDraft {
  return { kind, name: "", profile: "", description: "", stages: [emptyStage(true)] };
}

function activityFrom(activity: Omit<TemplateActivityDTO, "id" | "position"> & { id?: string }): ActivityDraft {
  return {
    uid: uid(),
    id: activity.id,
    title: activity.title,
    instructions: activity.instructions,
    kind: activity.kind,
    role: activity.role,
    dueOffsetDays: activity.dueOffsetDays,
    dueOffsetUnit: activity.dueOffsetUnit,
    dueTime: activity.dueTime,
    required: activity.required,
    visibility: activity.visibility,
    requiresApproval: activity.requiresApproval,
    ledgerRole: activity.ledgerRole,
    checklist: activity.checklist.map((item) => ({ uid: uid(), key: item.key, text: item.text, ledger: item.ledger })),
    links: activity.links.map((link) => ({ uid: uid(), label: link.label, url: link.url })),
    documents: (activity.documents ?? []).map((document) => ({ uid: uid(), key: document.key, name: document.name, hint: document.hint, required: document.required })),
  };
}

export function fromLibrary(item: LibraryActivityDTO): ActivityDraft {
  return activityFrom(item.activity);
}

export function draftFrom(template: TemplateDTO): TemplateDraft {
  return {
    kind: template.kind,
    name: template.name,
    profile: template.profile,
    description: template.description,
    stages: [...template.stages]
      .sort((a, b) => a.position - b.position)
      .map((stage) => ({
        uid: uid(),
        id: stage.id,
        name: stage.name,
        description: stage.description,
        releaseMode: stage.releaseMode,
        releaseOffsetDays: stage.releaseOffsetDays,
        releaseOffsetUnit: stage.releaseOffsetUnit,
        releaseLatestOffsetDays: stage.releaseLatestOffsetDays ?? null,
        activities: [...stage.activities].sort((a, b) => a.position - b.position).map(activityFrom),
      })),
  };
}

/** "Criar conta no Google" → "criar-conta-no-google" (sem acentos, até 40 caracteres, sem repetir). */
function slug(text: string, taken: Set<string>): string {
  const base =
    text
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 34) || "item";
  let key = base;
  let n = 2;
  while (taken.has(key)) key = `${base}-${n++}`;
  taken.add(key);
  return key;
}

/** Só a atividade do colaborador, visível no link pessoal, recebe documentos. */
export function canRequestDocuments(activity: Pick<ActivityDraft, "role" | "visibility">): boolean {
  return activity.role === "colaborador" && activity.visibility === "employee";
}

export function toBody(draft: TemplateDraft): TemplateBody {
  return {
    kind: draft.kind,
    name: draft.name,
    profile: draft.profile,
    description: draft.description,
    stages: draft.stages.map((stage) => ({
      ...(stage.id ? { id: stage.id } : {}),
      name: stage.name,
      description: stage.description,
      releaseMode: stage.releaseMode,
      releaseOffsetDays: stage.releaseMode === "offset" ? stage.releaseOffsetDays : 0,
      releaseOffsetUnit: stage.releaseOffsetUnit,
      releaseLatestOffsetDays: stage.releaseMode === "after_previous" ? stage.releaseLatestOffsetDays : null,
      activities: stage.activities.map((activity) => {
        const taken = new Set(activity.checklist.map((item) => item.key).filter(Boolean));
        const documentKeys = new Set(activity.documents.map((document) => document.key).filter(Boolean));
        return {
          ...(activity.id ? { id: activity.id } : {}),
          title: activity.title,
          instructions: activity.instructions,
          kind: activity.kind,
          role: activity.role,
          dueOffsetDays: activity.dueOffsetDays,
          dueOffsetUnit: activity.dueOffsetUnit,
          dueTime: activity.dueTime,
          required: activity.required,
          visibility: activity.visibility,
          requiresApproval: activity.requiresApproval,
          ledgerRole: draft.kind === "offboarding" ? activity.ledgerRole : null,
          checklist: activity.checklist.map((item) => ({
            key: item.key || slug(item.text, taken),
            text: item.text,
            ledger: item.ledger && item.ledger.name.trim() ? item.ledger : null,
          })),
          links: activity.links.map((link) => ({ label: link.label, url: link.url.trim() })),
          documents: canRequestDocuments(activity)
            ? activity.documents.map((document) => ({
                key: document.key || slug(document.name, documentKeys),
                name: document.name,
                hint: document.hint.trim(),
                required: document.required,
              }))
            : [],
        };
      }),
    })),
  };
}
