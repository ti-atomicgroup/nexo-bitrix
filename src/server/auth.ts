import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { AppRole, SessionInfo, Settings } from "../shared/contracts";
import { settingsSchema } from "../shared/validation";
import { BitrixClient } from "./bitrix";
import { AppError } from "./errors";
import { localUserSchema, storedSessionSchema, webhookConfigurationSchema, type LocalUser } from "./models";
import { hashPassword, hashToken, newToken, safeEqual, verifyPassword, type Environment } from "./security";
import { Store } from "./store";
export class Auth {
  constructor(readonly store: Store, readonly env: Environment, readonly bitrix: BitrixClient) {}
  private localUsers() { return this.store.list("localUser", localUserSchema); }
  listLocalUsers(session: SessionInfo) {
    if (!session.canConfigure) throw new AppError("FORBIDDEN", "Esta ação exige administrador do Nexo.", 403);
    return this.localUsers().map(user => localUserSchema.omit({ passwordHash: true }).parse(user));
  }
  async bootstrapLocalAdmin(setupToken: string, email: string, password: string, bitrixUserId: string) {
    if (!safeEqual(setupToken, this.env.setupToken)) throw new AppError("SETUP_TOKEN_INVALID", "Token de instalação inválido.", 403);
    if (!this.store.get("webhook", "incoming", webhookConfigurationSchema)) throw new AppError("WEBHOOK_NOT_CONFIGURED", "Valide primeiro o webhook de entrada do Bitrix24.", 409);
    if (this.localUsers().length) throw new AppError("BOOTSTRAP_CLOSED", "A conta inicial já foi criada.", 409);
    const emailValue = z.string().email().max(254).parse(email.trim().toLowerCase());
    const passwordValue = z.string().min(12).max(200).parse(password);
    const serviceUserId = this.store.get("webhook", "incoming", webhookConfigurationSchema)?.serviceUserId;
    if (bitrixUserId !== serviceUserId) throw new AppError("SERVICE_USER_REQUIRED", "Vincule o primeiro administrador à mesma conta RH que criou o webhook.", 422);
    const user = await this.bitrix.user("service", z.string().regex(/^\d+$/).parse(bitrixUserId));
    if (!user.active) throw new AppError("USER_INACTIVE", "Vincule uma conta Bitrix24 ativa.", 403);
    const account: LocalUser = { id: randomUUID(), bitrixUserId: user.id, user, email: emailValue, role: "admin", passwordHash: hashPassword(passwordValue), active: true, createdAt: new Date().toISOString() };
    const settings: Settings = { companyName: "Minha empresa", timezone: "America/Sao_Paulo", portalDomain: this.env.portalDomain, applicationClientId: "webhook-only", automationUserId: this.store.get("webhook", "incoming", webhookConfigurationSchema)?.serviceUserId ?? null, roleAssignments: { admin: [user.id], rh: [], gestor: [], executor: [], colaborador: [] }, defaultAssignees: {}, process: null, rhProject: null, setupComplete: false };
    this.store.transaction(() => {
      if (this.localUsers().length) throw new AppError("BOOTSTRAP_CLOSED", "A conta inicial já foi criada.", 409);
      this.store.put("localUser", account.id, account);
      this.store.put("settings", "current", settings);
      this.store.put("rules", "current", []);
    });
    const token = this.issue({ user, admin: true, memberId: this.env.portalDomain, localUserId: account.id });
    return { token, session: this.session(token) };
  }
  async loginLocal(email: string, password: string) {
    const normalized = email.trim().toLowerCase();
    const account = this.localUsers().find(item => item.email === normalized);
    if (!account || !account.active || !verifyPassword(password, account.passwordHash)) throw new AppError("LOGIN_INVALID", "E-mail ou senha inválidos.", 401);
    const token = this.issue({ user: account.user, admin: account.role === "admin", memberId: this.env.portalDomain, localUserId: account.id });
    return { token, session: this.session(token) };
  }
  logoutLocal(token: string): void { this.store.remove("session", hashToken(token)); }
  async createLocalUser(session: SessionInfo, input: unknown) {
    if (!session.canConfigure) throw new AppError("FORBIDDEN", "Esta ação exige administrador do Nexo.", 403);
    const data = z.object({ email: z.string().email().max(254), password: z.string().min(12).max(200), bitrixUserId: z.string().regex(/^\d+$/), role: z.enum(["rh", "gestor", "executor", "colaborador"]) }).parse(input);
    const email = data.email.trim().toLowerCase(), users = this.localUsers();
    if (users.some(user => user.email === email || user.bitrixUserId === data.bitrixUserId)) throw new AppError("LOCAL_USER_EXISTS", "Este e-mail ou ID Bitrix já está vinculado.", 409);
    const user = await this.bitrix.user(session.user.id, data.bitrixUserId);
    if (!user.active) throw new AppError("USER_INACTIVE", "Não é possível liberar acesso para usuário Bitrix inativo.", 409);
    const account: LocalUser = { id: randomUUID(), bitrixUserId: user.id, user, email, role: data.role, passwordHash: hashPassword(data.password), active: true, createdAt: new Date().toISOString() };
    this.store.transaction(() => {
      this.store.put("localUser", account.id, account);
      const settings = this.settings();
      const roleAssignments = Object.fromEntries(Object.entries(settings.roleAssignments).map(([role, ids]) => [role, role === data.role ? [...ids.filter(id => id !== user.id), user.id] : ids.filter(id => id !== user.id)])) as Settings["roleAssignments"];
      this.store.put("settings", "current", { ...settings, roleAssignments });
    });
    return localUserSchema.omit({ passwordHash: true }).parse(account);
  }
  async deactivateLocalUser(session: SessionInfo, accountId: string): Promise<void> {
    if (!session.canConfigure) throw new AppError("FORBIDDEN", "Esta ação exige administrador do Nexo.", 403);
    const account = this.store.get("localUser", accountId, localUserSchema);
    if (!account) throw new AppError("LOCAL_USER_NOT_FOUND", "Conta do Nexo não encontrada.", 404);
    if (account.role === "admin") throw new AppError("ADMIN_REQUIRED", "Não é possível desativar uma conta administradora por esta ação.", 409);
    this.store.transaction(() => {
      this.store.put("localUser", account.id, { ...account, active: false });
      const settings = this.settings();
      const roleAssignments = Object.fromEntries(Object.entries(settings.roleAssignments).map(([role, ids]) => [role, ids.filter(id => id !== account.bitrixUserId)])) as Settings["roleAssignments"];
      this.store.put("settings", "current", { ...settings, roleAssignments });
    });
  }
  settings(): Settings {
    const value = this.store.get("settings", "current", settingsSchema);
    if (!value) throw new AppError("NOT_INSTALLED", "Instale o Nexo pelo Bitrix24.", 503);
    return value;
  }
  private issue(context: Omit<z.infer<typeof storedSessionSchema>, "expiresAt">): string {
    const token = newToken();
    this.store.put("session", hashToken(token), { ...context, expiresAt: Date.now() + 1800000 });
    return token;
  }
  session(token: string): SessionInfo {
    if (!/^[\w-]{43}$/.test(token)) throw new AppError("SESSION_REQUIRED", "Abra o aplicativo dentro do Bitrix24 para continuar.", 401);
    const stored = this.store.get("session", hashToken(token), storedSessionSchema);
    if (!stored || !this.store.get("webhook", "incoming", webhookConfigurationSchema) || stored.expiresAt <= Date.now() || stored.memberId !== this.env.portalDomain) throw new AppError("SESSION_EXPIRED", "Sua sessão expirou. Entre novamente no Nexo.", 401);
    const settings = this.settings();
    const account = stored.localUserId ? this.store.get("localUser", stored.localUserId, localUserSchema) : null;
    if (stored.localUserId && (!account || !account.active || account.bitrixUserId !== stored.user.id)) throw new AppError("SESSION_EXPIRED", "Sua conta foi desativada. Entre em contato com a administração do Nexo.", 401);
    if (account) {
      const roles: AppRole[] = ["admin", "rh", "gestor", "executor", "colaborador"];
      const role = roles.find(candidate => candidate === account.role && settings.roleAssignments[candidate].includes(stored.user.id)) ?? "colaborador";
      return { user: account.user, role, portalDomain: this.env.portalDomain, memberId: stored.memberId, expiresAt: new Date(stored.expiresAt).toISOString(), canManage: role === "admin" || role === "rh", canConfigure: role === "admin" };
    }
    throw new AppError("SESSION_EXPIRED", "Esta sessão não usa uma conta local do Nexo. Entre novamente.", 401);
  }
  chatSession(): SessionInfo {
    const webhook = this.store.get("webhook", "incoming", webhookConfigurationSchema);
    if (!webhook) throw new AppError("WEBHOOK_NOT_CONFIGURED", "Conecte o webhook Bitrix antes de usar o chat.", 503);
    const account = this.localUsers().find(item => item.active && item.bitrixUserId === webhook.serviceUserId);
    if (!account) throw new AppError("CHAT_IDENTITY_REQUIRED", "Vincule uma conta RH ativa à conta autorizada do webhook.", 403);
    const settings = this.settings();
    const roles: AppRole[] = ["admin", "rh", "gestor", "executor", "colaborador"];
    const role = roles.find(candidate => candidate === account.role && settings.roleAssignments[candidate].includes(account.bitrixUserId)) ?? "colaborador";
    if (role !== "admin" && role !== "rh") throw new AppError("CHAT_RH_REQUIRED", "A API do chat exige uma conta Bitrix vinculada ao papel RH ou administrador.", 403);
    return { user: { ...account.user, name: `${account.user.name} (Onnira Chat)` }, role, portalDomain: this.env.portalDomain, memberId: this.env.portalDomain, expiresAt: new Date(Date.now() + 60000).toISOString(), canManage: true, canConfigure: role === "admin" };
  }
  requireManage(session: SessionInfo) { if (!session.canManage) throw new AppError("FORBIDDEN", "Esta ação exige papel de RH ou administrador.", 403); }
  async requireAdmin(session: SessionInfo) {
    if (!session.canConfigure) throw new AppError("FORBIDDEN", "Esta ação exige administrador autorizado.", 403);
    const actual = await this.bitrix.call(session.user.id, "user.admin", {});
    if (actual !== true && actual !== "Y") throw new AppError("ADMIN_REQUIRED", "O Bitrix24 exige um administrador atual para esta operação.", 403);
  }
}
