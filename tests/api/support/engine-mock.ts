import { vi } from "vitest";
import type * as Engine from "@/server/engine";

/**
 * Substituto do contrato do motor (`@/server/engine`) para os testes da plataforma não dependerem do E1.
 * Uso: `vi.mock("@/server/engine", async () => (await import("../support/engine-mock")).engineMock());`
 */
export function engineMock(): typeof Engine {
  return {
    verifyWebhook: vi.fn(async () => {
      throw new Error("verifyWebhook não configurado no teste");
    }),
    maskWebhookUrl: vi.fn((url: string) => url.replace(/\/rest\/(\d+)\/[^/]+/, "/rest/$1/••••••")),
    prepareWorkspace: vi.fn(async () => undefined),
    refreshPeople: vi.fn(async () => 0),
    previewJourney: vi.fn(() => ({ activityCount: 0, spanDays: 0, firstDueAt: null, lastDueAt: null, byRole: {}, releasedNow: 0, missingAssignees: [] })),
    createJourney: vi.fn(() => ({ id: "journey-from-engine" })),
    applyJourneyAction: vi.fn(),
    linkJourneyPerson: vi.fn(),
    applyActivityAction: vi.fn(),
    markDoneFromLink: vi.fn(() => ({ ok: true, message: "Feito." })),
    documentsEnabled: vi.fn(() => false),
    receiveDocument: vi.fn(() => {
      throw new Error("receiveDocument não configurado no teste");
    }),
    resendDocuments: vi.fn(() => 0),
    addManualLedgerItem: vi.fn(() => {
      throw new Error("addManualLedgerItem não configurado no teste");
    }),
    waiveLedgerItem: vi.fn(() => {
      throw new Error("waiveLedgerItem não configurado no teste");
    }),
    listCrmSources: vi.fn(async () => []),
    currentStageHistoryCursor: vi.fn(async () => 100),
    starterTemplates: vi.fn(() => []),
    activityLibrary: vi.fn(() => []),
    startScheduler: vi.fn(),
    kick: vi.fn(),
    ensureScheduler: vi.fn(),
    schedulerStatus: vi.fn(() => ({ running: true, lastCycleAt: null, lastCycleMs: null, lastError: null, nextCycleAt: null })),
    bitrixRateLimitedUntil: vi.fn(() => null),
  };
}
