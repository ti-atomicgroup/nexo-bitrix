import "server-only";
import { randomUUID } from "node:crypto";
import type { JourneyChecklistItem, TemplateDTO, UserRef } from "@/shared/contracts";
import { ACTIVITY_ROLES, type ActivityRole, type ParticipantRole } from "@/shared/enums";
import type { ActivityRow } from "../db/repos/activities";
import { dueAt } from "./dates";

export type Participants = Partial<Record<ParticipantRole, UserRef>>;

export interface JourneyPerson {
  bitrixUserId: string | null;
  name: string;
}

export interface ComputeActivitiesInput {
  journeyId: string;
  /** Snapshot da trilha (já com injeções da saída, se houver). */
  template: TemplateDTO;
  anchorDate: string;
  timezone: string;
  participants: Participants;
  person: JourneyPerson;
  newId?: () => string;
}

export interface ComputedActivities {
  activities: ActivityRow[];
  /** Papéis com atividades e sem ninguém para fazê-las (o colaborador sem conta não conta: a atividade fica no link). */
  missingRoles: ActivityRole[];
}

/** Quem faz: participantes da jornada; buddy cai para gestor e depois RH; "outro" fica com o RH. */
export function resolveAssignee(role: ActivityRole, participants: Participants, person: JourneyPerson): UserRef | null {
  switch (role) {
    case "colaborador":
      return person.bitrixUserId ? { bitrixUserId: person.bitrixUserId, name: person.name, position: null } : null;
    case "outro":
      return participants.rh ?? null;
    case "buddy":
      return participants.buddy ?? participants.gestor ?? participants.rh ?? null;
    default:
      return participants[role] ?? null;
  }
}

const ROLE_PHRASE: Record<ActivityRole, string> = {
  rh: "do RH",
  gestor: "do gestor",
  ti: "de TI",
  buddy: "do buddy",
  colaborador: "do colaborador",
  outro: "de outras áreas",
};

/** "Escolha quem faz as tarefas de TI." / "… do gestor e de TI." */
export function missingAssigneeMessage(roles: ActivityRole[]): string {
  const phrases = roles.map((role) => ROLE_PHRASE[role]);
  const list = phrases.length > 1 ? `${phrases.slice(0, -1).join(", ")} e ${phrases.at(-1)}` : (phrases[0] ?? "");
  return `Escolha quem faz as tarefas ${list}.`;
}

export function computeActivities(input: ComputeActivitiesInput): ComputedActivities {
  const newId = input.newId ?? randomUUID;
  const missing = new Set<ActivityRole>();
  const activities: ActivityRow[] = [];
  const stages = [...input.template.stages].sort((a, b) => a.position - b.position);
  for (const stage of stages) {
    const ordered = [...stage.activities].sort((a, b) => a.position - b.position);
    for (const activity of ordered) {
      // Pedido de documentos sem conta do colaborador: a tarefa fica com o RH, que recebe os arquivos anexados nela.
      const receivesDocuments = activity.role === "colaborador" && Boolean(activity.documents?.length);
      const assignee = resolveAssignee(activity.role, input.participants, input.person) ?? (receivesDocuments ? (input.participants.rh ?? null) : null);
      if (!assignee && activity.role !== "colaborador") missing.add(activity.role === "outro" ? "rh" : activity.role);
      const checklist: JourneyChecklistItem[] = activity.checklist.map((item) => ({
        key: item.key,
        text: item.text,
        done: false,
        bitrixItemId: null,
        ledger: item.ledger ?? null,
      }));
      activities.push({
        id: newId(),
        journeyId: input.journeyId,
        stagePosition: stage.position,
        position: activity.position,
        templateActivityId: activity.id,
        title: activity.title,
        instructions: activity.instructions,
        kind: activity.kind,
        role: activity.role,
        assigneeBitrixId: assignee?.bitrixUserId ?? null,
        assigneeName: assignee?.name ?? null,
        dueAt: dueAt(input.anchorDate, activity.dueOffsetDays, activity.dueOffsetUnit, activity.dueTime, input.timezone),
        required: activity.required,
        visibility: activity.visibility,
        requiresApproval: activity.requiresApproval,
        ledgerRole: activity.ledgerRole,
        status: "locked",
        checklist,
        links: activity.links,
        documents: activity.documents ?? [],
        bitrixTaskId: null,
        bitrixStatus: null,
        bitrixMissing: false,
        checklistSyncedAt: null,
        syncState: "local",
        syncError: null,
        releasedAt: null,
        doneAt: null,
        doneSource: null,
        calendarEventId: null,
        lastNudgedAt: null,
      });
    }
  }
  return { activities, missingRoles: ACTIVITY_ROLES.filter((role) => missing.has(role)) };
}
