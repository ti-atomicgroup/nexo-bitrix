import { describe, expect, it } from "vitest";
import { validateEnvironment, portalFromDomain, encrypt, decrypt, safeEqual } from "../../src/server/security";
import { deadlineAt, taskStatus, canCompleteJourney, summarizeJourney } from "../../src/server/domain";
import { templateSchema, createJourneySchema } from "../../src/server/validation";
import type { Journey, JourneyTask } from "../../src/shared/contracts";

const env = { NEXO_ENCRYPTION_KEY: "ab".repeat(32), NEXO_SETUP_TOKEN: "setup-secret-long-enough", NEXO_APP_URL: "https://nexo.example.com", BITRIX_PORTAL_URL: "https://acme.bitrix24.com", NEXO_DATA_DIR: "./data" };
export function task(overrides: Partial<JourneyTask> = {}): JourneyTask {
  return { id: "t1", journeyId: "j1", title: "Acesso", description: "", stageTitle: "Preparar", stageId: "setup", stageOrder: 0, releaseState: "released", assigneeRole: "ti", assignee: null, dueAt: "2026-10-22T20:59:00.000Z", required: true, critical: true, visibility: "team", bitrixTaskId: "99", bitrixUrl: null, bitrixStageId: null, bitrixStageTitle: null, remoteDeleted: false, status: "pending", syncState: "synced", checklist: [], documents: [], ...overrides };
}
export function journey(tasks: JourneyTask[]): Journey {
  return { id: "j1", type: "onboarding", employee: { id: "3", name: "Ana", position: "", department: "", active: true }, person: { bitrixUserId: "3", name: "Ana", position: "", department: "", active: true }, origin: null, stages: [{ id: "setup", title: "Preparar", order: 0, release: { mode: "immediate", offsetDays: 0, offsetUnit: "calendar_days" }, state: "released", releasedAt: "2026-10-22T00:00:00Z" }], templateId: "m1", templateName: "Modelo", templateVersion: 1, templateProfile: "Geral", referenceDate: "2026-10-22", status: "active", source: "manual", sourceItemId: 100, sourceUrl: null, createdAt: "2026-10-22T00:00:00Z", completedAt: null, progress: 0, taskCount: tasks.length, completedCount: 0, radar: "unknown", tasks };
}
describe("configuração e fronteira de confiança", () => {
  it("não gera segredos nem aceita portal arbitrário/SSRF", () => {
    expect(() => validateEnvironment({})).toThrow();
    for (const url of ["http://acme.bitrix24.com", "https://localhost", "https://127.0.0.1", "https://acme.bitrix24.com@evil.test", "https://acme.bitrix24.com/rest/a"]) {
      expect(() => validateEnvironment({ ...env, BITRIX_PORTAL_URL: url })).toThrow();
    }
    const config = validateEnvironment(env);
    expect(portalFromDomain("acme.bitrix24.com", config)).toBe("https://acme.bitrix24.com");
    expect(() => portalFromDomain("evil.bitrix24.com", config)).toThrow();
  });
  it("cifra credenciais com integridade e rejeita chave diferente", () => {
    const encrypted = encrypt("oauth-private", env.NEXO_ENCRYPTION_KEY);
    expect(encrypted).not.toContain("oauth-private");
    expect(decrypt(encrypted, env.NEXO_ENCRYPTION_KEY)).toBe("oauth-private");
    expect(() => decrypt(encrypted, "cd".repeat(32))).toThrow();
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });
});
describe("regras de jornada", () => {
  it("calcula o deadline em calendário local, inclusive em mudança de horário de verão", () => {
    expect(deadlineAt("2026-10-22", 0, "America/Sao_Paulo")).toBe("2026-10-22T21:00:00.000Z");
    expect(deadlineAt("2026-03-07", 1, "America/New_York")).toBe("2026-03-08T22:00:00.000Z");
    expect(() => deadlineAt("2026-02-30", 0, "America/Sao_Paulo")).toThrow();
  });
  it("status 4 do Bitrix aguarda revisão e bloqueia conclusão", () => {
    expect(taskStatus(4)).toBe("awaiting_review");
    expect(canCompleteJourney(journey([task({ status: "awaiting_review" })]))).toBe(false);
    expect(canCompleteJourney(journey([task({ status: "completed", checklist: [{ id: "c1", title: "Revogar", required: true, completed: false }] })]))).toBe(false);
    expect(canCompleteJourney(journey([task({ status: "completed" })]))).toBe(true);
  });
  it("não contabiliza tarefa incerta como completa e prioriza bloqueio crítico", () => {
    const result = summarizeJourney(journey([task({ status: "completed", syncState: "uncertain" })]), new Date("2026-10-23T00:00:00Z"));
    expect(result.completedCount).toBe(0);
    expect(result.progress).toBe(0);
    expect(result.radar).toBe("unknown");
  });
  it("valida documentos HTTPS e datas reais antes de persistir", () => {
    expect(createJourneySchema.safeParse({ requestId: "abcdefghi", type: "onboarding", templateId: "m1", employeeId: "1", referenceDate: "2026-02-30", assignees: {} }).success).toBe(false);
    expect(templateSchema.safeParse({ id: "m1", name: "Modelo", description: "", type: "onboarding", version: 1, stages: [{ id: "s1", title: "Início", activities: [{ id: "a1", title: "Acesso", description: "", assigneeRole: "ti", offsetDays: 0, required: true, critical: false, visibility: "team", checklist: [], documents: [{ id: "d1", title: "Documento", url: "javascript:alert(1)" }] }] }] }).success).toBe(false);
  });
});
