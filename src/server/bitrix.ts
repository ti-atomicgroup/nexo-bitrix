import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { BitrixUser } from "../shared/contracts";
import { AppError, BitrixError } from "./errors";
import { credentialSchema, installationSchema, record, text, type Credential } from "./models";
import { decrypt, encrypt, type Environment } from "./security";
import { Store } from "./store";
const envelope = z.object({ result: z.unknown().optional(), error: z.string().optional(), error_description: z.string().optional(), next: z.number().optional() });
const refreshResponse = z.object({ access_token: z.string().min(1), refresh_token: z.string().min(1), expires_in: z.coerce.number().positive(), member_id: z.string(), user_id: z.coerce.string().optional() });
const throttleSchema = z.object({ until: z.number(), attempts: z.number() });
export class BitrixClient {
  constructor(readonly store: Store, readonly env: Environment, private readonly transport: typeof fetch = fetch) {}
  credentials(userId: string): Credential {
    const value = this.store.get("oauth", userId, credentialSchema);
    if (!value || value.invalid) throw new BitrixError("OAUTH_REAUTHORIZE");
    return value;
  }
  saveCredentials(credential: Credential) { this.store.put("oauth", credential.userId, credential); }
  async exchange(clientId: string, clientSecret: string, current: Credential): Promise<Credential> {
    let response: Response;
    try { response = await this.transport("https://oauth.bitrix.info/oauth/token/", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "refresh_token", client_id: clientId, client_secret: clientSecret, refresh_token: decrypt(current.refresh, this.env.encryptionKey) }).toString(), signal: AbortSignal.timeout(20000), redirect: "error" }); }
    catch { throw new BitrixError("OAUTH_REFRESH_UNAVAILABLE", true); }
    if (response.status === 429 || response.status >= 500) throw new BitrixError("OAUTH_REFRESH_UNAVAILABLE", true);
    const result = refreshResponse.safeParse(await response.json());
    if (!response.ok || !result.success || result.data.member_id !== current.memberId || (result.data.user_id !== undefined && result.data.user_id !== current.userId)) throw new BitrixError("OAUTH_REAUTHORIZE");
    const rawUser = parseUser(await this.direct(result.data.access_token, "user.current", {}));
    if (rawUser.id !== current.userId) throw new BitrixError("OAUTH_REAUTHORIZE");
    return { ...current, access: encrypt(result.data.access_token, this.env.encryptionKey), refresh: encrypt(result.data.refresh_token, this.env.encryptionKey), expiresAt: Date.now() + result.data.expires_in * 1000, invalid: false };
  }
  async direct(access: string, method: string, params: Record<string, unknown>): Promise<unknown> {
    return (await this.request(access, method, params)).result;
  }
  private async request(access: string, method: string, params: Record<string, unknown>) {
    if (!/^[a-z][a-z0-9.]*$/i.test(method)) throw new AppError("METHOD_INVALID", "Método Bitrix inválido.");
    const throttle = this.store.get("throttle", "portal", throttleSchema);
    if (throttle && throttle.until > Date.now()) throw new BitrixError("RATE_LIMIT", true);
    let response: Response;
    try { response = await this.transport(`${this.env.portalUrl}/rest/${method}.json`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...params, auth: access }), signal: AbortSignal.timeout(20000), redirect: "error" }); }
    catch { throw new BitrixError("TRANSPORT_UNCERTAIN", true, true); }
    if (response.status === 429) this.rateLimit(response.headers.get("Retry-After"));
    let payload: unknown;
    try { payload = JSON.parse(await response.text()); }
    catch { throw new BitrixError(response.ok ? "RESPONSE_INVALID" : `HTTP_${response.status}`, response.status >= 500, true); }
    const parsed = envelope.safeParse(payload);
    if (!parsed.success) throw new BitrixError(response.ok ? "RESPONSE_INVALID" : `HTTP_${response.status}`, response.status >= 500, true);
    const data = parsed.data;
    if (data.error === "QUERY_LIMIT_EXCEEDED") this.rateLimit(null);
    if (data.error) throw new BitrixError(data.error, response.status >= 500, response.status >= 500);
    if (!response.ok) throw new BitrixError(`HTTP_${response.status}`, response.status >= 500, response.status >= 500);
    if (data.result === undefined) throw new BitrixError("RESPONSE_EMPTY", false, true);
    return data;
  }
  private rateLimit(retryAfter: string | null): never {
    const previous = this.store.get("throttle", "portal", throttleSchema);
    const attempts = previous && previous.until > Date.now() - 600000 ? previous.attempts + 1 : 1;
    const serverDelay = retryAfter && /^\d+$/.test(retryAfter) ? Number(retryAfter) * 1000 : 0;
    const delay = Math.min(3600000, Math.max(serverDelay, 30000 * 2 ** Math.min(attempts - 1, 7)));
    this.store.put("throttle", "portal", { until: Date.now() + delay, attempts });
    throw new BitrixError("RATE_LIMIT", true);
  }
  private async access(userId: string, force = false): Promise<string> {
    const current = this.credentials(userId);
    if (!force && current.expiresAt > Date.now() + 60000) return decrypt(current.access, this.env.encryptionKey);
    const leaseOwner = randomUUID();
    if (!this.store.lease(`refresh:${userId}`, leaseOwner, 30000)) throw new BitrixError("OAUTH_REFRESH_BUSY", true);
    try {
      const latest = this.credentials(userId);
      if (latest.access !== current.access || (!force && latest.expiresAt > Date.now() + 60000)) return decrypt(latest.access, this.env.encryptionKey);
      const install = this.store.get("installation", "current", installationSchema);
      if (!install) throw new BitrixError("OAUTH_REAUTHORIZE");
      try {
        const renewed = await this.exchange(install.clientId, decrypt(install.clientSecret, this.env.encryptionKey), latest);
        this.saveCredentials(renewed);
        return decrypt(renewed.access, this.env.encryptionKey);
      } catch (error) {
        if (error instanceof AppError && error.code === "OAUTH_REAUTHORIZE") this.saveCredentials({ ...latest, invalid: true });
        throw error;
      }
    } finally { this.store.release(`refresh:${userId}`, leaseOwner); }
  }
  private async authorized(userId: string, method: string, params: Record<string, unknown>) {
    const access = await this.access(userId);
    try { return await this.request(access, method, params); }
    catch (error) {
      if (!(error instanceof BitrixError) || !["expired_token", "invalid_token"].includes(error.code)) throw error;
      const renewed = await this.access(userId, true);
      return this.request(renewed, method, params);
    }
  }
  async call(userId: string, method: string, params: Record<string, unknown> = {}): Promise<unknown> { return (await this.authorized(userId, method, params)).result; }
  async list(userId: string, method: string, params: Record<string, unknown>, field?: string): Promise<unknown[]> {
    const all: unknown[] = [];
    let start = 0;
    for (let page = 0; page < 200; page++) {
      const response = await this.authorized(userId, method, { ...params, start });
      const values = field ? record(response.result)[field] : response.result;
      all.push(...z.array(z.unknown()).parse(values));
      if (response.next === undefined) return all;
      start = response.next;
    }
    throw new AppError("PAGINATION_LIMIT", "Há mais registros que o limite de sincronização. Refine a configuração.", 422);
  }
  async user(userId: string, target: string): Promise<BitrixUser> {
    const result = z.array(z.unknown()).parse(await this.call(userId, "user.get", { ID: target }));
    const raw = result[0];
    if (!raw) throw new AppError("USER_UNAVAILABLE", "Usuário não está disponível para esta conta.", 403);
    return parseUser(raw);
  }
}
export function parseUser(value: unknown): BitrixUser {
  const raw = record(value), userId = text(raw.ID);
  const first = typeof raw.NAME === "string" ? raw.NAME : "", last = typeof raw.LAST_NAME === "string" ? raw.LAST_NAME : "";
  return { id: userId, name: `${first} ${last}`.trim() || `Usuário ${userId}`, position: typeof raw.WORK_POSITION === "string" ? raw.WORK_POSITION : "", department: Array.isArray(raw.UF_DEPARTMENT) ? raw.UF_DEPARTMENT.map(text).join(", ") : "", ...(typeof raw.PERSONAL_PHOTO === "string" && raw.PERSONAL_PHOTO.startsWith("https://") ? { avatar: raw.PERSONAL_PHOTO } : {}), active: raw.ACTIVE === true || raw.ACTIVE === "Y" };
}
