# Modelo de permissões

## Duas camadas

O Nexo fala com o Bitrix24 por **um webhook de entrada**: todas as chamadas saem com a conta dona dele, a **conta técnica**. O Bitrix24 só vê essa conta.
Quem fez o pedido dentro do Nexo é controlado pelo próprio Nexo, no servidor:

1. **Matriz de papel × operação** (tabela abaixo). Toda rota com sessão declara a operação que executa, e o servidor recusa com 403 o que o papel não pode.
   A fonte é `src/shared/permissions.ts`. Um teste garante que esta página, a tabela da API e as rotas batem com ela.
   Quem está com senha temporária, seja qual for o papel, só consegue ver a própria conta, trocar a senha e sair: as demais rotas respondem 403 (`PASSWORD_CHANGE_REQUIRED`) até a troca.
2. **Validação equivalente às permissões individuais do Bitrix24.** Antes de uma operação de quem é **RH** chegar ao portal, o servidor confere:
   - o acesso ao Nexo está ligado a uma pessoa do portal. O vínculo é automático quando exatamente uma pessoa ativa tem o mesmo e-mail; a administração também pode vincular em Ajustes → Equipe;
   - a conta dessa pessoa está ativa no Bitrix24, com consulta ao próprio portal;
   - para **gravar**, ela participa do projeto privado das tarefas (dono, moderador ou membro), pelo método `sonet_group.user.get`.

   A resposta do portal vale por até 5 minutos. Com o Bitrix24 fora do ar, vale a última conhecida; sem nenhuma, o Nexo recusa a escrita em vez de presumir.

## O que isso garante, e o que não garante

- Alguém do RH com conta desativada, ou fora do projeto, não aciona o Bitrix24 pelo Nexo.
- Quem só tem conta no Nexo, sem pessoa no portal, não chega ao Bitrix24.
- Convidar pessoas (`user.add`) cria conta no portal com o privilégio da conta técnica, por isso é só da administração.
- **Não é** a permissão efetiva de cada pessoa em cada tarefa: quem participa do projeto age pelo Nexo mesmo que, no Bitrix24, não pudesse editar aquela tarefa específica. Chegar a esse nível exigiria OAuth por usuário, trocando o modelo de webhook. Para o RH, que acompanha todas as jornadas, participar do projeto é o critério adotado.
- **A administração tem mandato sobre a conta técnica:** é quem conecta o webhook e responde por ele. Não passa pela validação individual, e cada ação fica no histórico.

## Conta técnica de privilégio mínimo

Crie o webhook com uma conta dedicada, sem perfil de administrador do portal, só com os escopos de [escopos.md](escopos.md). O perfil de administrador só é necessário para convidar pessoas pelo Nexo.
Na instalação e em Ajustes → Conexão, o Nexo avisa quando a conta é administradora do portal ou quando o webhook tem escopos que ele não usa.

## Quem fez, e como quem

Cada linha do histórico guarda o ator local (a pessoa no Nexo), a conta dele no Bitrix24, se houver, e o **principal**: a conta técnica com que o Nexo agia naquele momento. A tela mostra os três.
No Bitrix24, as tarefas aparecem como criadas pela conta técnica; o histórico do Nexo é o que diz quem pediu.

## Matriz

| Operação | Administração | RH | Chega ao Bitrix24 | O que é |
|---|---|---|---|---|
| `session.self` | Sim | Sim | Não | Ver a própria conta, trocar a senha e sair |
| `today.read` | Sim | Sim | Não | Ver o painel de hoje |
| `sync.run` | Sim | Sim | Não | Pedir uma sincronização (o ciclo roda de qualquer forma) |
| `people.read` | Sim | Sim | Não | Buscar pessoas no cache local |
| `people.refresh` | Sim | Sim | Lê | Atualizar a lista de pessoas do Bitrix24 |
| `ledger.read` | Sim | Sim | Não | Ver o inventário de uma pessoa |
| `ledger.add` | Sim | Sim | Grava | Registrar item no inventário (pode entrar na tarefa de revogação) |
| `ledger.waive` | Sim | Sim | Não | Dispensar item do inventário, com motivo |
| `journey.read` | Sim | Sim | Não | Ver jornadas e simular uma nova |
| `journey.create` | Sim | Sim | Grava | Iniciar jornada (cria tarefas no projeto) |
| `journey.manage` | Sim | Sim | Grava | Pausar, retomar, cancelar ou concluir jornada |
| `journey.link_person` | Sim | Sim | Grava | Ligar a pessoa da jornada a uma conta que já existe no Bitrix24 |
| `journey.collaborator_link` | Sim | Sim | Não | Criar ou revogar o link pessoal do colaborador |
| `journey.message` | Sim | Sim | Grava | Enviar o link ou o lembrete pelo chat do Bitrix24 |
| `activity.act` | Sim | Sim | Grava | Concluir, reabrir, aprovar, cobrar e rever documentos de atividades |
| `template.read` | Sim | Sim | Não | Ver trilhas e a biblioteca de atividades |
| `template.write` | Sim | Sim | Não | Criar, editar ou arquivar trilhas |
| `detection.read` | Sim | Sim | Não | Ver uma contratação detectada no CRM |
| `detection.act` | Sim | Sim | Não | Dispensar uma contratação detectada |
| `trigger.read` | Sim | Sim | Não | Ver as automações do CRM |
| `settings.read` | Sim | Sim | Não | Consultar os ajustes (webhook sempre mascarado) |
| `person.invite` | Sim | Não | Grava | Convidar pessoa para o Bitrix24 (cria conta no portal) |
| `trigger.write` | Sim | Não | Lê | Criar, editar ou excluir automações do CRM |
| `crm.read` | Sim | Não | Lê | Ler funis e etapas do CRM |
| `settings.write` | Sim | Não | Não | Mudar empresa, responsáveis padrão, conteúdo, recursos e retenção |
| `webhook.replace` | Sim | Não | Lê | Trocar o webhook do Bitrix24 |
| `workspace.prepare` | Sim | Não | Grava | Preparar o Nexo (cria ou reaproveita o projeto no Bitrix24) |
| `users.manage` | Sim | Não | Não | Criar, desativar e vincular acessos ao Nexo |
| `diagnostics.read` | Sim | Não | Lê | Ver o diagnóstico técnico e testar a saída até o Bitrix24 |
| `audit.read` | Sim | Não | Não | Ver o registro de atividades de todo o Nexo |
| `privacy.manage` | Sim | Não | Não | Exportar ou excluir os dados de uma pessoa |
| `backup.download` | Sim | Não | Não | Baixar a cópia de segurança cifrada |

Rotas sem sessão: `/api/health` e `/health`, `/api/status`, `/api/probe`, `/api/auth/transport`, `/api/auth/login`, `/api/setup/connect`, `/api/setup/account` (token de instalação) e `/api/tasks/:id` (id aleatório de 256 bits). A rota interna `/api/jobs/tick` só aceita o token do worker.
