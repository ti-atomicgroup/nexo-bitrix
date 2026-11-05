/**
 * Matriz de papel × operação do Nexo: a única fonte do que cada papel pode fazer. O servidor aplica em toda rota com sessão
 * (src/server/http/handler.ts); a interface só a usa para esconder o que a pessoa não pode pedir. Publicada em docs/permissoes.md.
 *
 * `bitrix` diz até onde a operação chega, sempre com a conta dona do webhook (a conta técnica):
 * - none: fica no Nexo;
 * - read: lê do Bitrix24; para o RH, exige conta do Nexo ligada a uma pessoa ativa do portal;
 * - write: grava no Bitrix24 (agora ou pela fila); para o RH, exige também participar do projeto das tarefas.
 * A administração recebe o mandato sobre a conta técnica: é quem conecta o webhook e responde por ele.
 */
import type { AppRole } from "./enums";

export type BitrixReach = "none" | "read" | "write";

export interface OperationRule {
  roles: readonly AppRole[];
  bitrix: BitrixReach;
  /** Frase curta em pt-BR, usada na documentação e na tela de Equipe. */
  label: string;
}

const EVERYONE: readonly AppRole[] = ["admin", "rh"];
const ADMIN: readonly AppRole[] = ["admin"];

export const OPERATIONS = {
  "session.self": { roles: EVERYONE, bitrix: "none", label: "Ver a própria conta, trocar a senha e sair" },
  "today.read": { roles: EVERYONE, bitrix: "none", label: "Ver o painel de hoje" },
  "sync.run": { roles: EVERYONE, bitrix: "none", label: "Pedir uma sincronização (o ciclo roda de qualquer forma)" },
  "people.read": { roles: EVERYONE, bitrix: "none", label: "Buscar pessoas no cache local" },
  "people.refresh": { roles: EVERYONE, bitrix: "read", label: "Atualizar a lista de pessoas do Bitrix24" },
  "ledger.read": { roles: EVERYONE, bitrix: "none", label: "Ver o inventário de uma pessoa" },
  "ledger.add": { roles: EVERYONE, bitrix: "write", label: "Registrar item no inventário (pode entrar na tarefa de revogação)" },
  "ledger.waive": { roles: EVERYONE, bitrix: "none", label: "Dispensar item do inventário, com motivo" },
  "journey.read": { roles: EVERYONE, bitrix: "none", label: "Ver jornadas e simular uma nova" },
  "journey.create": { roles: EVERYONE, bitrix: "write", label: "Iniciar jornada (cria tarefas no projeto)" },
  "journey.manage": { roles: EVERYONE, bitrix: "write", label: "Pausar, retomar, cancelar ou concluir jornada" },
  "journey.link_person": { roles: EVERYONE, bitrix: "write", label: "Ligar a pessoa da jornada a uma conta que já existe no Bitrix24" },
  "journey.collaborator_link": { roles: EVERYONE, bitrix: "none", label: "Criar ou revogar o link pessoal do colaborador" },
  "journey.message": { roles: EVERYONE, bitrix: "write", label: "Enviar o link ou o lembrete pelo chat do Bitrix24" },
  "activity.act": { roles: EVERYONE, bitrix: "write", label: "Concluir, reabrir, aprovar, cobrar e rever documentos de atividades" },
  "template.read": { roles: EVERYONE, bitrix: "none", label: "Ver trilhas e a biblioteca de atividades" },
  "template.write": { roles: EVERYONE, bitrix: "none", label: "Criar, editar ou arquivar trilhas" },
  "detection.read": { roles: EVERYONE, bitrix: "none", label: "Ver uma contratação detectada no CRM" },
  "detection.act": { roles: EVERYONE, bitrix: "none", label: "Dispensar uma contratação detectada" },
  "trigger.read": { roles: EVERYONE, bitrix: "none", label: "Ver as automações do CRM" },
  "settings.read": { roles: EVERYONE, bitrix: "none", label: "Consultar os ajustes (webhook sempre mascarado)" },
  "person.invite": { roles: ADMIN, bitrix: "write", label: "Convidar pessoa para o Bitrix24 (cria conta no portal)" },
  "trigger.write": { roles: ADMIN, bitrix: "read", label: "Criar, editar ou excluir automações do CRM" },
  "crm.read": { roles: ADMIN, bitrix: "read", label: "Ler funis e etapas do CRM" },
  "settings.write": { roles: ADMIN, bitrix: "none", label: "Mudar empresa, responsáveis padrão, conteúdo, recursos e retenção" },
  "webhook.replace": { roles: ADMIN, bitrix: "read", label: "Trocar o webhook do Bitrix24" },
  "workspace.prepare": { roles: ADMIN, bitrix: "write", label: "Preparar o Nexo (cria ou reaproveita o projeto no Bitrix24)" },
  "users.manage": { roles: ADMIN, bitrix: "none", label: "Criar, desativar e vincular acessos ao Nexo" },
  "diagnostics.read": { roles: ADMIN, bitrix: "read", label: "Ver o diagnóstico técnico e testar a saída até o Bitrix24" },
  "audit.read": { roles: ADMIN, bitrix: "none", label: "Ver o registro de atividades de todo o Nexo" },
  "privacy.manage": { roles: ADMIN, bitrix: "none", label: "Exportar ou excluir os dados de uma pessoa" },
  "backup.download": { roles: ADMIN, bitrix: "none", label: "Baixar a cópia de segurança cifrada" },
} as const satisfies Record<string, OperationRule>;

export type Operation = keyof typeof OPERATIONS;

export function operationRule(operation: Operation): OperationRule {
  return OPERATIONS[operation];
}

export function can(role: AppRole, operation: Operation): boolean {
  return operationRule(operation).roles.includes(role);
}
