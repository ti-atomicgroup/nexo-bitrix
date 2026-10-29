import "server-only";
import { isBitrixError } from "../bitrix/errors";
import { createMeeting, notifyUser, postToFeed } from "../bitrix/methods";
import { getActivity, updateActivity, type ActivityRow } from "../db/repos/activities";
import { enqueueJob } from "../db/repos/jobs";
import { getJourney, type JourneyRow } from "../db/repos/journeys";
import { beginOperation, confirmOperation, getOperation, markOperationFailed, markOperationUncertain } from "../db/repos/operations";
import { findPerson } from "../db/repos/people";
import { getCompany, getFeatures, getWebhookRecord } from "../db/repos/settings";
import { daysBetween, formatInZone, todayIn, zonedInstant } from "../domain/dates";
import { listTitles } from "../domain/completion";
import { bbText } from "../domain/task-text";
import { RetryLater } from "./job-errors";
import { enqueueActivityJob, JOB_KINDS } from "./queue";
import type { EngineContext } from "./runtime";

/**
 * Extras que ligam sozinhos quando o webhook tem o escopo e o RH não desligou o recurso em Ajustes:
 * avisos (im), reuniões na agenda (calendar) e boas-vindas no Feed (log).
 */
type Extra = "notifications" | "calendar" | "feed";
const EXTRA_SCOPE: Record<Extra, string> = { notifications: "im", calendar: "calendar", feed: "log" };
const MEETING_MINUTES = 30;
const WELCOME_POST_TIME = "09:00";

export function extraEnabled(extra: Extra, scopes: string[] = getWebhookRecord()?.scopes ?? []): boolean {
  return getFeatures()[extra] && scopes.includes(EXTRA_SCOPE[extra]);
}

/**
 * Etapa liberada: agenda as reuniões liberadas e avisa o colaborador (só na entrada e só se ele tem conta).
 * Na saída nunca avisamos: um aviso automático poderia chegar antes da conversa com a pessoa.
 */
export function onStagesReleased(journey: JourneyRow, positions: number[], activities: ActivityRow[], options: { initial: boolean }): void {
  const released = activities.filter((activity) => positions.includes(activity.stagePosition) && activity.status !== "cancelled");
  if (extraEnabled("calendar")) {
    for (const activity of released) {
      if (activity.kind === "meeting" && activity.assigneeBitrixId && !activity.calendarEventId) enqueueActivityJob(JOB_KINDS.meetingCreate, activity.id);
    }
  }
  if (options.initial || journey.kind !== "onboarding" || !extraEnabled("notifications")) return;
  const person = findPerson(journey.personId);
  if (!person?.bitrixUserId) return;
  for (const position of positions) {
    const stage = journey.snapshot.stages.find((candidate) => candidate.position === position);
    const mine = released.filter((activity) => activity.stagePosition === position && activity.visibility === "employee" && activity.role === "colaborador");
    if (!stage || !mine.length) continue;
    enqueueJob({
      kind: JOB_KINDS.notify,
      dedupeKey: `notify:stage:${journey.id}:${position}`,
      payload: {
        userId: person.bitrixUserId,
        message: `Sua jornada avançou: começou a etapa “${stage.name}”. Para você: ${listTitles(mine.map((activity) => activity.title))}.`,
      },
    });
  }
}

/** Boas-vindas no Feed às 09:00 do 1º dia (entrada). */
export function scheduleWelcomePost(journey: JourneyRow, timezone: string): void {
  if (journey.kind !== "onboarding" || !extraEnabled("feed")) return;
  const runAt = new Date(zonedInstant(journey.anchorDate, WELCOME_POST_TIME, timezone)).toISOString();
  enqueueJob({ kind: JOB_KINDS.feedPost, dedupeKey: `feed.post:${journey.id}`, payload: { journeyId: journey.id }, runAt });
}

/** Aviso não se repete em caso de dúvida: melhor perder um aviso do que mandar dois. */
export async function handleNotify(payload: Record<string, unknown>, ctx: EngineContext): Promise<void> {
  if (!extraEnabled("notifications", ctx.scopes)) return;
  const userId = String(payload.userId ?? "");
  const message = String(payload.message ?? "");
  if (!/^\d+$/.test(userId) || !message) return;
  try {
    await notifyUser(ctx.client, userId, message);
  } catch (error) {
    if (isBitrixError(error) && error.uncertain) return;
    throw error;
  }
}

/** Uma escrita sem como reconciliar (evento, post): confirma ou desiste, nunca reenvia depois de uma resposta incerta. */
async function sendOnce(key: string, send: () => Promise<string>): Promise<string | null> {
  const previous = getOperation(key);
  if (previous?.status === "confirmed") return previous.resultId;
  if (previous && previous.status !== "failed") return null;
  beginOperation(key);
  try {
    const id = await send();
    confirmOperation(key, id);
    return id;
  } catch (error) {
    if (isBitrixError(error) && error.uncertain) markOperationUncertain(key);
    else markOperationFailed(key);
    throw error;
  }
}

/** 1:1, entrevista de saída e outras reuniões viram evento na agenda do responsável e da pessoa (organizador: dono do webhook). */
export async function handleMeetingCreate(payload: Record<string, unknown>, ctx: EngineContext): Promise<void> {
  if (!extraEnabled("calendar", ctx.scopes)) return;
  const activity = getActivity(String(payload.activityId ?? ""));
  if (!activity || activity.calendarEventId || activity.status === "cancelled" || !activity.assigneeBitrixId) return;
  const journey = getJourney(activity.journeyId);
  if (!journey || journey.status === "cancelled" || journey.status === "completed") return;
  const start = Date.parse(activity.dueAt);
  if (Number.isNaN(start) || start < Date.now()) return;
  const person = findPerson(journey.personId);
  const attendees = [activity.assigneeBitrixId, person?.bitrixUserId].filter((id): id is string => Boolean(id));
  try {
    const id = await sendOnce(`meeting:create:${activity.id}`, () =>
      createMeeting(ctx.client, {
        ownerId: ctx.ownerId,
        name: person ? `${activity.title} · ${person.name}` : activity.title,
        description: [activity.instructions.trim(), "Agendado pelo Nexo."].filter(Boolean).join("\n\n"),
        from: activity.dueAt,
        to: formatInZone(start + MEETING_MINUTES * 60_000, ctx.timezone),
        attendees,
      }),
    );
    if (id) updateActivity(activity.id, { calendarEventId: id });
  } catch (error) {
    // Incerto: não reenviamos (evitaria evento duplicado na agenda das pessoas).
    if (isBitrixError(error) && error.uncertain) return;
    throw error;
  }
}

export async function handleFeedPost(payload: Record<string, unknown>, ctx: EngineContext): Promise<void> {
  if (!extraEnabled("feed", ctx.scopes)) return;
  const journey = getJourney(String(payload.journeyId ?? ""));
  if (!journey || journey.kind !== "onboarding" || journey.status === "cancelled") return;
  const late = daysBetween(journey.anchorDate, todayIn(ctx.timezone));
  if (late < 0) throw new RetryLater(zonedInstant(journey.anchorDate, WELCOME_POST_TIME, ctx.timezone), "Boas-vindas agendadas para o primeiro dia.");
  // "Hoje é o primeiro dia": depois do dia, a mensagem deixaria de ser verdade.
  if (late > 0) return;
  const person = findPerson(journey.personId);
  if (!person) return;
  // Nome e cargo vêm do perfil do Bitrix24 (a própria pessoa edita): sem colchetes, para não virarem marcação no post para todos.
  const name = bbText(person.name);
  const mention = person.bitrixUserId ? `[USER=${person.bitrixUserId}]${name}[/USER]` : name;
  const role = journey.personPosition ?? person.position;
  const position = role ? `, ${bbText(role)},` : "";
  const firstName = person.name.split(/\s+/)[0] ?? person.name;
  try {
    await sendOnce(`feed:post:${journey.id}`, () =>
      postToFeed(ctx.client, {
        title: `Boas-vindas, ${firstName}!`,
        message: `Hoje é o primeiro dia de ${mention}${position} na ${getCompany().name}. Deixe sua mensagem de boas-vindas!`,
      }),
    );
  } catch (error) {
    if (isBitrixError(error) && error.uncertain) return;
    throw error;
  }
}
