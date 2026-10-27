import { describe, expect, it } from "vitest";
import { weekendOf } from "@/lib/format";

describe("weekendOf", () => {
  it("aponta sábado e domingo e sugere o dia útil mais perto na direção certa", () => {
    expect(weekendOf("2026-11-01", "next")).toEqual({ weekday: "domingo", businessDay: "2026-11-02" });
    expect(weekendOf("2026-10-31", "next")).toEqual({ weekday: "sábado", businessDay: "2026-11-02" });
    expect(weekendOf("2026-11-01", "previous")).toEqual({ weekday: "domingo", businessDay: "2026-10-30" });
    expect(weekendOf("2026-10-31", "previous")).toEqual({ weekday: "sábado", businessDay: "2026-10-30" });
  });

  it("dia de semana ou data inválida: nada a avisar", () => {
    expect(weekendOf("2026-11-02", "next")).toBeNull();
    expect(weekendOf("2026-10-30", "previous")).toBeNull();
    expect(weekendOf("", "next")).toBeNull();
  });
});
