import { z } from "zod";
import type { BitrixUser } from "../shared/contracts";
import { AppError, BitrixError } from "./errors";
import { record, text, webhookConfigurationSchema } from "./models";
import { decrypt, encrypt, parseIncomingWebhookUrl, type Environment } from "./security";
import { Store } from "./store";

const envelope = z.object({ result: z.unknown().optional(), error: z.string().optional(), error_description: z.string().optional(), next: z.number().optional() });
const throttleSchema = z.object({ until: z.number(), attempts: z.number() });

export class BitrixClient {
  constructor(readonly store: Store, readonly env: Environment, private readonly transport: typeof fetch = fetch) {}

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
  }

  private async webhookRequest(webhook: { userId: string; secret: string }, method: string, params: Record<string, unknown>): Promise<{ result: unknown; next?: number }> {
    if (!/^[a-z][a-z0-9.]*$/i.test(method)) throw new AppError("METHOD_INVALID", "Método Bitrix inválido.");
    const throttle = this.store.get("throttle", "portal", throttleSchema);
    if (throttle && throttle.until > Date.now()) throw new BitrixError("RATE_LIMIT", true);
    let response: Response;
    try {
      response = await this.transport(`${this.env.portalUrl}/rest/${webhook.userId}/${webhook.secret}/${method}.json`, {
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
