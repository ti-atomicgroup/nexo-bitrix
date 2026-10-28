import "server-only";
import type { SettingsDTO, UserRef } from "@/shared/contracts";
import { PARTICIPANT_ROLES, type ParticipantRole } from "@/shared/enums";
import type { SettingsInput } from "@/shared/schemas";
import { maskWebhookUrl, resendDocuments, verifyWebhook, type Actor } from "@/server/engine";
import { getDb } from "../db";
import { findPersonByBitrixId } from "../db/repos/people";
import {
  getCompany,
  getContent,
  getDefaults,
  getFeatures,
  getProject,
  getWebhookRecord,
  setCompany,
  setContent,
  setDefaults,
  setFeatures,
  setWebhookRecord,
  type WebhookRecord,
} from "../db/repos/settings";
import { AppError } from "../errors";
import { decrypt } from "../security/crypto";
import { auditAs } from "./audit";
import { portalHost, portalOrigin } from "./bitrix-links";
import { assertRequiredScopes, scopeCheck } from "./scopes";

/**
 * O URL do webhook só é decifrado aqui para gerar a versão mascarada; se a máscara falhar ou ainda contiver
 * o segredo, a tela recebe uma máscara genérica do portal.
 */
function maskedWebhook(record: WebhookRecord): string {
  const fallback = `${portalOrigin(record.portal) ?? "https://bitrix24"}/rest/••/••••••/`;
  try {
    const url = decrypt(record.encryptedUrl);
    const secret = /\/rest\/\d+\/([^/?#\s]+)/.exec(url)?.[1];
    const masked = maskWebhookUrl(url);
    return secret && !masked.includes(secret) ? masked : fallback;
  } catch {
    return fallback;
  }
}

export function getSettings(): SettingsDTO {
  const webhook = getWebhookRecord();
  const company = getCompany();
  const project = getProject();
  const features = getFeatures();
  return {
    company: { name: company.name, timezone: company.timezone },
    portal: webhook?.portal ?? null,
    webhook: webhook ? { masked: maskedWebhook(webhook), owner: webhook.owner, scopes: scopeCheck(webhook.scopes), verifiedAt: webhook.verifiedAt } : null,
    project: project ? { id: project.id, name: project.name, url: project.url } : null,
    defaults: getDefaults(),
    content: getContent(),
    features: { notifications: features.notifications, calendar: features.calendar, feed: features.feed },
    documentsEnabled: webhook ? scopeCheck(webhook.scopes).optional.disk : false,
    invitesEnabled: webhook ? webhook.scopes.includes("user") : false,
  };
}

function assertTimezone(timezone: string): void {
  try {
    Intl.DateTimeFormat("pt-BR", { timeZone: timezone }).format(0);
  } catch {
    throw new AppError("INVALID_INPUT", "Escolha um fuso horário válido (ex.: America/Sao_Paulo).", 400, { field: "company.timezone" });
  }
}

/** Responsáveis padrão: ids do Bitrix viram `UserRef` pelo cache de pessoas; null remove o padrão. */
function resolveDefaults(input: NonNullable<SettingsInput["defaults"]>): Partial<Record<ParticipantRole, UserRef>> {
  const next: Partial<Record<ParticipantRole, UserRef>> = { ...getDefaults() };
  for (const role of PARTICIPANT_ROLES) {
    if (!(role in input)) continue;
    const bitrixUserId = input[role];
    if (!bitrixUserId) {
      delete next[role];
      continue;
    }
    const person = findPersonByBitrixId(bitrixUserId);
    if (!person) throw new AppError("PERSON_NOT_FOUND", "Atualize a lista de pessoas e escolha de novo.", 400, { field: `defaults.${role}` });
    next[role] = { bitrixUserId, name: person.name, position: person.position };
  }
  return next;
}

export function updateSettings(input: SettingsInput, actor: Actor): SettingsDTO {
  getDb().tx(() => {
    const changed: string[] = [];
    if (input.company) {
      assertTimezone(input.company.timezone);
      setCompany({ name: input.company.name, timezone: input.company.timezone });
      changed.push("empresa");
    }
    if (input.defaults) {
      setDefaults(resolveDefaults(input.defaults));
      changed.push("responsáveis padrão");
    }
    if (input.content) {
      setContent(input.content);
      changed.push("conteúdo do colaborador");
    }
    if (input.features) {
      const current = getFeatures();
      setFeatures({
        notifications: input.features.notifications ?? current.notifications,
        calendar: input.features.calendar ?? current.calendar,
        feed: input.features.feed ?? current.feed,
      });
      changed.push("recursos opcionais");
    }
    if (changed.length) auditAs(actor, "Ajustes atualizados", "settings", null, changed.join(", "));
  });
  return getSettings();
}

/** Troca o webhook mantendo o mesmo portal (as tarefas e o projeto já criados continuam valendo). */
export async function replaceWebhook(url: string, actor: Actor): Promise<SettingsDTO> {
  const check = await verifyWebhook(url);
  assertRequiredScopes(scopeCheck(check.scopes), { portal: check.portal, owner: check.owner });
  const current = getWebhookRecord();
  if (current && portalHost(current.portal) !== portalHost(check.portal)) {
    throw new AppError("PORTAL_MISMATCH", `Use um webhook do mesmo portal (${current.portal}).`, 409);
  }
  setWebhookRecord({ encryptedUrl: check.encryptedUrl, portal: check.portal, owner: check.owner, scopes: check.scopes, verifiedAt: new Date().toISOString() });
  auditAs(actor, "Webhook do Bitrix24 trocado", "settings", null, `Conta ${check.owner.name}`);
  // Ex.: a permissão Drive acabou de ser marcada: os documentos que esperavam por ela seguem para o Bitrix.
  resendDocuments();
  return getSettings();
}
