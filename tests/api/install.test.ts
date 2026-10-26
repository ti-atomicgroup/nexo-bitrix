import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as meRoute } from "@/app/api/me/route";
import { GET as settingsRoute } from "@/app/api/settings/route";
import { POST as accountRoute } from "@/app/api/setup/account/route";
import { POST as connectRoute } from "@/app/api/setup/connect/route";
import { POST as prepareRoute } from "@/app/api/setup/prepare/route";
import { GET as statusRoute } from "@/app/api/status/route";
import { listAudit } from "@/server/db/repos/audit";
import { getInstallGrant, getSetupStage, getWebhookRecord, setInstallGrant, setSetupStage } from "@/server/db/repos/settings";
import { countUsers } from "@/server/db/repos/users";
import * as engine from "@/server/engine";
import { encrypt, hashToken, newToken, resetInstanceKeyForTests } from "@/server/security/crypto";
import { resetRateLimitsForTests } from "@/server/security/rate-limit";
import type { MeDTO, SessionDTO, SettingsDTO, SetupStateDTO, StatusDTO, WebhookCheckDTO } from "@/shared/contracts";
import { useTestDb } from "../support/db";
import { call, type ApiErrorBody } from "./support/seed";

vi.mock("@/server/engine", async () => (await import("./support/engine-mock")).engineMock());

const SECRET = "s3gr3d0x9k2";
const WEBHOOK = `https://empresa.bitrix24.com.br/rest/7/${SECRET}/`;
const OWNER = { bitrixUserId: "7", name: "Conta Integração", position: null };
const ACCOUNT = { name: "Marina Souza", email: "marina@empresa.com.br", password: "senha-forte-123" };

let cleanup: () => void;
let logs: string[];
const responses: string[] = [];

beforeEach(() => {
  cleanup = useTestDb().cleanup;
  resetRateLimitsForTests();
  resetInstanceKeyForTests();
  logs = [];
  responses.length = 0;
  vi.spyOn(console, "log").mockImplementation((line: unknown) => void logs.push(String(line)));
  vi.spyOn(console, "error").mockImplementation((line: unknown) => void logs.push(String(line)));
  vi.mocked(engine.verifyWebhook).mockReset();
  vi.mocked(engine.verifyWebhook).mockImplementation(async () => ({
    portal: "empresa.bitrix24.com.br",
    owner: OWNER,
    scopes: ["task", "user", "crm", "sonet_group", "im"],
    encryptedUrl: encrypt(WEBHOOK),
  }));
  vi.mocked(engine.prepareWorkspace).mockReset();
  vi.mocked(engine.prepareWorkspace).mockImplementation(async () => setSetupStage("ready"));
});

afterEach(() => {
  cleanup();
  resetInstanceKeyForTests();
  vi.restoreAllMocks();
});

async function connect(webhookUrl = WEBHOOK) {
  const result = await call<WebhookCheckDTO & ApiErrorBody>(connectRoute, { path: "/api/setup/connect", body: { webhookUrl } });
  responses.push(result.text);
  return result;
}

async function createAccount(installToken: string) {
  const result = await call<SessionDTO & ApiErrorBody>(accountRoute, { path: "/api/setup/account", body: { installToken, ...ACCOUNT } });
  responses.push(result.text);
  return result;
}

describe("instalação", () => {
  it("valida o webhook, guarda só o hash do token de instalação e avança para a conta", async () => {
    expect((await call<StatusDTO>(statusRoute)).body.setup).toBe("connect");
    const result = await connect();
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({
      portal: "empresa.bitrix24.com.br",
      owner: OWNER,
      scopes: { required: { task: true, user_brief: true, crm: true, sonet_group: true }, optional: { im: true, calendar: false, log: false } },
    });
    expect(result.body.installToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const grant = getInstallGrant()!;
    expect(grant.tokenHash).toBe(hashToken(result.body.installToken));
    expect(Date.parse(grant.expiresAt) - Date.now()).toBeGreaterThan(29 * 60 * 1000);
    expect(grant.webhook.encryptedUrl).not.toContain(SECRET);
    expect(getSetupStage()).toBe("account");
    expect((await call<StatusDTO>(statusRoute)).body.setup).toBe("account");
    expect(result.text).not.toContain(grant.webhook.encryptedUrl);
  });

  it("escopo obrigatório faltando → 422 com a lista para a tela, sem gravar nada", async () => {
    vi.mocked(engine.verifyWebhook).mockImplementation(async () => ({ portal: "empresa.bitrix24.com.br", owner: OWNER, scopes: ["task", "user_brief"], encryptedUrl: encrypt(WEBHOOK) }));
    const result = await connect();
    expect(result.status).toBe(422);
    expect(result.body.error.code).toBe("SCOPES_MISSING");
    expect(result.body.error.message).toBe("Marque CRM e Grupos de trabalho no webhook do Bitrix24, salve e cole o endereço de novo.");
    expect(result.body.error.details).toMatchObject({
      missing: ["crm", "sonet_group"],
      portal: "empresa.bitrix24.com.br",
      owner: OWNER,
      scopes: { required: { task: true, user_brief: true, crm: false, sonet_group: false } },
    });
    expect(getInstallGrant()).toBeNull();
    expect(getSetupStage()).toBe("connect");
  });

  it("cria o primeiro administrador só com o token desta aba e dentro do prazo", async () => {
    const { body: check } = await connect();

    const wrong = await createAccount(newToken());
    expect(wrong.status).toBe(403);
    expect(wrong.body.error).toEqual({ code: "INSTALL_TOKEN_INVALID", message: "Valide o webhook de novo para continuar a instalação." });

    const grant = getInstallGrant()!;
    setInstallGrant({ ...grant, expiresAt: new Date(Date.now() - 1000).toISOString() });
    expect((await createAccount(check.installToken)).status).toBe(403);
    setInstallGrant(grant);

    const session = await createAccount(check.installToken);
    expect(session.status).toBe(200);
    expect(session.body.me.user).toMatchObject({ name: ACCOUNT.name, email: ACCOUNT.email, role: "admin", mustChangePassword: false });
    expect(session.body.me.setup).toMatchObject({ stage: "prepare", portal: "empresa.bitrix24.com.br", webhookOwner: OWNER });
    expect(countUsers()).toBe(1);
    expect(getWebhookRecord()?.encryptedUrl).toBe(grant.webhook.encryptedUrl);
    expect(getInstallGrant()).toBeNull();
    expect(listAudit({ entity: "user" })[0]?.action).toBe("Acesso de administrador criado na instalação");

    const me = await call<MeDTO>(meRoute, { path: "/api/me", token: session.body.token });
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe(ACCOUNT.email);
  });

  it("sem webhook validado não há conta", async () => {
    const result = await createAccount(newToken());
    expect(result.status).toBe(403);
    expect(countUsers()).toBe(0);
  });

  it("bloqueia uma segunda instalação", async () => {
    const { body: check } = await connect();
    expect((await createAccount(check.installToken)).status).toBe(200);
    vi.mocked(engine.verifyWebhook).mockClear();

    const again = await connect();
    expect(again.status).toBe(409);
    expect(again.body.error).toEqual({ code: "ALREADY_INSTALLED", message: "O Nexo já foi instalado. Entre com sua conta." });
    expect(engine.verifyWebhook).not.toHaveBeenCalled();
    expect((await createAccount(check.installToken)).status).toBe(409);
    expect(countUsers()).toBe(1);
  });

  it("preparar exige administrador, usa os padrões e devolve o estado", async () => {
    const { body: check } = await connect();
    const { body: session } = await createAccount(check.installToken);
    const anonymous = await call(prepareRoute, { path: "/api/setup/prepare", body: {} });
    expect(anonymous.status).toBe(401);

    const result = await call<SetupStateDTO>(prepareRoute, { path: "/api/setup/prepare", token: session.token, body: { companyName: "Atomic" } });
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ stage: "ready", portal: "empresa.bitrix24.com.br" });
    expect(engine.prepareWorkspace).toHaveBeenCalledWith(
      { companyName: "Atomic", timezone: "America/Sao_Paulo", projectName: "Nexo · Jornadas", defaults: {} },
      { type: "user", id: session.me.user.id, name: ACCOUNT.name },
    );
  });

  it("o segredo do webhook nunca aparece em resposta nem em log", async () => {
    const { body: check } = await connect();
    const { body: session } = await createAccount(check.installToken);
    const settings = await call<SettingsDTO>(settingsRoute, { path: "/api/settings", token: session.token });
    responses.push(settings.text);
    expect(settings.body.webhook?.masked).toBe("https://empresa.bitrix24.com.br/rest/7/••••••/");
    await connect("https://empresa.bitrix24.com.br/rest/7/outro-segredo/");
    for (const text of [...responses, ...logs]) {
      expect(text).not.toContain(SECRET);
      expect(text).not.toContain("outro-segredo");
      expect(text).not.toContain("encryptedUrl");
    }
  });
});
