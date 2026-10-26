import "server-only";
import type { SessionDTO, SetupStateDTO, WebhookCheckDTO } from "@/shared/contracts";
import type { CreateAccountInput, PrepareInput } from "@/shared/schemas";
import { prepareWorkspace, verifyWebhook, type Actor } from "@/server/engine";
import { getDb } from "../db";
import { clearInstallGrant, getInstallGrant, getWebhookRecord, setInstallGrant, setSetupStage, setWebhookRecord, type InstallGrant } from "../db/repos/settings";
import { countUsers, createUser } from "../db/repos/users";
import { AppError } from "../errors";
import { hashToken, newToken, safeEqual } from "../security/crypto";
import { hashPassword } from "../security/passwords";
import { rateLimit } from "../security/rate-limit";
import { auditAs } from "./audit";
import { assertRequiredScopes, scopeCheck } from "./scopes";
import { startSession } from "./session";
import { setupState } from "./setup-state";

/**
 * Instalação em 3 passos, só enquanto não existe nenhum acesso:
 * 1) valida o webhook e entrega um token curto preso a esta aba; 2) cria o administrador; 3) prepara o Bitrix.
 */
const GRANT_TTL_MS = 30 * 60 * 1000;
const CONNECT_RULE = { limit: 20, windowMs: 10 * 60 * 1000 };

const alreadyInstalled = () => new AppError("ALREADY_INSTALLED", "O Nexo já foi instalado. Entre com sua conta.", 409);
const grantInvalid = () => new AppError("INSTALL_TOKEN_INVALID", "Valide o webhook de novo para continuar a instalação.", 403);

export async function connectWebhook(url: string): Promise<WebhookCheckDTO> {
  if (countUsers() > 0) throw alreadyInstalled();
  if (!rateLimit("setup:connect", CONNECT_RULE).allowed) {
    throw new AppError("TOO_MANY_ATTEMPTS", "Muitas tentativas. Tente de novo em alguns minutos.", 429);
  }
  const check = await verifyWebhook(url);
  const scopes = scopeCheck(check.scopes);
  assertRequiredScopes(scopes, { portal: check.portal, owner: check.owner });

  const installToken = newToken();
  getDb().tx(() => {
    // Conferido de novo depois da chamada ao Bitrix: outra aba pode ter concluído a instalação nesse meio-tempo.
    if (countUsers() > 0) throw alreadyInstalled();
    setInstallGrant({
      tokenHash: hashToken(installToken),
      expiresAt: new Date(Date.now() + GRANT_TTL_MS).toISOString(),
      webhook: { encryptedUrl: check.encryptedUrl, portal: check.portal, owner: check.owner, scopes: check.scopes, verifiedAt: new Date().toISOString() },
    });
    setSetupStage("account");
  });
  return { installToken, portal: check.portal, owner: check.owner, scopes };
}

function validGrant(installToken: string): InstallGrant {
  const grant = getInstallGrant();
  if (!grant || !(Date.parse(grant.expiresAt) > Date.now()) || !safeEqual(hashToken(installToken), grant.tokenHash)) throw grantInvalid();
  return grant;
}

export async function createFirstAccount(input: CreateAccountInput): Promise<SessionDTO> {
  if (countUsers() > 0) throw alreadyInstalled();
  validGrant(input.installToken);
  const passwordHash = await hashPassword(input.password);
  const user = getDb().tx(() => {
    if (countUsers() > 0) throw alreadyInstalled();
    const grant = validGrant(input.installToken);
    setWebhookRecord(grant.webhook);
    const created = createUser({ name: input.name, email: input.email, passwordHash, role: "admin" });
    clearInstallGrant();
    setSetupStage("prepare");
    auditAs({ type: "user", id: created.id, name: created.name }, "Acesso de administrador criado na instalação", "user", created.id, `Portal ${grant.webhook.portal}`);
    return created;
  });
  return startSession(user);
}

export async function prepare(input: PrepareInput, actor: Actor): Promise<SetupStateDTO> {
  if (!getWebhookRecord()) throw new AppError("NOT_CONNECTED", "Conecte o Bitrix24 antes de preparar o Nexo.", 409);
  await prepareWorkspace(input, actor);
  return setupState();
}
