import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authenticate, issueSession } from "@/server/auth/sessions";
import { listAudit } from "@/server/db/repos/audit";
import { getDefaults, getWebhookRecord, patchSyncState, setWebhookRecord } from "@/server/db/repos/settings";
import { findUserById, updateUser } from "@/server/db/repos/users";
import * as engine from "@/server/engine";
import { AppError } from "@/server/errors";
import { encrypt, resetInstanceKeyForTests } from "@/server/security/crypto";
import { getDiagnostics } from "@/server/services/diagnostics";
import { getSettings, replaceWebhook, updateSettings } from "@/server/services/settings";
import { createAppUser, updateAppUser } from "@/server/services/users";
import { seedBitrixPerson, seedUser } from "../../api/support/seed";
import { useTestDb } from "../../support/db";

vi.mock("@/server/engine", async () => (await import("../../api/support/engine-mock")).engineMock());

const ADMIN = { type: "user" as const, id: "admin", name: "Marina" };
const SECRET = "s3gr3d0x9k2";
const WEBHOOK = `https://empresa.bitrix24.com.br/rest/7/${SECRET}/`;
const OWNER = { bitrixUserId: "7", name: "Integração", position: null };

let cleanup: () => void;
beforeEach(() => {
  cleanup = useTestDb().cleanup;
  resetInstanceKeyForTests();
  vi.spyOn(console, "log").mockImplementation(() => undefined);
});
afterEach(() => {
  cleanup();
  resetInstanceKeyForTests();
  vi.restoreAllMocks();
});

function connectWebhook(url = WEBHOOK) {
  setWebhookRecord({ encryptedUrl: encrypt(url), portal: "empresa.bitrix24.com.br", owner: OWNER, scopes: ["task", "user", "crm", "sonet_group", "calendar"], verifiedAt: "2026-10-26T12:00:00.000Z" });
}

function catchError(fn: () => unknown): AppError {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(AppError);
    return error as AppError;
  }
  throw new Error("esperava um erro");
}

describe("ajustes", () => {
  it("mostra o webhook só mascarado, com os escopos", () => {
    connectWebhook();
    const settings = getSettings();
    expect(settings.webhook).toEqual({
      masked: "https://empresa.bitrix24.com.br/rest/7/••••••/",
      owner: OWNER,
      scopes: { required: { task: true, user_brief: true, crm: true, sonet_group: true }, optional: { im: false, calendar: true, log: false } },
      verifiedAt: "2026-10-26T12:00:00.000Z",
    });
    expect(JSON.stringify(settings)).not.toContain(SECRET);
  });

  it("usa uma máscara genérica se a máscara do motor vazar o segredo ou a cifra falhar", () => {
    connectWebhook();
    vi.mocked(engine.maskWebhookUrl).mockImplementationOnce((url: string) => url);
    expect(getSettings().webhook?.masked).toBe("https://empresa.bitrix24.com.br/rest/••/••••••/");
    setWebhookRecord({ ...getWebhookRecord()!, encryptedUrl: "v1.quebrado.x.y" });
    expect(getSettings().webhook?.masked).toBe("https://empresa.bitrix24.com.br/rest/••/••••••/");
  });

  it("resolve os responsáveis padrão pelo cache de pessoas e registra a mudança", () => {
    seedBitrixPerson("11", "Diego Araújo", "Analista de TI");
    seedBitrixPerson("12", "Rita RH");
    updateSettings({ defaults: { ti: "11", rh: "12" }, features: { feed: false } }, ADMIN);
    expect(getDefaults()).toEqual({ ti: { bitrixUserId: "11", name: "Diego Araújo", position: "Analista de TI" }, rh: { bitrixUserId: "12", name: "Rita RH", position: null } });
    const settings = updateSettings({ defaults: { rh: null }, company: { name: "Atomic", timezone: "America/Manaus" } }, ADMIN);
    expect(settings.defaults).toEqual({ ti: { bitrixUserId: "11", name: "Diego Araújo", position: "Analista de TI" } });
    expect(settings.company).toEqual({ name: "Atomic", timezone: "America/Manaus" });
    expect(settings.features).toEqual({ notifications: true, calendar: true, feed: false });
    expect(listAudit({ entity: "settings" })[0]).toMatchObject({ actor: "Marina", action: "Ajustes atualizados", detail: "empresa, responsáveis padrão" });
  });

  it("recusa pessoa fora do cache e fuso inválido, sem gravar nada pela metade", () => {
    const unknown = catchError(() => updateSettings({ company: { name: "Atomic", timezone: "America/Sao_Paulo" }, defaults: { ti: "999" } }, ADMIN));
    expect(unknown).toMatchObject({ code: "PERSON_NOT_FOUND", status: 400, details: { field: "defaults.ti" } });
    expect(getSettings().company.name).toBe("Minha empresa");
    expect(catchError(() => updateSettings({ company: { name: "Atomic", timezone: "Marte/Olimpo" } }, ADMIN)).message).toContain("fuso horário");
  });

  it("troca o webhook só no mesmo portal", async () => {
    connectWebhook();
    vi.mocked(engine.verifyWebhook).mockResolvedValueOnce({ portal: "outra.bitrix24.com.br", owner: OWNER, scopes: ["task", "user", "crm", "sonet_group"], encryptedUrl: "v1.a.b.c" });
    await expect(replaceWebhook("https://outra.bitrix24.com.br/rest/1/abc/", ADMIN)).rejects.toMatchObject({ code: "PORTAL_MISMATCH", status: 409 });

    vi.mocked(engine.verifyWebhook).mockResolvedValueOnce({ portal: "empresa.bitrix24.com.br", owner: OWNER, scopes: ["task"], encryptedUrl: "v1.a.b.c" });
    await expect(replaceWebhook("https://empresa.bitrix24.com.br/rest/1/abc/", ADMIN)).rejects.toMatchObject({ code: "SCOPES_MISSING", status: 422 });

    const replacement = `https://EMPRESA.bitrix24.com.br/rest/9/novo-segredo/`;
    vi.mocked(engine.verifyWebhook).mockResolvedValueOnce({ portal: "https://EMPRESA.bitrix24.com.br", owner: { ...OWNER, bitrixUserId: "9" }, scopes: ["task", "user_brief", "crm", "sonet_group"], encryptedUrl: encrypt(replacement) });
    const settings = await replaceWebhook(replacement, ADMIN);
    expect(settings.webhook?.owner.bitrixUserId).toBe("9");
    expect(JSON.stringify(settings)).not.toContain("novo-segredo");
  });
});

describe("acessos do Nexo", () => {
  it("cria acesso com troca de senha obrigatória e recusa e-mail repetido", async () => {
    const created = await createAppUser({ name: "Rita", email: "rita@empresa.com.br", role: "rh", temporaryPassword: "temporaria-123" }, ADMIN);
    expect(findUserById(created.id)?.mustChangePassword).toBe(true);
    expect(created).not.toHaveProperty("passwordHash");
    await expect(createAppUser({ name: "Rita 2", email: "RITA@empresa.com.br", role: "rh", temporaryPassword: "temporaria-123" }, ADMIN)).rejects.toMatchObject({ code: "EMAIL_TAKEN", status: 409 });
  });

  it("nunca desativa nem rebaixa o último administrador ativo", async () => {
    const { user: admin } = await seedUser({ role: "admin" });
    await expect(updateAppUser(admin.id, { active: false }, ADMIN)).rejects.toMatchObject({ code: "LAST_ADMIN", status: 409 });
    await expect(updateAppUser(admin.id, { role: "rh" }, ADMIN)).rejects.toMatchObject({ code: "LAST_ADMIN" });
    const { user: second } = await seedUser({ role: "admin" });
    await expect(updateAppUser(admin.id, { role: "rh" }, ADMIN)).resolves.toMatchObject({ role: "rh" });
    await expect(updateAppUser(second.id, { active: false }, ADMIN)).rejects.toMatchObject({ code: "LAST_ADMIN" });
  });

  it("redefinir a senha ou desativar encerra as sessões da pessoa", async () => {
    const { user, token } = await seedUser({ role: "rh" });
    updateUser(user.id, { failedLogins: 5, lockedUntil: "2999-01-01T00:00:00.000Z" });
    const bearer = (value: string) => new Request("http://localhost/api/me", { headers: { authorization: `Bearer ${value}` } });
    await updateAppUser(user.id, { resetPassword: "nova-temporaria-1" }, ADMIN);
    expect(authenticate(bearer(token))).toBeNull();
    expect(findUserById(user.id)).toMatchObject({ mustChangePassword: true, failedLogins: 0, lockedUntil: null });

    const next = issueSession(user).token;
    await updateAppUser(user.id, { active: false }, ADMIN);
    expect(authenticate(bearer(next))).toBeNull();
    expect(listAudit({ entity: "user" }).map((entry) => entry.detail)).toContain(`${user.name}: desativado`);
    await expect(updateAppUser("nao-existe", { active: true }, ADMIN)).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
  });
});

describe("diagnóstico", () => {
  it("mostra banco, fila e agendador; sem o motor, usa o último estado gravado", () => {
    patchSyncState({ lastCycleAt: "2026-10-26T12:00:00.000Z", lastError: "Limite do Bitrix24", rateLimitedUntil: "2026-10-26T12:05:00.000Z" });
    vi.mocked(engine.schedulerStatus).mockImplementationOnce(() => {
      throw new Error("motor fora do ar");
    });
    vi.mocked(engine.bitrixRateLimitedUntil).mockImplementationOnce(() => {
      throw new Error("motor fora do ar");
    });
    const diagnostics = getDiagnostics();
    expect(diagnostics.database.driver).toMatch(/sqlite/);
    expect(diagnostics.node).toBe(process.version);
    expect(diagnostics.scheduler).toMatchObject({ running: false, lastCycleAt: "2026-10-26T12:00:00.000Z", lastError: "Limite do Bitrix24" });
    expect(diagnostics.rateLimitedUntil).toBe("2026-10-26T12:05:00.000Z");
    expect(diagnostics.queue).toEqual({ queued: 0, failed: 0 });
    expect(getDiagnostics().scheduler.running).toBe(true);
  });
});
