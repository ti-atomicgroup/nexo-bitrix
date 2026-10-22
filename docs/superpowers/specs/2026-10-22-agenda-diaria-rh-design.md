# Agenda diária de RH

## Problema

A visão geral do Nexo prioriza alertas de tarefas de TI. As atividades da própria pessoa de RH ficam em outra área, obrigando-a a procurar o que precisa fazer hoje entre as jornadas.

## Comportamento proposto

Na página inicial, acima dos demais painéis, exibir “Atividades de RH para hoje” para sessões com papel de RH ou administração. A agenda reúne todas as atividades pendentes com `assigneeRole === "rh"` nas jornadas em andamento (`active` ou `creating`), mesmo quando a pessoa responsável é outra usuária, e inclui atividades com prazo vencido ou cuja data local corresponda ao dia atual, usando o fuso horário configurado no portal. Atividades concluídas e jornadas canceladas ou concluídas não aparecem.

Agrupar itens em “Atrasadas” e “Para hoje”. Dentro de cada grupo, ordenar primeiro as atividades críticas e depois pelo prazo mais próximo. Cada linha identifica a atividade, o colaborador, a etapa, o horário limite e o estado de sincronização. O botão principal abre a jornada já selecionando essa atividade, onde RH pode consultar materiais, seguir o checklist, iniciar ou concluir a tarefa e abrir o Bitrix24.

O cabeçalho mostra contagens de atrasadas e para hoje. Cada linha identifica a pessoa responsável. Quando não houver itens, mostrar um estado simples “Tudo em dia”. Incluir um link para “Ver jornadas” para consultar atividades mais adiante. A lista usa somente as jornadas e tarefas já visíveis para a sessão; não adiciona acesso a dados de outros usuários.

## Interface e acessibilidade

Manter a identidade visual atual do Nexo: superfície clara, grafite e verde esmeralda, com âmbar e vermelho apenas para prazos. Reutilizar padrões existentes de status, botões, tipografia e links para jornada/Bitrix. A seção deve ser responsiva, operável por teclado, ter foco visível e anunciar atualização/contagens sem depender apenas de cor.

## Fora de escopo

- Mostrar atividades com prazo futuro posterior ao dia atual.
- Incluir tarefas de outros papéis na agenda pessoal.
- Alterar prazos, atribuições, checklists, notificações ou regras de sincronização.
- Criar um novo calendário ou duplicar as funções de “Minhas tarefas”.

## Validação

Conferir que a agenda prioriza atrasos e itens de hoje no fuso configurado, inclui todas as atividades de RH das jornadas ativas, omite itens concluídos e abre a atividade selecionada. Conferir também o layout em desktop e telas estreitas. Executar verificações de tipos, lint e build.
