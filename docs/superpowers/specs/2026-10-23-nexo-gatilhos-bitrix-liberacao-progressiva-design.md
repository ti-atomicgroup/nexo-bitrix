# Nexo — gatilhos Bitrix e liberação progressiva de tarefas

## Objetivo

Iniciar jornadas de onboarding e offboarding a partir de um movimento aprovado em um Kanban de CRM ou Processo Inteligente do Bitrix24, mantendo também a abertura manual no Nexo. Criar tarefas no Kanban de RH somente quando a etapa configurada da jornada for liberada, para que o trabalho apareça no momento certo e o profissional consiga seguir uma sequência clara.

Esta especificação complementa `2026-10-22-webhook-only-bitrix-design.md` e `2026-10-23-nexo-perfis-kanban-bitrix-design.md`. Onde a especificação anterior disser que todas as tarefas são criadas ao iniciar uma jornada, passa a valer a liberação progressiva descrita aqui.

## Decisões

- A conexão continuará usando somente webhook REST de entrada e webhook de saída. OAuth e `event.bind` não serão necessários.
- RH poderá iniciar uma jornada manualmente no Nexo ou configurar uma regra automática para uma etapa de um funil CRM ou Processo Inteligente.
- A regra identifica o tipo e o ID da entidade/processo e a etapa de origem por configuração descoberta no portal. Nenhum ID de processo, funil, etapa, campo ou usuário ficará fixo no código.
- A regra seleciona o tipo da jornada e um modelo publicado. Uma regra de onboarding ou offboarding deve apontar para um modelo compatível.
- O Nexo só inicia a jornada automática depois de reler o registro atual no Bitrix e confirmar que a entidade e a etapa correspondem à regra. O evento de saída é um aviso para consultar o estado atual, não uma fonte autoritativa.
- Cada item de movimentação de RH do Bitrix pode iniciar no máximo uma jornada. Reentrega, duplicidade, reentrada na etapa e concorrência não criam uma segunda jornada para o mesmo item. Uma nova movimentação exige um novo item no processo de RH.
- Ao iniciar uma jornada, o Nexo grava o vínculo e o snapshot do modelo, mas não cria as tarefas futuras.
- RH configura a condição de liberação de cada etapa: em uma data relativa à data principal ou após a conclusão de todas as tarefas obrigatórias da etapa anterior. A primeira etapa pode ser liberada imediatamente ou por data relativa.
- Quando uma etapa é liberada, o Nexo cria suas tarefas Bitrix no projeto privado de RH e registra os vínculos. Etapas posteriores permanecem sem tarefas até sua própria condição ser satisfeita.
- O RH pode pausar ou cancelar uma jornada. Pausar impede liberações futuras e não altera tarefas existentes. Cancelar impede novas tarefas e preserva os registros já criados para auditoria.

## Experiência de configuração

Em **Configurações → Automações**, RH adiciona uma regra com estes passos:

1. Escolhe a origem: CRM ou Processo Inteligente.
2. Seleciona o tipo de entidade/processo e a etapa que representa a aprovação ou contratação. O Nexo lista os campos e etapas que consegue consultar no portal.
3. Escolhe onboarding ou offboarding e o modelo publicado correspondente.
4. Mapeia os dados necessários: pessoa/colaborador e data principal, além de cargo, departamento ou gestor se o modelo exigir esses dados.
5. Define uma ação para dados ausentes: criar uma pendência de configuração para RH, sem abrir a jornada nem criar tarefa incompleta.
6. Revisa uma amostra da regra e a habilita.

A tela lista a origem, a etapa de disparo, o modelo e o estado da última execução. Cada execução registra se iniciou uma jornada, aguardou correção, foi ignorada por não corresponder à regra ou falhou temporariamente; a pessoa de RH consegue abrir o registro original e resolver pendências.

Ao iniciar manualmente, RH seleciona pessoa, tipo, modelo e data principal como hoje. A mesma validação, cópia do modelo e máquina de etapas é usada nos dois modos.

## Modelo de etapas e tarefas

Cada etapa contém uma ou mais atividades configuradas no modelo. A atividade mantém título, orientação, responsável/papel, prazo, checklist, criticidade, visibilidade e materiais definidos pelo RH. A atividade só recebe um ID de tarefa Bitrix depois da liberação da etapa.

Condições suportadas para a etapa:

- **Por data:** liberar quando o deslocamento em dias corridos ou úteis em relação à data principal for atingido. Se a data já passou quando a jornada for iniciada ou retomada, liberar na próxima execução do worker.
- **Após a etapa anterior:** liberar quando todas as tarefas obrigatórias da etapa anterior estiverem concluídas no Bitrix. Atividades opcionais não bloqueiam a próxima etapa. Tarefa aguardando aprovação continua pendente até o Bitrix confirmar conclusão.
- **Imediata:** permitida para a primeira etapa e equivalente à liberação no início da jornada.

Uma etapa inteira é liberada em conjunto: todas as suas atividades configuradas viram tarefas ao mesmo tempo. O escopo não inclui dependências arbitrárias entre atividades da mesma etapa. Para obter uma sequência, RH separa atividades em etapas sucessivas.

Prazos das tarefas continuam sendo calculados a partir da data principal conforme o modelo. O Nexo não altera o prazo configurado quando uma etapa é liberada tarde; a tarefa é criada vencida, com essa condição visível para RH. A conciliação periódica de 60 segundos detecta etapas que se tornaram liberáveis mesmo quando um evento foi perdido.

## Fluxo de dados

1. Bitrix chama o handler de webhook de saída com o ID e tipo da entidade alterada.
2. O handler valida portal, token e formato, registra o recebimento de forma idempotente e coloca a consulta na fila persistida.
3. O worker consulta o registro atual pelo webhook REST de entrada e avalia as regras habilitadas. Para CRM, mudanças de etapa dentro do mesmo funil são observadas pelo evento de atualização; como o webhook de saída não fornece evento de mudança entre categorias/funis, a conciliação periódica também compara as fontes configuradas. Processo Inteligente usa o evento de atualização e a mesma conciliação de recuperação.
4. Quando a regra corresponde, o Nexo valida campos obrigatórios, cria/vincula a movimentação no processo de RH e reserva a chave única para a jornada. Dados ausentes criam uma pendência legível para RH, sem criar tarefas.
5. O motor de etapas avalia a primeira etapa liberável. Para cada atividade ainda sem tarefa, cria a tarefa no projeto RH com responsável, prazo, checklist, materiais e vínculo à jornada/registro original.
6. Eventos de tarefa e conciliação leem o estado atual no Bitrix. Quando todas as tarefas obrigatórias da etapa anterior estão confirmadas como concluídas, a etapa seguinte é liberada e suas tarefas são criadas.
7. Ao concluir a jornada, o Nexo atualiza a etapa do registro de RH. Essa atualização não inicia uma jornada nova.

Para evitar duplicidade em respostas incertas de `tasks.task.add`, o worker consulta o marcador estável da atividade/jornada no Bitrix antes de reenviar. Cada criação usa uma chave idempotente local única por atividade e jornada. Falhas de uma tarefa não impedem o registro das demais tarefas da etapa; a etapa só conta como liberada depois que todas as atividades previstas estão vinculadas ou explicitamente marcadas como falha para reparo.

## Dados de pessoa e permissões

Uma pessoa originada de CRM pode ainda não ter usuário Bitrix. O registro de origem e o perfil da pessoa ficam vinculados à jornada. RH pode vincular posteriormente o ID de usuário Bitrix antes de liberar uma etapa que dependa de um colaborador com conta. Tarefas que exigem esse usuário não são criadas sem vínculo; o Nexo apresenta uma pendência para RH. Atividades atribuídas a TI, gestor ou People podem ser liberadas se seus responsáveis estiverem configurados.

As permissões do webhook de entrada continuam sendo as da conta RH de serviço. O Nexo registra o usuário local que configurou/iniciou a regra e a conta de serviço que executou a operação. A interface aplica os papéis locais e não expõe dados internos de offboarding ao colaborador ou a responsáveis sem acesso.

## Tratamento de erros

- Evento duplicado: confirmar o estado atual e não duplicar jornada nem tarefas.
- Evento fora de ordem: reler estado atual; se a entidade já avançou para a etapa configurada, aplicar a regra uma vez.
- Dados obrigatórios ausentes: abrir pendência configurável para RH; nenhuma jornada/tarefa parcial é criada.
- Entidade removida ou inacessível: manter o recebimento como erro recuperável e mostrar a origem para RH.
- Bitrix indisponível, limite REST ou token inválido: manter a operação na fila persistida com tentativas controladas; credencial inválida pausa automações até correção.
- Criação de tarefa com resultado incerto: conciliar pelo marcador antes de reenviar.
- Jornada pausada/cancelada: não liberar novas etapas; manter tarefa existente e histórico.
- Tarefa excluída: marcar vínculo quebrado e pedir decisão de RH; não recriar automaticamente.

## Validação e aceite

1. RH configura regras para CRM e Processo Inteligente usando campos/etapas descobertos no portal; IDs não estão embutidos no código.
2. Evento válido relido no Bitrix cria uma única jornada com o modelo associado; evento duplicado ou concorrente não duplica jornada.
3. Registro em outra etapa, com campos obrigatórios ausentes ou referente a regra desativada não cria tarefas incompletas.
4. Início manual e automático usam o mesmo modelo versionado e o mesmo fluxo de liberação.
5. Iniciar a jornada cria somente as tarefas da primeira etapa liberada; tarefas de etapas futuras ainda não existem no Bitrix.
6. Etapa por data libera no momento configurado; etapa dependente libera somente após todas as tarefas obrigatórias anteriores serem concluídas no Bitrix.
7. Uma tarefa aguardando aprovação, em andamento ou com checklist obrigatório pendente não libera a etapa seguinte.
8. Falha parcial, evento perdido, indisponibilidade, expiração de token, reinício do worker e resposta incerta não geram duplicações; reconciliação retoma o trabalho.
9. Pausar/cancelar impede novas criações e preserva histórico; excluir uma tarefa não a recria sem ação explícita de RH.
10. Pessoa originada de CRM sem usuário Bitrix pode ser registrada; atividades que exigem a conta aguardam o vínculo e exibem uma pendência clara.
11. Offboarding segue o mesmo mecanismo, mantendo orientações sensíveis e motivos de saída restritos.

## Limites

Esta entrega cobre gatilhos de etapa em CRM/Processo Inteligente, abertura manual e liberação de tarefas por etapa em onboarding e offboarding. Não inclui conectar serviços externos para provisionar/revogar acessos, executar automaticamente tarefas humanas, avaliar candidatos, ou criar dependências arbitrárias entre tarefas dentro de uma etapa. O Kanban operacional permanece o Kanban de tarefas do projeto RH no Bitrix.

## Referências oficiais

- [Eventos de negócios CRM](https://apidocs.bitrix24.com/api-reference/crm/deals/events/index.html)
- [Eventos de itens de Processos Inteligentes](https://apidocs.bitrix24.com/api-reference/crm/universal/events/index.html)
- [ONCRMDEALUPDATE](https://apidocs.bitrix24.com/api-reference/crm/deals/events/on-crm-deal-update.html)
- [ONCRMDYNAMICITEMUPDATE](https://apidocs.bitrix24.com/api-reference/crm/universal/events/on-crm-dynamic-item-update.html)
- [Webhooks locais de entrada e saída](https://apidocs.bitrix24.com/local-integrations/local-webhooks.html)
- [Atualização de tarefa](https://apidocs.bitrix24.com/api-reference/tasks/events-tasks/on-task-update.html)
