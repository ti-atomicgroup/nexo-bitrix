import "server-only";
import type { OffsetUnit } from "@/shared/enums";
import { AppError } from "../errors";

export const DEFAULT_TIMEZONE = "America/Sao_Paulo";
const DAY_MS = 86_400_000;
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

const formatters = new Map<string, Intl.DateTimeFormat>();

function createFormatter(timezone: string): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
}

export function isValidTimezone(timezone: string): boolean {
  try {
    createFormatter(timezone);
    return true;
  } catch {
    return false;
  }
}

/** Fuso inválido (configuração antiga ou digitada errada) cai em São Paulo em vez de derrubar a tela. */
function formatterFor(timezone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timezone);
  if (!formatter) {
    formatter = isValidTimezone(timezone) ? createFormatter(timezone) : createFormatter(DEFAULT_TIMEZONE);
    formatters.set(timezone, formatter);
  }
  return formatter;
}

/** Relógio de parede do instante no fuso, expresso como se fosse UTC (precisão de segundos). */
function wallClock(instant: number, timezone: string): number {
  const parts = new Map<string, number>();
  for (const part of formatterFor(timezone).formatToParts(new Date(instant))) {
    if (part.type !== "literal") parts.set(part.type, Number(part.value));
  }
  const get = (key: string) => parts.get(key) ?? 0;
  const hour = get("hour") === 24 ? 0 : get("hour");
  return Date.UTC(get("year"), get("month") - 1, get("day"), hour, get("minute"), get("second"));
}

export function isRealDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(`${value}T00:00:00Z`);
  return !Number.isNaN(time) && new Date(time).toISOString().slice(0, 10) === value;
}

function dateToUtc(value: string): number {
  if (!isRealDate(value)) throw new AppError("DATE_INVALID", "Use uma data válida no formato AAAA-MM-DD.");
  return Date.parse(`${value}T00:00:00Z`);
}

const utcToDate = (time: number): string => new Date(time).toISOString().slice(0, 10);

export function addCalendarDays(date: string, days: number): string {
  return utcToDate(dateToUtc(date) + days * DAY_MS);
}

/** Dias úteis = segunda a sexta (feriados ainda não). Deslocamento zero mantém a própria data. */
export function addBusinessDays(date: string, days: number): string {
  let time = dateToUtc(date);
  const step = Math.sign(days);
  let remaining = Math.abs(days);
  while (remaining > 0) {
    time += step * DAY_MS;
    const weekday = new Date(time).getUTCDay();
    if (weekday !== 0 && weekday !== 6) remaining--;
  }
  return utcToDate(time);
}

export function shiftDate(date: string, offsetDays: number, unit: OffsetUnit): string {
  return unit === "business" ? addBusinessDays(date, offsetDays) : addCalendarDays(date, offsetDays);
}

/** Instante (ms) do horário local `time` na data `date`, no fuso. */
export function zonedInstant(date: string, time: string, timezone: string): number {
  const match = TIME_PATTERN.exec(time);
  if (!match) throw new AppError("TIME_INVALID", "Use um horário no formato HH:MM.");
  const target = dateToUtc(date) + (Number(match[1]) * 60 + Number(match[2])) * 60_000;
  let instant = target;
  // Converge em até 2 passos; o laço extra cobre transições de horário de verão.
  for (let step = 0; step < 4; step++) {
    const difference = target - wallClock(instant, timezone);
    if (difference === 0) break;
    instant += difference;
  }
  return instant;
}

const pad = (value: number) => String(value).padStart(2, "0");

/** ISO 8601 com o deslocamento do fuso, sem milissegundos (ex.: 2026-10-27T18:00:00-03:00). */
export function formatInZone(instant: number, timezone: string): string {
  const base = Math.floor(instant / 1000) * 1000;
  const wall = wallClock(base, timezone);
  const offsetMinutes = Math.round((wall - base) / 60_000);
  const sign = offsetMinutes < 0 ? "-" : "+";
  const absolute = Math.abs(offsetMinutes);
  return `${new Date(wall).toISOString().slice(0, 19)}${sign}${pad(Math.floor(absolute / 60))}:${pad(absolute % 60)}`;
}

export function dueAt(anchorDate: string, offsetDays: number, unit: OffsetUnit, time: string, timezone: string): string {
  return formatInZone(zonedInstant(shiftDate(anchorDate, offsetDays, unit), time, timezone), timezone);
}

export function todayIn(timezone: string, now: Date = new Date()): string {
  return utcToDate(wallClock(now.getTime(), timezone));
}

/** Data local (AAAA-MM-DD) de um instante ISO no fuso. */
export function localDateOf(iso: string, timezone: string): string {
  return utcToDate(wallClock(Date.parse(iso), timezone));
}

export function daysUntil(date: string, timezone: string, now: Date = new Date()): number {
  return Math.round((dateToUtc(date) - dateToUtc(todayIn(timezone, now))) / DAY_MS);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((dateToUtc(to) - dateToUtc(from)) / DAY_MS);
}

export function formatDateBr(date: string): string {
  const [year, month, day] = date.split("-");
  return `${day}/${month}/${year}`;
}

export function formatDateTimeBr(iso: string, timezone: string): string {
  const wall = new Date(wallClock(Date.parse(iso), timezone)).toISOString();
  return `${formatDateBr(wall.slice(0, 10))} às ${wall.slice(11, 16)}`;
}
