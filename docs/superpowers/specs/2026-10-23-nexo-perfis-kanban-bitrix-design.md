# Nexo — modelos por perfil e Kanban de tarefas Bitrix

**Estado:** direção aprovada pelo usuário em 23/10/2026; aguardando revisão desta especificação antes do plano de implementação.

## Problema e resultado

O Nexo já permite configurar etapas, atividades, prazos relativos, responsáveis, checklists e materiais, e cria tarefas nativas no Bitrix24. Também consulta novamente status, prazo, responsável e checklist das tarefas. Hoje, porém, os modelos não distinguem o perfil profissional de quem está entrando, as tarefas não são agrupadas num projeto RH com Kanban e eventos de tarefa não atualizam diretamente a atividade correspondente.

O resultado desejado é permitir que People configure modelos diferentes por perfil — como RH, Vendas ou TI —, escolha o modelo adequado ao abrir uma jornada e acompanhe as atividades no Kanban nativo do projeto Bitrix. O Bitrix permanece a referência operacional das tarefas; o Nexo mantém o contexto da jornada e reflete as alterações dos dois lados.

## Decisões de produto

- Usar o Kanban nativo de tarefas do Bitrix como quadro central, sem duplicar o quadro no Nexo.
- Criar um único projeto privado dedicado ao RH, chamado inicialmente **Nexo · RH**, para receber as tarefas de onboarding e offboarding. O nome será configurável.
- Manter o acesso ao Kanban restrito aos usuários de RH autorizados. Gestores, TI e colaboradores recebem acesso às tarefas que lhes forem atribuídas, sem serem incluídos automaticamente no quadro completo.
- Permitir ao RH criar modelos de onboarding com um perfil de destino de texto livre, como “RH”, “Vendedor” ou “Liderança”. Ao abrir uma jornada manual, o RH escolhe o modelo; cargo e departamento do usuário Bitrix aparecem como contexto, sem seleção automática.
- As regras de aprovação automática existentes continuam apontando diretamente para um modelo específico.
- Cada jornada guarda a versão do modelo usada na criação. Alterar ou arquivar um modelo não modifica jornadas em andamento.
- Cada atividade, incluindo entrevista e sessões 1:1 em momentos diferentes, é uma tarefa própria no Bitrix. O prazo é informado como deslocamento em dias corridos ou úteis em relação à data principal da jornada.
- A fonte oficial para status, etapa do Kanban, responsável, prazo e checklist das tarefas é o Bitrix. O Nexo também pode solicitar ações operacionais existentes, como iniciar/concluir tarefa e concluir itens de checklist, sempre gravando no Bitrix.
- Continuar no modo webhook-only. O evento `ONTASKUPDATE` será cadastrado no painel de webhook de saída do Bitrix e validado no handler Nexo. O webhook de entrada não pode chamar `event.bind`; essa limitação está documentada pelo Bitrix.

## Experiência de configuração

### Projeto RH e conexão

Na configuração administrativa, o Nexo apresenta o projeto conectado, o status do webhook, o link do Kanban e a última sincronização. Na primeira configuração, o assistente poderá criar o projeto privado **Nexo · RH** com a conta do webhook e registrar seu ID no Nexo. A criação depende do escopo `sonet` e da permissão efetiva da conta para criar projetos. O escopo `task` continua necessário para tarefas e Kanban; `crm` e `user_brief` permanecem para movimentações e pessoas.

O assistente valida acesso às etapas do Kanban. O RH decide quem tem acesso ao quadro. Pessoas com acesso somente a tarefas recebem links diretos; o sistema não as adiciona ao projeto sem configuração explícita. Se o portal não permitir a criação ou a leitura do projeto, o Nexo apresenta a falha e orienta o administrador a corrigir permissões, sem iniciar tarefas sem vínculo.

### Modelos por perfil

O editor de modelos apresenta campos de tipo de jornada, nome, perfil de destino e descrição, além das etapas e atividades já existentes. O perfil é texto controlado pelo RH, em vez de uma lista fixa de profissões, para acompanhar a estrutura de cada empresa. A lista de modelos pode ser filtrada por onboarding, offboarding e perfil.

Para cada atividade, o RH define título, orientação, papel responsável, deslocamento e unidade do prazo, obrigatoriedade, criticidade, visibilidade, checklist e materiais. Múltiplas atividades podem representar uma sequência de 1:1 — por exemplo, “1:1 de primeira semana” em +7 dias e “1:1 de 30 dias” em +30 dias. As etapas agrupam o trabalho no modelo; os prazos continuam sendo relativos à data principal, conforme o contrato atual.

Na abertura manual, o RH seleciona colaborador, data, tipo de jornada e modelo compatível. O cargo e departamento recebidos do Bitrix ficam visíveis para conferência. A tela mostra quantidade de etapas, atividades e responsáveis antes de iniciar. A abertura automática continua usando o modelo associado à regra de aprovação configurada.

## Integração e passagem de dados

Ao iniciar uma jornada, o Nexo cria ou vincula a movimentação do processo de pessoas, e cria cada atividade como tarefa Bitrix no `GROUP_ID` do projeto RH. Cada tarefa mantém ligação com o item CRM e marcador idempotente da atividade Nexo. O checklist e os materiais definidos no modelo acompanham a tarefa; a URL da tarefa original fica disponível na jornada.

Ao receber `ONTASKUPDATE`, o handler valida o token e o domínio, lê o ID da tarefa do payload e enfileira uma atualização direcionada. O worker localiza a atividade pelo vínculo `bitrixTaskId`, lê a tarefa, seu responsável, prazo, status e checklist no Bitrix e, quando aplicável, a etapa do Kanban do grupo. A mudança de coluna é refletida como etapa Kanban separada do status de execução, pois são conceitos distintos no Bitrix. A conciliação periódica de 60 segundos permanece como recuperação de evento perdido ou indisponibilidade.

Ao editar uma atividade antes da abertura, o RH altera o modelo no Nexo; novas jornadas usam a versão mais recente. Depois da abertura, mudanças operacionais devem ser feitas na tarefa Bitrix ou por uma ação suportada no Nexo que grava imediatamente no Bitrix e atualiza o contexto local. Não se aplicam silenciosamente mudanças de modelo a tarefas existentes.

Eventos repetidos e atualizações originadas pelo próprio Nexo são idempotentes: o evento apenas agenda uma leitura do estado atual, não cria nem duplica tarefas. Evento de exclusão de tarefa marca a atividade como requerendo atenção e cria uma pendência para RH; não recria a tarefa automaticamente, pois uma exclusão pode ser intencional. Operações com resposta incerta passam pela conciliação do marcador existente antes de qualquer nova criação.

## Acesso e privacidade

O projeto RH será privado, e apenas usuários autorizados de RH poderão abrir e mover cartões no seu Kanban. O Nexo não adicionará gestores, TI ou colaboradores ao projeto automaticamente; cada pessoa recebe acesso direto às tarefas que lhe forem atribuídas, conforme as permissões do Bitrix. Responsáveis não-RH atualizam suas tarefas pelo Bitrix ou pelo Nexo; a posição do cartão no Kanban fica sob operação de RH. Se um responsável precisar de acesso ao quadro, o Nexo explica que a associação ao projeto pode ampliar a visibilidade para outras tarefas e exige autorização explícita do administrador.

Os dados operacionais sensíveis, como justificativas internas de desligamento ou anotações da entrevista de saída, não devem ser copiados para o título ou descrição da tarefa. Cada tarefa contém somente informação suficiente para executar a atividade, de acordo com sua visibilidade.

## Erros e estados

- Escopo `sonet` ausente ou falta de permissão para criar o projeto: impedir provisionamento e mostrar o requisito que falta.
- Projeto removido, arquivado ou inacessível: pausar criação de novas tarefas, manter jornadas existentes e registrar pendência de configuração.
- Tarefa sem evento, com falha temporária ou limitação de API: manter a última informação confirmada e a indicação de sincronização pendente; conciliação tenta novamente.
- Tarefa excluída: sinalizar atividade sem vínculo e exigir decisão de RH antes de criar substituta.
- Responsável sem acesso ao item: preservar a tarefa e apontar falta de permissão, sem expor outras atividades da jornada.
- Campo, etapa, tarefa ou checklist com resposta não reconhecida: não inferir conclusão; manter a atividade pendente e registrar erro legível.

## Validação e aceite

1. Criar, editar, duplicar e versionar modelos de perfis diferentes, incluindo várias entrevistas/1:1 com deslocamentos distintos e responsáveis configuráveis.
2. Confirmar que RH escolhe o modelo na abertura manual e que a regra de aprovação automática seleciona seu modelo configurado.
3. Confirmar a criação de tarefa real no projeto RH com link CRM, prazo, responsável e checklist corretos.
4. Mover uma tarefa entre colunas do Kanban Bitrix e alterar status, prazo, responsável e checklist; confirmar que a jornada Nexo atualiza a mesma atividade.
5. Alterar status ou checklist pelo Nexo e confirmar a gravação no Bitrix sem ciclo de eventos nem duplicação.
6. Repetir evento e simular evento perdido, webhook indisponível, reinício do worker, projeto inacessível, exclusão de tarefa e permissão insuficiente.
7. Verificar privacidade: RH visualiza e opera o Kanban; cada perfil não-RH acessa apenas tarefas que lhe foram atribuídas e permitidas, sem ser associado automaticamente ao projeto.
8. Executar testes de domínio e API, validação de tipos, lint, build e testes de navegador nas telas de modelos, abertura de jornada, projeto e detalhe da tarefa.

## Delimitação

Esta especificação cobre modelos de onboarding por perfil e tarefas nativas organizadas no projeto/Kanban privado do Bitrix, com atualização bidirecional entre a execução operacional do Bitrix e o contexto Nexo. Não inclui Kanban duplicado no Nexo, criação automática de usuários em outros serviços, revogação efetiva de acessos externos, nem sincronização de mudanças de modelo para jornadas ativas.

## Referências oficiais

- [Bitrix24 — OnTaskUpdate](https://apidocs.bitrix24.com/api-reference/tasks/events-tasks/on-task-update.html)
- [Bitrix24 — Eventos de tarefas](https://apidocs.bitrix24.com/api-reference/tasks/events-tasks/index.html)
- [Bitrix24 — Criar tarefa](https://apidocs.bitrix24.com/api-reference/tasks/tasks-task-add.html)
- [Bitrix24 — Criar projeto ou grupo](https://apidocs.bitrix24.com/api-reference/sonet-group/sonet-group-create.html)
- [Bitrix24 — Etapas do Kanban de tarefas](https://apidocs.bitrix24.com/api-reference/tasks/stages/index.html)
- [Bitrix24 — event.bind](https://apidocs.bitrix24.com/api-reference/events/event-bind.html)
