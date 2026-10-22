import { z } from "zod";
import type { AppRole, SessionInfo, Settings } from "../shared/contracts";
import { settingsSchema } from "../shared/validation";
import { BitrixClient, parseUser } from "./bitrix";
import { AppError } from "./errors";
import { contextSchema, installationSchema, record, storedSessionSchema, text } from "./models";
import { encrypt, decrypt, hashToken, newToken, portalFromDomain, safeEqual, type Environment } from "./security";
import { Store } from "./store";
const launchSchema = z.object({ DOMAIN: z.string().min(1).max(200), AUTH_ID: z.string().min(1).max(2000), REFRESH_ID: z.string().min(1).max(2000), APPLICATION_TOKEN: z.string().min(1).max(2000), member_id: z.string().min(1).max(200), AUTH_EXPIRES: z.coerce.number().positive().max(86400).default(3600) });
export class Auth {
  constructor(readonly store: Store, readonly env: Environment, readonly bitrix: BitrixClient) {}
  installation() { return this.store.get("installation", "current", installationSchema); }
  settings(): Settings {
    const value = this.store.get("settings", "current", settingsSchema);
    if (!value) throw new AppError("NOT_INSTALLED", "Instale o Nexo pelo Bitrix24.", 503);
    return value;
  }
  async launch(input: unknown): Promise<{ kind: "session" | "bootstrap"; token: string }> {
    const body = launchSchema.parse(input);
    portalFromDomain(body.DOMAIN, this.env);
    const install = this.installation();
    if (install && (body.member_id !== install.memberId || !safeEqual(body.APPLICATION_TOKEN, decrypt(install.applicationToken, this.env.encryptionKey)))) throw new AppError("INSTALLATION_MISMATCH", "Abertura de outra instalação rejeitada.", 403);
    const user = parseUser(await this.bitrix.direct(body.AUTH_ID, "user.current", {}));
    if (!user.active) throw new AppError("USER_INACTIVE", "Usuário inativo.", 403);
    const adminValue = await this.bitrix.direct(body.AUTH_ID, "user.admin", {});
    const admin = adminValue === true || adminValue === "Y";
    const app = record(await this.bitrix.direct(body.AUTH_ID, "app.info", {}));
    const appId = text(app.ID), appCode = text(app.CODE);
    if (install && (install.appId !== appId || install.clientId !== appCode)) throw new AppError("APPLICATION_MISMATCH", "Credenciais pertencem a outro aplicativo.", 403);
    const credential = { userId: user.id, memberId: body.member_id, access: encrypt(body.AUTH_ID, this.env.encryptionKey), refresh: encrypt(body.REFRESH_ID, this.env.encryptionKey), expiresAt: Date.now() + body.AUTH_EXPIRES * 1000, invalid: false };
    if (!install) {
      if (!admin) throw new AppError("ADMIN_REQUIRED", "A instalação inicial exige um administrador do Bitrix24.", 403);
      const token = newToken();
      this.store.put("bootstrap", hashToken(token), { user, admin, memberId: body.member_id, appId, appCode, applicationToken: encrypt(body.APPLICATION_TOKEN, this.env.encryptionKey), credential, expiresAt: Date.now() + 600000 });
      return { kind: "bootstrap", token };
    }
    this.bitrix.saveCredentials(credential);
    return { kind: "session", token: this.issue({ user, admin, memberId: body.member_id }) };
  }
  private issue(context: Omit<z.infer<typeof storedSessionSchema>, "expiresAt">): string {
    const token = newToken();
    this.store.put("session", hashToken(token), { ...context, expiresAt: Date.now() + 1800000 });
    return token;
  }
  async bootstrap(token: string, setupToken: string, clientId: string, clientSecret: string) {
    if (!safeEqual(setupToken, this.env.setupToken)) throw new AppError("SETUP_TOKEN_INVALID", "Token de instalação inválido.", 403);
    const context = this.store.get("bootstrap", hashToken(token), contextSchema);
    if (!context || context.expiresAt <= Date.now() || !context.admin) throw new AppError("BOOTSTRAP_EXPIRED", "Reabra a instalação pelo Bitrix24.", 401);
    if (clientId !== context.appCode || !clientSecret || clientSecret.length > 1000) throw new AppError("APPLICATION_INVALID", "Client ID deve corresponder ao aplicativo validado pelo Bitrix24.", 400);
    const user = parseUser(await this.bitrix.direct(decrypt(context.credential.access, this.env.encryptionKey), "user.current", {}));
    const isAdmin = await this.bitrix.direct(decrypt(context.credential.access, this.env.encryptionKey), "user.admin", {});
    if (user.id !== context.user.id || (isAdmin !== true && isAdmin !== "Y")) throw new AppError("ADMIN_REQUIRED", "O administrador deve autorizar a instalação.", 403);
    const credential = await this.bitrix.exchange(clientId, clientSecret, context.credential);
    const renewedApp = record(await this.bitrix.direct(decrypt(credential.access, this.env.encryptionKey), "app.info", {}));
    if (text(renewedApp.ID) !== context.appId || text(renewedApp.CODE) !== clientId) throw new AppError("APPLICATION_MISMATCH", "Credenciais pertencem a outro aplicativo.", 403);
    this.store.transaction(() => {
      if (this.installation()) throw new AppError("ALREADY_INSTALLED", "A instalação já foi vinculada. Reabra o Nexo no Bitrix24.", 409);
      this.store.put("installation", "current", { memberId: context.memberId, appId: context.appId, clientId, clientSecret: encrypt(clientSecret, this.env.encryptionKey), applicationToken: context.applicationToken, installedAt: new Date().toISOString() });
      const settings: Settings = { companyName: "Minha empresa", timezone: "America/Sao_Paulo", portalDomain: this.env.portalDomain, applicationClientId: clientId, automationUserId: null, roleAssignments: { admin: [user.id], rh: [], gestor: [], executor: [], colaborador: [] }, defaultAssignees: {}, process: null, setupComplete: false };
      this.store.put("settings", "current", settings);
      this.store.put("rules", "current", []);
      this.bitrix.saveCredentials(credential);
      this.store.remove("bootstrap", hashToken(token));
    });
    const sessionToken = this.issue({ user, admin: true, memberId: context.memberId });
    return { token: sessionToken, session: this.session(sessionToken) };
  }
  session(token: string): SessionInfo {
    if (!/^[\w-]{43}$/.test(token)) throw new AppError("SESSION_REQUIRED", "Abra o aplicativo dentro do Bitrix24 para continuar.", 401);
    const stored = this.store.get("session", hashToken(token), storedSessionSchema);
    const install = this.installation();
    if (!stored || !install || stored.expiresAt <= Date.now() || stored.memberId !== install.memberId) throw new AppError("SESSION_EXPIRED", "Sua sessão expirou. Reabra o Nexo no Bitrix24.", 401);
    const settings = this.settings();
    const roles: AppRole[] = ["admin", "rh", "gestor", "executor", "colaborador"];
    const role = roles.find(candidate => settings.roleAssignments[candidate].includes(stored.user.id) && (candidate !== "admin" || stored.admin)) ?? "colaborador";
    return { user: stored.user, role, portalDomain: this.env.portalDomain, memberId: stored.memberId, expiresAt: new Date(stored.expiresAt).toISOString(), canManage: role === "admin" || role === "rh", canConfigure: role === "admin" };
  }
  requireManage(session: SessionInfo) { if (!session.canManage) throw new AppError("FORBIDDEN", "Esta ação exige papel de RH ou administrador.", 403); }
  async requireAdmin(session: SessionInfo) {
    if (!session.canConfigure) throw new AppError("FORBIDDEN", "Esta ação exige administrador autorizado.", 403);
    const actual = await this.bitrix.call(session.user.id, "user.admin", {});
    if (actual !== true && actual !== "Y") throw new AppError("ADMIN_REQUIRED", "O Bitrix24 exige um administrador atual para esta operação.", 403);
  }
}
