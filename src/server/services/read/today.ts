import "server-only";
import type { BoardRowDTO, TodayDTO } from "@/shared/contracts";
import { ROLE_LABEL, type ActivityRole, type ActivityStatus } from "@/shared/enums";
import { blockedStages, daysUntil, isOverdue, todayIn } from "@/server/domain";
import { listActivitiesByJourneyIds, type ActivityRow } from "../../db/repos/activities";
import { listDetections } from "../../db/repos/detections";
import { listJourneys, type JourneyRow } from "../../db/repos/journeys";
import { findPerson, type PersonRow } from "../../db/repos/people";
import { getCompany } from "../../db/repos/settings";
import { getTrigger, type TriggerRow } from "../../db/repos/triggers";
import type { AppUserRow } from "../../db/repos/users";
import { redactText } from "../../log";
import { syncStatus } from "../sync";
import { summarizeJourneys } from "./journeys";
import { localDate, relativeWhen } from "./time";

/**
 * Painel de hoje: o que o RH precisa fazer agora, uma ação por linha, atrasados primeiro.
 * Cada atividade aparece no máximo uma vez (sincronização > aprovação > RH > risco).
 */
const UPCOMING_DAYS = 14;
const MAX_LINES = 12;
const OPEN_STATUSES: ReadonlySet<ActivityStatus> = new Set(["open", "in_progress"]);
const NUDGE_TARGET: Record<ActivityRole, string> = { rh: "RH", gestor: "gestor", ti: "TI", colaborador: "colaborador", buddy: "buddy", outro: "responsável" };

type Row = BoardRowDTO;
type When = Row["when"];
type Status = Row["status"];

interface Ctx {
  timezone: string;
  now: Date;
  today: string;
}

interface Line {
  journey: JourneyRow;
  person: PersonRow | null;
  activities: ActivityRow[];
}

function who(line: Line): Row["who"] {
  return { name: line.person?.name ?? "Pessoa removida", journeyId: line.journey.id, kind: line.journey.kind };
}

function dueWhen(activity: ActivityRow, ctx: Ctx): When {
  return { label: relativeWhen(activity.dueAt, ctx.timezone, ctx.now), at: activity.dueAt, overdue: isOverdue(activity, ctx.now) };
}

function dueToday(at: string | null, ctx: Ctx): boolean {
  return at !== null && localDate(at, ctx.timezone) === ctx.today;
}

/** late: atrasado; attention: vence hoje; senão o estado próprio da linha. */
function dueStatus(when: When, ctx: Ctx, otherwise: Status): Status {
  if (when.overdue) return { tone: "late", label: "Atrasada" };
  if (dueToday(when.at, ctx)) return { tone: "attention", label: "Vence hoje" };
  return otherwise;
}

function assigneeLabel(activity: ActivityRow): string {
  return activity.assigneeName ?? ROLE_LABEL[activity.role];
}

function detectionRows(): Row[] {
  const triggers = new Map<string, TriggerRow | null>();
  return listDetections({ status: "pending" }).map((detection) => {
    if (!triggers.has(detection.triggerId)) triggers.set(detection.triggerId, getTrigger(detection.triggerId));
    const trigger = triggers.get(detection.triggerId) ?? null;
    const kind = trigger?.journeyKind ?? null;
    return {
      id: `detection:${detection.id}`,
      kind: "detection",
      when: { label: "Agora", at: detection.detectedAt, overdue: false },
      who: { name: detection.personName ?? detection.title, journeyId: null, kind },
      what: kind === "offboarding" ? "Saída detectada no Bitrix24" : "Entrada detectada no Bitrix24",
      reason: trigger ? `Gatilho "${trigger.name}"${trigger.stageName ? ` · etapa ${trigger.stageName}` : ""}` : "Um registro do CRM chegou à etapa do gatilho.",
      status: { tone: "info", label: "Nova" },
      action: { type: "start_journey", label: "Iniciar jornada", targetId: detection.id },
    };
  });
}

/** Pessoa sem conta no Bitrix24 com atividades do colaborador já liberadas: as tarefas esperam o vínculo. */
function missingDataRow(line: Line, ctx: Ctx): Row | null {
  if (!line.person || line.person.bitrixUserId || line.journey.status !== "active") return null;
  const waiting = line.activities.filter((activity) => activity.role === "colaborador" && OPEN_STATUSES.has(activity.status));
  const first = waiting.reduce<ActivityRow | null>((soonest, activity) => (!soonest || Date.parse(activity.dueAt) < Date.parse(soonest.dueAt) ? activity : soonest), null);
  if (!first) return null;
  const when = dueWhen(first, ctx);
  return {
    id: `missing:${line.journey.id}`,
    kind: "missing_data",
    when,
    who: who(line),
    what: "Vincular a conta do Bitrix24",
    reason: "As tarefas do colaborador só vão para o Bitrix24 depois do vínculo.",
    status: dueStatus(when, ctx, { tone: "attention", label: "Dados faltando" }),
    action: { type: "link_person", label: "Vincular conta", targetId: line.journey.id },
  };
}

function syncRow(activity: ActivityRow, line: Line): Row | null {
  if (activity.status === "cancelled") return null;
  let reason: string;
  let status: Status;
  if (activity.bitrixMissing && activity.status !== "done") {
    reason = "A tarefa sumiu do Bitrix24 (apagada ou movida de projeto).";
    status = { tone: "attention", label: "Sumiu do Bitrix24" };
  } else if (activity.syncState === "error") {
    reason = activity.syncError ? redactText(activity.syncError) : "O Bitrix24 recusou a tarefa.";
    status = { tone: "attention", label: "Erro no Bitrix24" };
  } else if (activity.syncState === "uncertain") {
    reason = "Não deu para confirmar se a tarefa foi criada no Bitrix24.";
    status = { tone: "info", label: "Sem confirmação" };
  } else {
    return null;
  }
  return {
    id: `sync:${activity.id}`,
    kind: "sync_error",
    when: { label: "Agora", at: null, overdue: false },
    who: who(line),
    what: activity.title,
    reason,
    status,
    action: { type: "resolve_sync", label: "Ver detalhe", targetId: activity.id },
  };
}

function approvalRow(activity: ActivityRow, line: Line, ctx: Ctx): Row | null {
  if (activity.status !== "awaiting_approval") return null;
  const when = dueWhen(activity, ctx);
  return {
    id: `approval:${activity.id}`,
    kind: "approval",
    when,
    who: who(line),
    what: activity.title,
    reason: `${assigneeLabel(activity)} concluiu e aguarda aprovação.`,
    status: when.overdue ? { tone: "late", label: "Atrasada" } : { tone: "attention", label: "Aguardando aprovação" },
    action: { type: "approve", label: "Aprovar", targetId: activity.id },
  };
}

/** Atividades do RH (de qualquer pessoa do RH) atrasadas ou que vencem hoje. */
function hrRow(activity: ActivityRow, line: Line, ctx: Ctx): Row | null {
  if (activity.role !== "rh" || !OPEN_STATUSES.has(activity.status)) return null;
  const when = dueWhen(activity, ctx);
  if (!when.overdue && !dueToday(when.at, ctx)) return null;
  return {
    id: `hr:${activity.id}`,
    kind: "hr_activity",
    when,
    who: who(line),
    what: activity.title,
    reason: activity.assigneeName ? `Com ${activity.assigneeName}` : "Atividade do RH",
    status: dueStatus(when, ctx, { tone: "info", label: "A fazer" }),
    action: { type: "open_activity", label: "Abrir", targetId: activity.id },
  };
}

/** Obrigatórias atrasadas de outros papéis: o RH cobra quem está com a tarefa. */
function riskRow(activity: ActivityRow, line: Line, ctx: Ctx): Row | null {
  if (activity.role === "rh" || !activity.required || !OPEN_STATUSES.has(activity.status)) return null;
  const when = dueWhen(activity, ctx);
  if (!when.overdue) return null;
  return {
    id: `risk:${activity.id}`,
    kind: "risk",
    when,
    who: who(line),
    what: activity.title,
    reason: `${assigneeLabel(activity)} ainda não concluiu.`,
    status: { tone: "late", label: "Atrasada" },
    action: { type: "nudge", label: `Cobrar ${NUDGE_TARGET[activity.role]}`, targetId: activity.id },
  };
}

/**
 * Atividade atrasada que segura uma etapa "quando a anterior terminar": a linha diz qual etapa está travada,
 * para o RH cobrar primeiro o que destrava a jornada.
 */
function markBlocking(row: Row, stageName: string | undefined): Row {
  if (!stageName || !row.when.overdue) return row;
  return { ...row, reason: `Trava a etapa “${stageName}”. ${row.reason}`, status: { tone: "late", label: "Trava a próxima etapa" } };
}

function activityRows(line: Line, ctx: Ctx): Row[] {
  const blocking = new Map<string, string>();
  for (const { stage, blockers } of blockedStages(line.journey, line.activities)) {
    for (const blocker of blockers) blocking.set(blocker.id, stage.name);
  }
  const rows: Row[] = [];
  for (const activity of line.activities) {
    const row =
      syncRow(activity, line) ??
      (line.journey.status === "active" ? (approvalRow(activity, line, ctx) ?? hrRow(activity, line, ctx) ?? riskRow(activity, line, ctx)) : null);
    if (row) rows.push(row.kind === "sync_error" ? row : markBlocking(row, blocking.get(activity.id)));
  }
  return rows;
}

function sortBoard(rows: Row[], now: Date): Row[] {
  const at = (row: Row) => (row.when.at ? Date.parse(row.when.at) : now.getTime());
  return [...rows].sort((a, b) => Number(b.when.overdue) - Number(a.when.overdue) || at(a) - at(b));
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

export function buildToday(user: AppUserRow, now = new Date()): TodayDTO {
  const { timezone } = getCompany();
  const ctx: Ctx = { timezone, now, today: todayIn(timezone, now) };

  const journeys = listJourneys({ status: ["active", "paused"] });
  const activitiesByJourney = new Map<string, ActivityRow[]>();
  for (const activity of listActivitiesByJourneyIds(journeys.map((journey) => journey.id))) {
    activitiesByJourney.set(activity.journeyId, [...(activitiesByJourney.get(activity.journeyId) ?? []), activity]);
  }
  const people = new Map<string, PersonRow | null>();
  const lines: Line[] = journeys.map((journey) => {
    if (!people.has(journey.personId)) people.set(journey.personId, findPerson(journey.personId));
    return { journey, person: people.get(journey.personId) ?? null, activities: activitiesByJourney.get(journey.id) ?? [] };
  });

  const board = sortBoard(
    [...detectionRows(), ...lines.flatMap((line) => [missingDataRow(line, ctx), ...activityRows(line, ctx)].filter((row): row is Row => row !== null))],
    now,
  );

  const active = lines.filter((line) => line.journey.status === "active");
  const withDays = active.map((line) => ({ line, days: daysUntil(line.journey.anchorDate, timezone, now) }));
  const soon = withDays
    .filter(({ days }) => days >= 0 && days <= UPCOMING_DAYS)
    .sort((a, b) => a.days - b.days || a.line.journey.anchorDate.localeCompare(b.line.journey.anchorDate));
  const nearest = [...withDays]
    .sort((a, b) => Math.abs(a.days) - Math.abs(b.days) || a.line.journey.anchorDate.localeCompare(b.line.journey.anchorDate))
    .slice(0, MAX_LINES)
    .map(({ line }) => line.journey);

  return {
    date: ctx.today,
    greetingName: firstName(user.name),
    counters: {
      actions: board.length,
      arriving: soon.filter(({ line }) => line.journey.kind === "onboarding").length,
      leaving: soon.filter(({ line }) => line.journey.kind === "offboarding").length,
    },
    board,
    lines: summarizeJourneys(nearest, now),
    upcoming: soon.map(({ line, days }) => ({
      journeyId: line.journey.id,
      personName: line.person?.name ?? "Pessoa removida",
      kind: line.journey.kind,
      anchorDate: line.journey.anchorDate,
      daysUntil: days,
    })),
    sync: syncStatus(),
  };
}
