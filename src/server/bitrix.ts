import { z } from "zod";
import type { BitrixUser, DiscoveryOption, TriggerSource, TriggerSourceDiscovery } from "../shared/contracts";
import { AppError, BitrixError } from "./errors";
import { record, text, webhookConfigurationSchema } from "./models";
import { decrypt, encrypt, parseIncomingWebhookUrl, type Environment } from "./security";
import { Store } from "./store";

const envelope = z.object({ result: z.unknown().optional(), error: z.string().optional(), error_description: z.string().optional(), next: z.number().optional() });
const throttleSchema = z.object({ until: z.number(), attempts: z.number() });

export class BitrixClient {
  constructor(readonly store: Store, readonly env: Environment, private readonly transport: typeof fetch = fetch) {
    this.refreshConfiguration();
  }
  refreshConfiguration(): void {
    const existing = this.store.get("webhook", "incoming", webhookConfigurationSchema);
    if (existing) {
      const portal = parseIncomingWebhookUrl(decrypt(existing.url, this.env.encryptionKey), this.env);
      this.env.portalUrl = portal.portalUrl;
      this.env.portalDomain = portal.portalDomain;
    }
  }

  async testWebhook(url: string): Promise<{ userId: string; userName: string; scopes: string[] }> {
    const parsed = parseIncomingWebhookUrl(url, this.env);
    const user = parseUser((await this.webhookRequest(parsed, "profile", {})).result);
    const scopes = z.array(z.string()).parse((await this.webhookRequest(parsed, "scope", {})).result);
    if (!user.active) throw new AppError("WEBHOOK_USER_INACTIVE", "A conta que criou o webhook está inativa.", 403);
    return { userId: user.id, userName: user.name, scopes };
  }

  configureWebhook(url: string, serviceUserId: string): void {
    const parsed = parseIncomingWebhookUrl(url, this.env);
    if (parsed.userId !== serviceUserId) throw new AppError("WEBHOOK_USER_MISMATCH", "O ID da conta não corresponde à URL do webhook.", 400);
    this.store.put("webhook", "incoming", { url: encrypt(url, this.env.encryptionKey), serviceUserId, verifiedAt: new Date().toISOString() });
    this.env.portalUrl = parsed.portalUrl;
    this.env.portalDomain = parsed.portalDomain;
  }

  private async webhookRequest(webhook: { userId: string; secret: string; portalUrl: string }, method: string, params: Record<string, unknown>): Promise<{ result: unknown; next?: number }> {
    if (!/^[a-z][a-z0-9._]*$/i.test(method)) throw new AppError("METHOD_INVALID", "Método Bitrix inválido.");
    const throttle = this.store.get("throttle", "portal", throttleSchema);
    if (throttle && throttle.until > Date.now()) throw new BitrixError("RATE_LIMIT", true);
    let response: Response;
    try {
      response = await this.transport(`${webhook.portalUrl}/rest/${webhook.userId}/${webhook.secret}/${method}.json`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(params), signal: AbortSignal.timeout(20000), redirect: "error",
      });
    } catch { throw new BitrixError("TRANSPORT_UNCERTAIN", true, true); }
    if (response.status === 429) this.rateLimit(response.headers.get("Retry-After"));
    let payload: unknown;
    try { payload = JSON.parse(await response.text()); }
    catch { throw new BitrixError(response.ok ? "RESPONSE_INVALID" : `HTTP_${response.status}`, response.status >= 500, true); }
    const parsed = envelope.safeParse(payload);
    if (!parsed.success) throw new BitrixError(response.ok ? "RESPONSE_INVALID" : `HTTP_${response.status}`, response.status >= 500, true);
    if (parsed.data.error === "QUERY_LIMIT_EXCEEDED") this.rateLimit(null);
    if (parsed.data.error) throw new BitrixError(parsed.data.error, response.status >= 500, response.status >= 500);
    if (!response.ok) throw new BitrixError(`HTTP_${response.status}`, response.status >= 500, response.status >= 500);
    if (parsed.data.result === undefined) throw new BitrixError("RESPONSE_EMPTY", false, true);
    return parsed.data as { result: unknown; next?: number };
  }

  private async configuredWebhookRequest(method: string, params: Record<string, unknown>) {
    const config = this.store.get("webhook", "incoming", webhookConfigurationSchema);
    if (!config) throw new BitrixError("WEBHOOK_NOT_CONFIGURED");
    const webhook = parseIncomingWebhookUrl(decrypt(config.url, this.env.encryptionKey), this.env);
    return this.webhookRequest(webhook, method, params);
  }

  async call(_userId: string, method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    return (await this.configuredWebhookRequest(method, params)).result;
  }

  async list(_userId: string, method: string, params: Record<string, unknown>, field?: string): Promise<unknown[]> {
    const all: unknown[] = [];
    let start = 0;
    for (let page = 0; page < 200; page++) {
      const response = await this.configuredWebhookRequest(method, { ...params, start });
      const values = field ? record(response.result)[field] : response.result;
      all.push(...z.array(z.unknown()).parse(values));
      if (response.next === undefined) return all;
      start = response.next;
    }
    throw new AppError("PAGINATION_LIMIT", "Há mais registros que o limite de sincronização. Refine a configuração.", 422);
  }

  async user(_userId: string, target: string): Promise<BitrixUser> {
    const result = z.array(z.unknown()).parse(await this.call("service", "user.get", { ID: target }));
    const raw = result[0];
    if (!raw) throw new AppError("USER_UNAVAILABLE", "Usuário não está disponível para esta conta.", 403);
    return parseUser(raw);
  }

  async discoverTriggerSources(userId: string): Promise<TriggerSourceDiscovery[]> {
    const readFields = async (entityTypeId: number): Promise<DiscoveryOption[]> => {
      const response = record(await this.call(userId, "crm.item.fields", { entityTypeId, useOriginalUfNames: "N" }));
      return Object.entries(record(response.fields)).map(([id, value]) => {
        const field = record(value);
        return { id, name: typeof field.title === "string" ? field.title : id, type: typeof field.type === "string" ? field.type : "unknown" };
      });
    };
    const readStages = async (entityId: string): Promise<DiscoveryOption[]> =>
      (await this.list(userId, "crm.status.list", { filter: { ENTITY_ID: entityId } })).map(value => {
        const stage = record(value);
        return { id: text(stage.STATUS_ID), name: text(stage.NAME), type: "stage" };
      });
    const readCategories = async (entityTypeId: number) =>
      (await this.list(userId, "crm.category.list", { entityTypeId }, "categories")).map(value => {
        const category = record(value);
        return { id: text(category.id), name: text(category.name) };
      });

    const results: TriggerSourceDiscovery[] = [];
    for (const standard of [{ kind: "crm_lead" as const, entityTypeId: 1, name: "Leads", stageEntityId: "STATUS" }, { kind: "crm_deal" as const, entityTypeId: 2, name: "Negócios", stageEntityId: "DEAL_STAGE" }]) {
      const categories = standard.kind === "crm_lead" ? [{ id: null, name: "Leads", stages: await readStages(standard.stageEntityId) }] : await Promise.all((await readCategories(standard.entityTypeId)).map(async category => ({ ...category, stages: await readStages(category.id === "0" ? standard.stageEntityId : `${standard.stageEntityId}_${category.id}`) })));
      results.push({ ...standard, fields: await readFields(standard.entityTypeId), categories });
    }
    const types = (await this.list(userId, "crm.type.list", {}, "types")).map(record);
    for (const type of types) {
      const entityTypeId = Number(type.entityTypeId);
      if (!Number.isSafeInteger(entityTypeId) || entityTypeId <= 0) continue;
      const categories = await readCategories(entityTypeId);
      results.push({ kind: "smart_process", entityTypeId, name: text(type.title), fields: await readFields(entityTypeId), categories: await Promise.all(categories.map(async category => ({ ...category, stages: await readStages(`DYNAMIC_${entityTypeId}_STAGE_${category.id}`) }))) });
    }
    return results;
  }

  async getTriggerSource(_userId: string, source: TriggerSource, itemId: number): Promise<Record<string, unknown>> {
    const response = record(await this.call("service", "crm.item.get", { entityTypeId: source.entityTypeId, id: itemId }));
    const item = record(response.item);
    if (text(item.id) !== String(itemId)) throw new AppError("SOURCE_MISMATCH", "O Bitrix24 não confirmou o registro de origem solicitado.", 403);
    if (source.categoryId !== null && Number(item.categoryId) !== source.categoryId) throw new AppError("SOURCE_CATEGORY", "O registro não pertence ao funil configurado.", 409);
    return item;
  }

  async createRhProject(name: string, userId: string): Promise<{ id: string; name: string; url: string }> {
    const result = await this.call(userId, "sonet_group.create", { NAME: name, DESCRIPTION: "Quadro privado de tarefas dos processos de Pessoas geridos pelo Nexo.", PROJECT: "Y", VISIBLE: "N", OPENED: "N", INITIATE_PERMS: "A" });
    const id = text(result);
    return { id, name, url: `${this.env.portalUrl}/workgroups/group/${id}/` };
  }

  private rateLimit(retryAfter: string | null): never {
    const previous = this.store.get("throttle", "portal", throttleSchema);
    const attempts = previous && previous.until > Date.now() - 600000 ? previous.attempts + 1 : 1;
    const serverDelay = retryAfter && /^\d+$/.test(retryAfter) ? Number(retryAfter) * 1000 : 0;
    const delay = Math.min(3600000, Math.max(serverDelay, 30000 * 2 ** Math.min(attempts - 1, 7)));
    this.store.put("throttle", "portal", { until: Date.now() + delay, attempts });
    throw new BitrixError("RATE_LIMIT", true);
  }
}

export function parseUser(value: unknown): BitrixUser {
  const raw = record(value), userId = text(raw.ID);
  const first = typeof raw.NAME === "string" ? raw.NAME : "", last = typeof raw.LAST_NAME === "string" ? raw.LAST_NAME : "";
  return { id: userId, name: `${first} ${last}`.trim() || `Usuário ${userId}`, position: typeof raw.WORK_POSITION === "string" ? raw.WORK_POSITION : "", department: Array.isArray(raw.UF_DEPARTMENT) ? raw.UF_DEPARTMENT.map(text).join(", ") : "", ...(typeof raw.PERSONAL_PHOTO === "string" && raw.PERSONAL_PHOTO.startsWith("https://") ? { avatar: raw.PERSONAL_PHOTO } : {}), active: raw.ACTIVE === true || raw.ACTIVE === "Y" };
}
