import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { existsSync } from "node:fs";
import { AppError } from "./errors";

export interface Environment { encryptionKey: string; setupToken: string; appUrl: string; portalUrl: string; portalDomain: string; dataDir: string; aiBaseUrl: string | null; aiModel: string | null; aiApiKey: string | null; aiConfigured: boolean; chatApiKey: string | null }
const required = ["NEXO_ENCRYPTION_KEY", "NEXO_SETUP_TOKEN", "NEXO_APP_URL"];
const bitrixCloudDomain = /^[a-z0-9][a-z0-9-]*\.(?:bitrix24\.(?:com|com\.br|es|eu|de|fr|it|pl|ru|cn|in|com\.tr)|bitrix24site\.com)$/i;
export function missingEnvironment(env: Record<string, string | undefined> = process.env): string[] {
  return required.filter(key => !env[key]);
}
export function validateEnvironment(env: Record<string, string | undefined> = process.env): Environment {
  const missing = missingEnvironment(env);
  if (missing.length) throw new AppError("ENVIRONMENT", `Configure no servidor: ${missing.join(", ")}.`, 503);
  const encryptionKey = env.NEXO_ENCRYPTION_KEY ?? "";
  const setupToken = env.NEXO_SETUP_TOKEN ?? "";
  if (!/^[a-f\d]{64}$/i.test(encryptionKey) || setupToken.length < 20) throw new AppError("ENVIRONMENT", "Configure chave AES de 64 hex e token de instalação com pelo menos 20 caracteres.", 503);
  let portal: URL | null = null;
  if (env.BITRIX_PORTAL_URL) {
    try { portal = new URL(env.BITRIX_PORTAL_URL); }
    catch { throw new AppError("PORTAL_INVALID", "BITRIX_PORTAL_URL deve ser a origem HTTPS de um portal Bitrix24 cloud.", 503); }
    if (portal.protocol !== "https:" || portal.username || portal.password || portal.port || portal.search || portal.hash || portal.pathname !== "/" || !bitrixCloudDomain.test(portal.hostname)) throw new AppError("PORTAL_INVALID", "BITRIX_PORTAL_URL deve ser a origem HTTPS de um portal Bitrix24 cloud.", 503);
  }
  const app = new URL(env.NEXO_APP_URL ?? "");
  if (app.username || app.password || app.search || app.hash || (app.protocol !== "https:" && !(app.protocol === "http:" && ["localhost", "127.0.0.1"].includes(app.hostname)))) throw new AppError("APP_URL_INVALID", "NEXO_APP_URL deve ser HTTPS; localhost HTTP é permitido no desenvolvimento.", 503);
  const rawAiUrl = env.NEXO_AI_BASE_URL?.trim() || "", aiModel = env.NEXO_AI_MODEL?.trim() || "", aiApiKey = env.NEXO_AI_API_KEY?.trim() || "";
  const chatApiKey = env.NEXO_CHAT_API_KEY?.trim() || null;
  if (chatApiKey && chatApiKey.length < 32) throw new AppError("ENVIRONMENT", "NEXO_CHAT_API_KEY deve ter pelo menos 32 caracteres aleatórios.", 503);
  let aiBaseUrl: string | null = null;
  if (rawAiUrl) {
    try {
      const aiUrl = new URL(rawAiUrl);
      const localHttp = app.hostname === "localhost" || app.hostname === "127.0.0.1";
      if ((aiUrl.protocol === "https:" || (localHttp && aiUrl.protocol === "http:" && ["localhost", "127.0.0.1"].includes(aiUrl.hostname))) && !aiUrl.username && !aiUrl.password && !aiUrl.search && !aiUrl.hash) aiBaseUrl = aiUrl.origin + aiUrl.pathname.replace(/\/+$/, "");
    } catch { /* optional integration stays disabled on invalid configuration */ }
  }
  const aiConfigured = Boolean(aiBaseUrl && aiModel && aiApiKey);
  return { encryptionKey, setupToken, appUrl: app.origin, portalUrl: portal?.origin ?? "", portalDomain: portal?.hostname ?? "", dataDir: env.NEXO_DATA_DIR || (existsSync("/app/.data") ? "/app/.data" : "./data"), aiBaseUrl: aiConfigured ? aiBaseUrl : null, aiModel: aiConfigured ? aiModel : null, aiApiKey: aiConfigured ? aiApiKey : null, aiConfigured, chatApiKey };
}
export function portalFromDomain(domain: string, env: Environment): string {
  if (domain.toLowerCase() !== env.portalDomain) throw new AppError("PORTAL_MISMATCH", "Portal não autorizado.", 403);
  return env.portalUrl;
}
export function parseIncomingWebhookUrl(value: string, env: Environment): { userId: string; secret: string; portalUrl: string; portalDomain: string } {
  let url: URL;
  try { url = new URL(value); } catch { throw new AppError("WEBHOOK_URL_INVALID", "Cole a URL completa do webhook HTTPS do Bitrix24.", 400); }
  const match = /^\/rest\/(\d+)\/([A-Za-z0-9_-]+)\/?$/.exec(url.pathname);
  if (url.protocol !== "https:" || !bitrixCloudDomain.test(url.hostname) || (env.portalUrl && url.origin !== env.portalUrl) || url.username || url.password || url.port || url.search || url.hash || !match?.[1] || !match[2]) throw new AppError("WEBHOOK_URL_INVALID", "A URL deve ser um webhook HTTPS de um portal Bitrix24 Cloud, sem parâmetros extras.", 400);
  return { userId: match[1], secret: match[2], portalUrl: url.origin, portalDomain: url.hostname };
}
export function hashPassword(password: string): string {
  const salt = randomBytes(16), cost = 16384, blockSize = 8, parallel = 1;
  const derived = scryptSync(password, salt, 64, { N: cost, r: blockSize, p: parallel, maxmem: 64 * 1024 * 1024 });
  return `scrypt$${cost}$${blockSize}$${parallel}$${salt.toString("hex")}$${derived.toString("hex")}`;
}
export function verifyPassword(password: string, encoded: string): boolean {
  const [algorithm, costRaw, blockRaw, parallelRaw, saltRaw, derivedRaw] = encoded.split("$");
  if (algorithm !== "scrypt" || !costRaw || !blockRaw || !parallelRaw || !saltRaw || !derivedRaw || !/^[a-f\d]{32}$/i.test(saltRaw) || !/^[a-f\d]{128}$/i.test(derivedRaw)) return false;
  const cost = Number(costRaw), blockSize = Number(blockRaw), parallel = Number(parallelRaw);
  if (cost !== 16384 || blockSize !== 8 || parallel !== 1) return false;
  const expected = Buffer.from(derivedRaw, "hex"), actual = scryptSync(password, Buffer.from(saltRaw, "hex"), expected.length, { N: cost, r: blockSize, p: parallel, maxmem: 64 * 1024 * 1024 });
  return timingSafeEqual(expected, actual);
}
export function encrypt(value: string, key: string): string {
  const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", Buffer.from(key, "hex"), iv);
  const payload = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), payload.toString("base64url")].join(".");
}
export function decrypt(value: string, key: string): string {
  const [iv, tag, payload] = value.split(".");
  if (!iv || !tag || !payload) throw new AppError("CIPHER_INVALID", "Credencial cifrada inválida.", 503);
  const decipher = createDecipheriv("aes-256-gcm", Buffer.from(key, "hex"), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(payload, "base64url")), decipher.final()]).toString("utf8");
}
export function safeEqual(a: string, b: string): boolean {
  const first = Buffer.from(a), second = Buffer.from(b);
  return first.length === second.length && timingSafeEqual(first, second);
}
export function hashToken(token: string): string { return createHash("sha256").update(token).digest("hex"); }
export function newToken(): string { return randomBytes(32).toString("base64url"); }
