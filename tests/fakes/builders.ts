/** Montadores de linhas e trilhas para testes do domínio e do motor. */
import type { TemplateDTO, TemplateStageDTO } from "@/shared/contracts";
import type { ActivityRow } from "@/server/db/repos/activities";
import type { JourneyRow } from "@/server/db/repos/journeys";
import type { LedgerRow } from "@/server/db/repos/ledger";
import { templateInput, type TemplateInput } from "@/shared/schemas";

let sequence = 0;
const nextId = (prefix: string) => `${prefix}-${++sequence}`;

export function makeActivity(overrides: Partial<ActivityRow> = {}): ActivityRow {
  return {
    id: nextId("act"),
    journeyId: "j1",
    stagePosition: 0,
    position: 0,
    templateActivityId: null,
    title: "Criar acessos",
    instructions: "",
    kind: "task",
    role: "ti",
    assigneeBitrixId: "11",
    assigneeName: "Diego TI",
    dueAt: "2026-10-28T18:00:00-03:00",
    required: true,
    visibility: "team",
    requiresApproval: false,
    ledgerRole: null,
    status: "open",
    checklist: [],
    links: [],
    documents: [],
    bitrixTaskId: null,
    bitrixStatus: null,
    bitrixMissing: false,
    checklistSyncedAt: null,
    syncState: "local",
    syncError: null,
    releasedAt: "2026-10-26T12:00:00.000Z",
    doneAt: null,
    doneSource: null,
    calendarEventId: null,
    lastNudgedAt: null,
    ...overrides,
  };
}

/** Converte a entrada validada de uma trilha num TemplateDTO (ids e posições estáveis), como o snapshot da jornada. */
export function templateFromInput(input: TemplateInput, id = "tpl-1"): TemplateDTO {
  const stages: TemplateStageDTO[] = input.stages.map((stage, stageIndex) => ({
    id: `${id}-s${stageIndex}`,
    position: stageIndex,
    name: stage.name,
    description: stage.description ?? "",
    releaseMode: stage.releaseMode,
    releaseOffsetDays: stage.releaseOffsetDays ?? 0,
    releaseOffsetUnit: stage.releaseOffsetUnit ?? "calendar",
    activities: stage.activities.map((activity, activityIndex) => ({
      id: `${id}-s${stageIndex}-a${activityIndex}`,
      position: activityIndex,
      title: activity.title,
      instructions: activity.instructions ?? "",
      kind: activity.kind ?? "task",
      role: activity.role,
      dueOffsetDays: activity.dueOffsetDays,
      dueOffsetUnit: activity.dueOffsetUnit ?? "calendar",
      dueTime: activity.dueTime ?? "18:00",
      required: activity.required ?? true,
      visibility: activity.visibility ?? "team",
      requiresApproval: activity.requiresApproval ?? false,
      ledgerRole: activity.ledgerRole ?? null,
      checklist: activity.checklist ?? [],
      links: activity.links ?? [],
    })),
  }));
  const offsets = stages.flatMap((stage) => stage.activities.map((activity) => activity.dueOffsetDays));
  return {
    id,
    kind: input.kind,
    name: input.name,
    profile: input.profile ?? "",
    description: input.description ?? "",
    version: 1,
    archived: false,
    stageCount: stages.length,
    activityCount: offsets.length,
    span: { fromDays: Math.min(...offsets), toDays: Math.max(...offsets) },
    updatedAt: "2026-10-26T12:00:00.000Z",
    stages,
  };
}

export function makeTemplate(raw: unknown, id = "tpl-1"): TemplateDTO {
  return templateFromInput(templateInput.parse(raw), id);
}

/** Trilha curta de entrada usada em vários testes: antes do 1º dia (start), 1º dia (offset 0) e 30 dias (after_previous). */
export const sampleOnboarding = (): TemplateDTO =>
  makeTemplate({
    kind: "onboarding",
    name: "Onboarding · Teste",
    stages: [
      {
        name: "Antes do 1º dia",
        releaseMode: "start",
        activities: [
          {
            title: "Criar acessos",
            role: "ti",
            dueOffsetDays: -3,
            dueOffsetUnit: "business",
            checklist: [
              { key: "google", text: "Criar conta Google Workspace", ledger: { kind: "access", name: "Google Workspace" } },
              { key: "notebook", text: "Separar notebook", ledger: { kind: "equipment", name: "Notebook" } },
              { key: "guia", text: "Enviar guia de TI" },
            ],
          },
          { title: "Enviar documentos", role: "colaborador", dueOffsetDays: -2, visibility: "employee" },
          { title: "Preparar contrato", role: "rh", dueOffsetDays: -2, visibility: "hr", required: false },
        ],
      },
      {
        name: "Primeiro dia",
        releaseMode: "offset",
        releaseOffsetDays: 0,
        activities: [{ title: "Boas-vindas do gestor", role: "gestor", kind: "meeting", dueOffsetDays: 0, dueTime: "10:00" }],
      },
      {
        name: "Primeiro mês",
        releaseMode: "after_previous",
        activities: [{ title: "1:1 de 30 dias", role: "gestor", kind: "meeting", dueOffsetDays: 30, dueTime: "15:00" }],
      },
    ],
  });

export function makeJourney(overrides: Partial<JourneyRow> = {}): JourneyRow {
  return {
    id: "j1",
    kind: "onboarding",
    personId: "p1",
    templateId: "tpl-1",
    templateVersion: 1,
    snapshot: sampleOnboarding(),
    anchorDate: "2026-11-02",
    status: "active",
    offboardingReason: null,
    participants: {},
    sourceType: "manual",
    sourceKey: "manual:x",
    sourceLabel: null,
    crmBinding: null,
    crmUrl: null,
    linkTokenHash: null,
    linkExpiresAt: null,
    createdBy: null,
    createdAt: "2026-10-26T12:00:00.000Z",
    updatedAt: "2026-10-26T12:00:00.000Z",
    completedAt: null,
    cancelledAt: null,
    cancelReason: null,
    personPosition: null,
    ...overrides,
  };
}

export function makeLedger(overrides: Partial<LedgerRow> = {}): LedgerRow {
  return {
    id: "3f2504e0-4f89-11d3-9a0c-0305e82c3301",
    personId: "p1",
    kind: "access",
    name: "Google Workspace",
    detail: "",
    status: "active",
    source: "onboarding",
    grantedJourneyId: null,
    grantedActivityId: null,
    grantedItemKey: null,
    closingJourneyId: null,
    closingActivityId: null,
    waivedReason: null,
    createdAt: "2026-10-26T12:00:00.000Z",
    updatedAt: "2026-10-26T12:00:00.000Z",
    grantedAt: "2026-10-26T12:00:00.000Z",
    closedAt: null,
    ...overrides,
  };
}
