import { describe, expect, it } from "vitest";
import { activityTiming, profileSuffix } from "@/features/journeys/labels";
import type { ActivityDTO } from "@/shared/contracts";

describe("profileSuffix", () => {
  it("esconde o perfil que o nome da trilha já diz", () => {
    expect(profileSuffix("Onboarding · Vendas", "Vendas")).toBeNull();
    expect(profileSuffix("Onboarding · Tecnologia", "tecnologia")).toBeNull();
    expect(profileSuffix("Desligamento · Voluntário", "Geral")).toBe("Geral");
    expect(profileSuffix("Onboarding", "")).toBeNull();
  });
});

describe("activityTiming de atividade bloqueada", () => {
  const locked = { status: "locked", releasesAt: "2026-11-05T08:00:00-03:00" } as ActivityDTO;

  it("diz que libera depois da etapa anterior ou na data-limite", () => {
    expect(activityTiming({ ...locked, releaseMode: "after_previous" }, "2026-11-02", "America/Sao_Paulo")).toBe("Libera depois da etapa anterior ou em 3 dias");
    expect(activityTiming({ ...locked, releaseMode: "offset" }, "2026-11-02", "America/Sao_Paulo")).toBe("Libera em 3 dias");
    expect(activityTiming({ ...locked, releasesAt: null, releaseMode: "after_previous" }, "2026-11-02")).toBe("Libera depois da etapa anterior");
  });
});
