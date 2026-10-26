import "server-only";

/** Datas no fuso da empresa para rótulos relativos ("Hoje, 15:00", "Ontem", "Há 3 dias", "26/10"). */
const FALLBACK_TIMEZONE = "America/Sao_Paulo";
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  const cached = formatters.get(timeZone);
  if (cached) return cached;
  let created: Intl.DateTimeFormat;
  try {
    created = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  } catch {
    // Fuso inválido gravado por engano: melhor um rótulo no fuso padrão do que uma tela quebrada.
    return timeZone === FALLBACK_TIMEZONE ? new Intl.DateTimeFormat("en-CA") : formatter(FALLBACK_TIMEZONE);
  }
  formatters.set(timeZone, created);
  return created;
}

/** Data (AAAA-MM-DD) e hora (HH:MM) locais de um instante. */
export function localParts(instant: Date, timeZone: string): { date: string; time: string } {
  const parts = formatter(timeZone).formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "00";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}` };
}

export function localDate(iso: string, timeZone: string): string | null {
  const instant = new Date(iso);
  return Number.isNaN(instant.getTime()) ? null : localParts(instant, timeZone).date;
}

/** Dias de calendário de `from` até `to` (AAAA-MM-DD). */
export function dayDiff(from: string, to: string): number {
  const toUtc = (value: string) => {
    const [year = 0, month = 1, day = 1] = value.split("-").map(Number);
    return Date.UTC(year, month - 1, day);
  };
  return Math.round((toUtc(to) - toUtc(from)) / 86_400_000);
}

export function relativeWhen(iso: string, timeZone: string, now: Date): string {
  const instant = new Date(iso);
  if (Number.isNaN(instant.getTime())) return "";
  const target = localParts(instant, timeZone);
  const diff = dayDiff(localParts(now, timeZone).date, target.date);
  if (diff === 0) return `Hoje, ${target.time}`;
  if (diff === -1) return "Ontem";
  if (diff < -1 && diff >= -6) return `Há ${-diff} dias`;
  if (diff === 1) return `Amanhã, ${target.time}`;
  const [, month, day] = target.date.split("-");
  return `${day}/${month}`;
}
