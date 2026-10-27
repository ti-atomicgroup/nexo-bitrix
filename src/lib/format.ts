/**
 * Formatação pt-BR: datas relativas ("amanhã", "em 7 dias"), iniciais e plural.
 * Datas de calendário chegam como `YYYY-MM-DD`; instantes como ISO 8601 com fuso.
 * Funções puras, usadas no console (cliente) e na página do colaborador (servidor).
 */
import type { JourneyKind } from "@/shared/enums";

export const DEFAULT_TIME_ZONE = "America/Sao_Paulo";
const DAY_MS = 86_400_000;
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const WALL_CLOCK = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::\d{2}(?:\.\d+)?)?([+-]\d{2}:\d{2})$/;

/* ───────────── Texto ───────────── */

export function plural(count: number, singular: string, pluralForm: string): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

export function capitalize(text: string): string {
  const [first = "", ...rest] = Array.from(text);
  return first.toLocaleUpperCase("pt-BR") + rest.join("");
}

export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const first = words[0];
  if (!first) return "?";
  const last = words.length > 1 ? words[words.length - 1] : undefined;
  const letters = [Array.from(first)[0], last ? Array.from(last)[0] : undefined].filter(Boolean).join("");
  return letters.toLocaleUpperCase("pt-BR");
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

/** "Tarefas, CRM e Usuários". */
export function listPtBr(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} e ${items[items.length - 1]}`;
}

/* ───────────── Datas de calendário ───────────── */

export function parseDateOnly(value: string): Date | null {
  const match = DATE_ONLY.exec(value.slice(0, 10));
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return Number.isNaN(date.getTime()) ? null : date;
}

export function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(dateOnly: string, days: number): string {
  const date = parseDateOnly(dateOnly);
  if (!date) return dateOnly;
  return toDateOnly(new Date(date.getTime() + days * DAY_MS));
}

/**
 * Data no fim de semana: o dia ("sábado"/"domingo") e o dia útil mais perto na direção pedida
 * (segunda seguinte para quem chega, sexta anterior para quem sai). Nulo em dia de semana. Feriados não entram.
 */
export function weekendOf(dateOnly: string, direction: "next" | "previous"): { weekday: "sábado" | "domingo"; businessDay: string } | null {
  const date = parseDateOnly(dateOnly);
  if (!date) return null;
  const day = date.getUTCDay();
  if (day !== 0 && day !== 6) return null;
  const shift = direction === "next" ? (day === 6 ? 2 : 1) : day === 6 ? -1 : -2;
  return { weekday: day === 6 ? "sábado" : "domingo", businessDay: addDays(dateOnly, shift) };
}

/** Dias de `from` até `to` (positivo se `to` vem depois). */
export function daysBetween(from: string, to: string): number {
  const a = parseDateOnly(from);
  const b = parseDateOnly(to);
  if (!a || !b) return 0;
  return Math.round((b.getTime() - a.getTime()) / DAY_MS);
}

function partsIn(date: Date, timeZone: string): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "00";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}` };
}

/** Data de hoje (`YYYY-MM-DD`) no fuso da empresa. */
export function todayIn(timeZone: string = DEFAULT_TIME_ZONE, now: Date = new Date()): string {
  try {
    return partsIn(now, timeZone).date;
  } catch {
    return partsIn(now, DEFAULT_TIME_ZONE).date;
  }
}

/**
 * Data e hora de parede de um instante. Se o ISO já traz o fuso da empresa (ex.: `-03:00`), usa o que
 * está escrito; se vier em UTC, converte para `timeZone`.
 */
export function wallClock(iso: string, timeZone: string = DEFAULT_TIME_ZONE): { date: string; time: string } | null {
  const match = WALL_CLOCK.exec(iso);
  if (match && match[3] !== "+00:00" && match[3] !== "-00:00") return { date: match[1] ?? "", time: match[2] ?? "" };
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  try {
    return partsIn(date, timeZone);
  } catch {
    return partsIn(date, DEFAULT_TIME_ZONE);
  }
}

/** "hoje", "amanhã", "ontem", "em 3 dias", "há 2 semanas", "em 3 meses". */
export function relativeDays(diff: number): string {
  if (diff === 0) return "hoje";
  if (diff === 1) return "amanhã";
  if (diff === -1) return "ontem";
  const abs = Math.abs(diff);
  let amount: string;
  if (abs < 14) amount = `${abs} dias`;
  else if (abs < 60) amount = plural(Math.round(abs / 7), "semana", "semanas");
  else amount = plural(Math.round(abs / 30), "mês", "meses");
  return diff > 0 ? `em ${amount}` : `há ${amount}`;
}

export function relativeDay(dateOnly: string, today: string): string {
  return relativeDays(daysBetween(today, dateOnly));
}

function formatUtc(dateOnly: string, options: Intl.DateTimeFormatOptions): string {
  const date = parseDateOnly(dateOnly);
  if (!date) return dateOnly;
  return new Intl.DateTimeFormat("pt-BR", { ...options, timeZone: "UTC" }).format(date);
}

/** "Segunda-feira, 26 de outubro" (ou em minúsculas, para o meio da frase). */
export function formatDateLong(dateOnly: string, { midSentence = false }: { midSentence?: boolean } = {}): string {
  const text = formatUtc(dateOnly, { weekday: "long", day: "numeric", month: "long" });
  return midSentence ? text : capitalize(text);
}

/** "26 de outubro" (com o ano se for outro ano). */
export function formatDateMedium(dateOnly: string, today?: string): string {
  const sameYear = !today || today.slice(0, 4) === dateOnly.slice(0, 4);
  return formatUtc(dateOnly, sameYear ? { day: "numeric", month: "long" } : { day: "numeric", month: "long", year: "numeric" });
}

/** "26 de out." */
export function formatDateShort(dateOnly: string): string {
  return formatUtc(dateOnly, { day: "numeric", month: "short" });
}

/** "seg." */
export function formatWeekdayShort(dateOnly: string): string {
  return formatUtc(dateOnly, { weekday: "short" });
}

export function dayOfMonth(dateOnly: string): string {
  const date = parseDateOnly(dateOnly);
  return date ? String(date.getUTCDate()) : "";
}

/* ───────────── Instantes ───────────── */

/** "agora mesmo", "há 5 min", "há 2 h", "ontem", "há 3 dias" (e "em 5 min" para o futuro). */
export function formatSince(iso: string, nowMs: number): string {
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return "";
  const diff = nowMs - at;
  const future = diff < 0;
  const minutes = Math.floor(Math.abs(diff) / 60_000);
  if (minutes < 1) return future ? "em instantes" : "agora mesmo";
  const label = (text: string) => (future ? `em ${text}` : `há ${text}`);
  if (minutes < 60) return label(`${minutes} min`);
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return label(`${hours} h`);
  const days = Math.floor(hours / 24);
  if (days === 1) return future ? "amanhã" : "ontem";
  return label(`${days} dias`);
}

/** Data de calendário de um valor que pode ser `YYYY-MM-DD` ou um instante ISO. */
export function calendarDateOf(value: string, timeZone?: string): string | null {
  if (DATE_ONLY.test(value)) return value;
  return wallClock(value, timeZone)?.date ?? null;
}

/** "hoje", "amanhã", "há 3 dias" para uma data ou instante. */
export function relativeTo(value: string, today: string, timeZone?: string): string {
  const date = calendarDateOf(value, timeZone);
  return date ? relativeDays(daysBetween(today, date)) : "";
}

/** "hoje, 18:00", "amanhã, 9:30", "em 3 dias", "27 de out." conforme a distância. */
export function formatMoment(iso: string, today: string, timeZone?: string): string {
  if (DATE_ONLY.test(iso)) {
    const diff = daysBetween(today, iso);
    return Math.abs(diff) < 14 ? relativeDays(diff) : formatDateShort(iso);
  }
  const clock = wallClock(iso, timeZone);
  if (!clock) return "";
  const diff = daysBetween(today, clock.date);
  const time = clock.time.replace(/^0(\d)/, "$1");
  if (diff >= -1 && diff <= 1) return `${relativeDays(diff)}, ${time}`;
  if (Math.abs(diff) < 14) return relativeDays(diff);
  return formatDateShort(clock.date);
}

/* ───────────── Jornadas ───────────── */

/** "Chega em 7 dias", "Chegou ontem", "Último dia amanhã", "Saiu há 2 dias". */
export function anchorPhrase(kind: JourneyKind, anchorDate: string, today: string): string {
  const diff = daysBetween(today, anchorDate);
  if (kind === "onboarding") {
    if (diff === 0) return "Chega hoje";
    return diff > 0 ? `Chega ${relativeDays(diff)}` : `Chegou ${relativeDays(diff)}`;
  }
  if (diff === 0) return "Último dia hoje";
  return diff > 0 ? `Último dia ${relativeDays(diff)}` : `Saiu ${relativeDays(diff)}`;
}

/** Rótulo curto da data-âncora: "1º dia" ou "Último dia". */
export function anchorLabel(kind: JourneyKind): string {
  return kind === "onboarding" ? "1º dia" : "Último dia";
}
