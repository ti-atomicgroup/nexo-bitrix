/** Ambiente de teste do motor: banco temporário, chave da instância, FakeBitrix como transporte e webhook gravado. */
import { vi } from "vitest";
import { resetLimiterForTests } from "@/server/bitrix/limiter";
import { getActivity, listActivities, type ActivityRow } from "@/server/db/repos/activities";
import { getJourney } from "@/server/db/repos/journeys";
import { setFeatures, setSetupStage, setWebhookRecord } from "@/server/db/repos/settings";
import { listTemplates } from "@/server/db/repos/templates";
import { runCycle, type CycleReport } from "@/server/engine/cycle";
import { prepareWorkspace } from "@/server/engine/prepare";
import { setBitrixTransportForTests } from "@/server/engine/runtime";
import { stopSchedulerForTests } from "@/server/engine/scheduler";
import type { Actor } from "@/server/engine/types";
import { encrypt, resetInstanceKeyForTests } from "@/server/security/crypto";
// Alias: não é hook do React (a regra de hooks do lint olha só o prefixo "use").
import { useTestDb as openTestDb } from "../support/db";
import { FakeBitrix } from "./fake-bitrix";

export const HR_ACTOR: Actor = { type: "user", id: "u-rh", name: "Rita RH" };

export interface EngineEnv {
  fake: FakeBitrix;
  cleanup: () => void;
}

/** Segunda-feira, 26/10/2026, 09:00 em São Paulo. */
export const MONDAY = new Date("2026-10-26T12:00:00Z");

export function setupEngine(options: { scopes?: string[]; now?: Date } = {}): EngineEnv {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(options.now ?? MONDAY);
  resetLimiterForTests();
  resetInstanceKeyForTests();
  stopSchedulerForTests();
  const db = openTestDb();
  const fake = new FakeBitrix({ scopes: options.scopes });
  fake.addUser({ id: 10, name: "Rita", lastName: "RH", position: "Business Partner" });
  fake.addUser({ id: 11, name: "Diego", lastName: "TI", position: "Suporte" });
  fake.addUser({ id: 12, name: "Ana", lastName: "Souza", position: "Analista" });
  fake.addUser({ id: 13, name: "Bruno", lastName: "Gestor", position: "Coordenador" });
  fake.addUser({ id: 14, name: "Carla", lastName: "Buddy", position: "Analista" });
  setBitrixTransportForTests(fake.asFetch());
  setWebhookRecord({
    encryptedUrl: encrypt(fake.webhookUrl()),
    portal: fake.portal,
    owner: { bitrixUserId: "1", name: "Marina RH", position: "Analista de RH" },
    scopes: fake.scopes,
    verifiedAt: new Date().toISOString(),
  });
  setFeatures({ notifications: true, calendar: true, feed: true });
  setSetupStage("prepare");
  return {
    fake,
    cleanup: () => {
      setBitrixTransportForTests(null);
      stopSchedulerForTests();
      resetLimiterForTests();
      resetInstanceKeyForTests();
      db.cleanup();
      vi.useRealTimers();
    },
  };
}

/** "Preparar o Nexo" com RH 10, TI 11 e gestor 13 como padrão. */
export async function prepare(): Promise<void> {
  await prepareWorkspace(
    { companyName: "Empresa Teste", timezone: "America/Sao_Paulo", projectName: "Nexo · Jornadas", defaults: { rh: "10", ti: "11", gestor: "13" } },
    HR_ACTOR,
  );
}

export function templateId(name: string): string {
  const found = listTemplates({ includeArchived: true }).find((template) => template.name === name);
  if (!found) throw new Error(`Trilha ${name} não existe`);
  return found.id;
}

export async function cycle(): Promise<CycleReport> {
  return runCycle();
}

export function advance(ms: number): void {
  vi.setSystemTime(new Date(Date.now() + ms));
}

export function activityByTitle(journeyId: string, title: string): ActivityRow {
  const found = listActivities(journeyId).find((activity) => activity.title === title);
  if (!found) throw new Error(`Atividade ${title} não existe`);
  return getActivity(found.id)!;
}

export function journeyStatus(id: string): string | undefined {
  return getJourney(id)?.status;
}
