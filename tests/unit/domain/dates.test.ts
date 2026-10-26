import { describe, expect, it } from "vitest";
import {
  addBusinessDays,
  addCalendarDays,
  daysUntil,
  dueAt,
  formatDateBr,
  formatDateTimeBr,
  formatInZone,
  isRealDate,
  isValidTimezone,
  localDateOf,
  todayIn,
} from "@/server/domain/dates";

const SP = "America/Sao_Paulo";

describe("datas de calendário", () => {
  it("reconhece datas reais", () => {
    expect(isRealDate("2026-10-27")).toBe(true);
    expect(isRealDate("2026-02-30")).toBe(false);
    expect(isRealDate("27/10/2026")).toBe(false);
  });

  it("soma dias corridos nos dois sentidos", () => {
    expect(addCalendarDays("2026-10-30", 3)).toBe("2026-11-02");
    expect(addCalendarDays("2026-11-02", -3)).toBe("2026-10-30");
  });

  it("soma dias úteis pulando sábado e domingo", () => {
    // 30/10/2026 é sexta-feira.
    expect(addBusinessDays("2026-10-30", 1)).toBe("2026-11-02");
    expect(addBusinessDays("2026-10-30", 0)).toBe("2026-10-30");
    // 02/11/2026 é segunda: 3 dias úteis antes é a quarta 28/10.
    expect(addBusinessDays("2026-11-02", -3)).toBe("2026-10-28");
    expect(addBusinessDays("2026-11-02", -1)).toBe("2026-10-30");
  });
});

describe("dueAt", () => {
  it("devolve horário local com o deslocamento do fuso, sem milissegundos nem Z", () => {
    expect(dueAt("2026-10-27", 0, "calendar", "18:00", SP)).toBe("2026-10-27T18:00:00-03:00");
  });

  it("aplica deslocamento negativo em dias úteis", () => {
    expect(dueAt("2026-11-02", -3, "business", "18:00", SP)).toBe("2026-10-28T18:00:00-03:00");
  });

  it("aplica deslocamento em dias corridos", () => {
    expect(dueAt("2026-10-26", 30, "calendar", "10:00", SP)).toBe("2026-11-25T10:00:00-03:00");
    expect(dueAt("2026-10-26", -10, "calendar", "09:30", SP)).toBe("2026-10-16T09:30:00-03:00");
  });

  it("respeita o horário de verão de outros fusos", () => {
    expect(dueAt("2026-10-30", 0, "calendar", "09:00", "America/New_York")).toBe("2026-10-30T09:00:00-04:00");
    expect(dueAt("2026-11-02", 0, "calendar", "09:00", "America/New_York")).toBe("2026-11-02T09:00:00-05:00");
    expect(dueAt("2026-10-27", 0, "calendar", "18:00", "UTC")).toBe("2026-10-27T18:00:00+00:00");
  });

  it("usa São Paulo quando o fuso é inválido", () => {
    expect(isValidTimezone("Lua/Base")).toBe(false);
    expect(dueAt("2026-10-27", 0, "calendar", "18:00", "Lua/Base")).toBe("2026-10-27T18:00:00-03:00");
  });

  it("recusa datas e horários inválidos com mensagem em português", () => {
    expect(() => dueAt("2026-13-01", 0, "calendar", "18:00", SP)).toThrow(/data válida/);
    expect(() => dueAt("2026-10-27", 0, "calendar", "25:00", SP)).toThrow(/horário/);
  });
});

describe("hoje e contagem de dias", () => {
  it("calcula a data de hoje no fuso da empresa", () => {
    // 02:30 UTC de 27/10 ainda é 26/10 em São Paulo.
    const now = new Date("2026-10-27T02:30:00Z");
    expect(todayIn(SP, now)).toBe("2026-10-26");
    expect(todayIn("UTC", now)).toBe("2026-10-27");
  });

  it("conta dias até a data (negativo quando já passou)", () => {
    const now = new Date("2026-10-26T15:00:00Z");
    expect(daysUntil("2026-10-26", SP, now)).toBe(0);
    expect(daysUntil("2026-11-02", SP, now)).toBe(7);
    expect(daysUntil("2026-10-20", SP, now)).toBe(-6);
  });

  it("formata instantes e datas para o Brasil", () => {
    expect(formatInZone(Date.parse("2026-10-27T21:00:00.123Z"), SP)).toBe("2026-10-27T18:00:00-03:00");
    expect(localDateOf("2026-10-27T01:00:00Z", SP)).toBe("2026-10-26");
    expect(formatDateBr("2026-10-27")).toBe("27/10/2026");
    expect(formatDateTimeBr("2026-10-27T18:00:00-03:00", SP)).toBe("27/10/2026 às 18:00");
  });
});
