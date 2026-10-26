import "server-only";
import type { SetupStateDTO, StatusDTO } from "@/shared/contracts";
import { getSetupStage, getWebhookRecord } from "../db/repos/settings";
import { buildInfo } from "../runtime/build-info";
import { scopeCheck } from "./scopes";

/** Etapa da instalação e a conexão já gravada (nunca o URL do webhook). */
export function setupState(): SetupStateDTO {
  const webhook = getWebhookRecord();
  return {
    stage: getSetupStage(),
    portal: webhook?.portal ?? null,
    webhookOwner: webhook?.owner ?? null,
    scopes: webhook ? scopeCheck(webhook.scopes) : null,
  };
}

/** Resposta pública de /api/status: só a etapa e a versão. */
export function publicStatus(): StatusDTO {
  const { version, commit } = buildInfo();
  return { setup: getSetupStage(), version, commit };
}
