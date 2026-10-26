import "server-only";
import type { UserRef } from "@/shared/contracts";
import { PARTICIPANT_ROLES, type ParticipantRole } from "@/shared/enums";
import type { PrepareInput } from "@/shared/schemas";
import { checkWebhook, createPrivateProject, findGroupByName } from "../bitrix/methods";
import { normalizeWebhookUrl, parseWebhookUrl } from "../bitrix/webhook-url";
import { audit } from "../db/repos/audit";
import { findPersonByBitrixId } from "../db/repos/people";
import { getDefaults, getWebhookRecord, setCompany, setDefaults, setProject, setSetupStage } from "../db/repos/settings";
import { countTemplates, createTemplate } from "../db/repos/templates";
import { isValidTimezone } from "../domain/dates";
import { AppError } from "../errors";
import { encrypt } from "../security/crypto";
import { starterTemplates } from "../seeds/templates";
import { refreshPeople } from "./people";
import { createRuntimeClient, requireBitrix } from "./runtime";
import { kick } from "./scheduler";
import type { Actor, WebhookCheck } from "./types";

const PREPARE_KEY = Symbol.for("nexo.prepare");
const PROJECT_DESCRIPTION = "Tarefas de entrada e saída de pessoas geridas pelo Nexo. Projeto privado: só quem participa vê as tarefas.";
const ROLE_NAME: Record<ParticipantRole, string> = { rh: "RH", gestor: "gestor", ti: "TI", buddy: "buddy" };

type PrepareGlobal = typeof globalThis & { [PREPARE_KEY]?: boolean };

/** Valida o formato do URL, chama `user.current` e `scope` no Bitrix e devolve o dono, os escopos e o URL cifrado. Não grava nada. */
export async function verifyWebhook(url: string): Promise<WebhookCheck> {
  const credentials = parseWebhookUrl(url);
  const { owner, scopes } = await checkWebhook(createRuntimeClient(credentials));
  return { portal: credentials.portal, owner, scopes, encryptedUrl: encrypt(normalizeWebhookUrl(credentials)) };
}

/**
 * Passo 3 da instalação: atualiza o cache de pessoas, procura (pelo nome) ou cria o projeto privado, carrega as trilhas
 * iniciais se ainda não houver trilhas, grava empresa, fuso e responsáveis padrão e marca a instalação como pronta.
 */
export async function prepareWorkspace(input: PrepareInput, actor: Actor): Promise<void> {
  const record = getWebhookRecord();
  if (!record) throw new AppError("NOT_CONNECTED", "Conecte o Bitrix24 antes de preparar o Nexo.", 409);
  if (!isValidTimezone(input.timezone)) throw new AppError("TIMEZONE_INVALID", "Escolha um fuso horário válido (ex.: America/Sao_Paulo).", 422);
  const global = globalThis as PrepareGlobal;
  // Dois cliques em "Preparar" não podem criar dois projetos.
  if (global[PREPARE_KEY]) throw new AppError("PREPARE_RUNNING", "A preparação já está em andamento. Aguarde alguns segundos.", 409);
  global[PREPARE_KEY] = true;
  try {
    const client = requireBitrix();
    const peopleCount = await refreshPeople();
    const projectName = input.projectName.trim();
    const existing = await findGroupByName(client, projectName);
    const projectId = existing?.id ?? (await createPrivateProject(client, { name: projectName, description: PROJECT_DESCRIPTION }));
    setProject({ id: projectId, name: projectName, url: `${record.portal}/workgroups/group/${projectId}/` });
    let seeded = 0;
    if (countTemplates() === 0) {
      for (const template of starterTemplates()) createTemplate(template);
      seeded = starterTemplates().length;
    }
    setCompany({ name: input.companyName.trim(), timezone: input.timezone });
    const defaults: Partial<Record<ParticipantRole, UserRef>> = { ...getDefaults() };
    for (const role of PARTICIPANT_ROLES) {
      const id = input.defaults[role];
      if (!id) continue;
      const person = findPersonByBitrixId(id);
      if (!person) throw new AppError("PARTICIPANT_NOT_FOUND", `Não encontramos a pessoa escolhida como ${ROLE_NAME[role]} entre os usuários do Bitrix24.`, 422);
      defaults[role] = { bitrixUserId: id, name: person.name, position: person.position };
    }
    setDefaults(defaults);
    setSetupStage("ready");
    audit({
      actorType: actor.type,
      actorId: actor.id,
      actorName: actor.name,
      action: "Nexo preparado",
      entity: "settings",
      detail: {
        text: `${existing ? "Projeto encontrado" : "Projeto criado"} no Bitrix24: “${projectName}”. ${peopleCount} pessoas carregadas${seeded ? `, ${seeded} trilhas iniciais` : ""}.`,
      },
    });
  } finally {
    global[PREPARE_KEY] = false;
  }
  kick();
}
