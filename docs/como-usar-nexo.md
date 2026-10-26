# Como usar o Nexo

O Nexo organiza as jornadas de entrada e saída e transforma cada atividade em uma tarefa no Bitrix24. O RH acompanha o processo; TI, gestores e responsáveis trabalham nas tarefas que recebem.

## O fluxo em quatro passos

1. **Prepare os modelos.** Em Modelos, escolha um onboarding ou offboarding e ajuste etapas, atividades, prazos e responsáveis. Um modelo de vendedor, por exemplo, pode incluir configuração de acessos pela TI, apresentação do produto e conversas 1:1 com o gestor.
2. **Abra a jornada.** Clique em **Nova jornada**, escolha entrada ou saída, a pessoa, a data principal e o modelo. Revise as atividades e escolha os responsáveis antes de iniciar. Para uma saída, use a data do último dia.
3. **Trabalhe no Bitrix.** O Nexo cria tarefas conforme as etapas são liberadas. A equipe pode executá-las no Kanban do projeto **Nexo · RH**. As mudanças de status, prazo, responsável e checklist são refletidas na jornada.
4. **Acompanhe e conclua.** Na página inicial, veja o trabalho de RH para hoje. Abra uma jornada para entender o progresso e resolver pendências. Atividades obrigatórias e itens críticos precisam terminar antes de encerrar a jornada.

## O que cada papel faz

- **RH:** abre jornadas, escolhe e revisa modelos, acompanha pendências e coordena responsáveis.
- **TI:** recebe tarefas de criação ou revogação de acessos, equipamentos e registros. O modelo inicial prevê aviso três dias úteis antes da admissão e um dia útil antes do desligamento.
- **Gestor:** recebe tarefas de alinhamento, entrevista, 1:1 e transição.
- **Colaborador:** acompanha somente as etapas e materiais destinados a ele.

Em Configurações, você pode definir responsáveis padrão. Se deixar esses campos vazios, escolha os responsáveis ao abrir cada jornada. A tarefa da própria pessoa só recebe responsável quando o perfil Bitrix dela estiver vinculado.

## Entrada e saída

No onboarding, o RH escolhe o modelo adequado ao perfil. A primeira etapa liberada vira tarefa Bitrix; etapas futuras aguardam a data relativa ou a conclusão da etapa anterior, conforme o modelo.

No offboarding, o modelo pode incluir conversa final, entrevista de saída, passagem de conhecimento, devolução de equipamento, orientação sobre benefícios e solicitações de revogação de acesso. O Nexo acompanha e registra as tarefas; uma pessoa autorizada executa ações externas, como suspender uma conta Google.

## Início manual e automação

O jeito mais simples de começar é abrir a jornada manualmente no Nexo. O RH também pode configurar uma regra para abrir a jornada quando um candidato ou uma movimentação alcançar uma etapa específica do CRM ou de um Processo Inteligente.

O webhook de entrada permite ao Nexo criar e consultar tarefas no Bitrix em nome da conta RH. Para sincronizar alterações rapidamente, configure também o webhook de saída com a URL HTTPS pública do Nexo. Sem essa URL, a conciliação periódica procura mudanças nas regras e jornadas a cada minuto, quando a instância e o worker estão ativos; o início automático pode demorar até um minuto.

O portal já tem as regras para iniciar onboarding ou offboarding quando uma movimentação entra na etapa de aprovação do processo do Nexo. O quadro externo de vagas ainda precisa ser associado à coluna que significa “contratado”; essa regra depende do nome exato do quadro e da etapa usada pela equipe.

## Estado atual do portal de teste

O webhook de entrada está conectado e validado. O projeto privado **Nexo · RH** foi criado. O processo **Nexo · Movimentações de Pessoas** está configurado com campos de colaborador e data, etapas de aprovação e andamento e as etapas finais existentes do Bitrix. O assistente indica que o Nexo está pronto para abrir jornadas.

O webhook de saída está pendente porque o endereço local (`localhost`) não pode receber avisos do Bitrix. A entrada manual já está disponível, e as regras automáticas podem ser verificadas pela conciliação periódica local enquanto o Nexo e o worker estiverem ativos. Depois de publicar na Onnira, use a URL HTTPS pública exibida em Configurações para habilitar avisos em tempo real.

## Primeiro teste recomendado

Use uma pessoa fictícia e uma data futura. Inicie uma jornada manual, escolha os responsáveis, abra o Kanban **Nexo · RH**, confira título, responsável, prazo e checklist da tarefa, altere a tarefa no Bitrix e confirme o reflexo no Nexo. Repita com offboarding. Não use um desligamento real para validar a instalação.
