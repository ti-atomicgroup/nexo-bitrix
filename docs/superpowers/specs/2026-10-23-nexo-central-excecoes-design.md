# Nexo RH — Central de exceções

**Estado:** direção simplificada aprovada pelo usuário em 23/10/2026; versão escrita atualizada e aguardando revisão final antes do plano.

## Problema e resultado

A home atual resume jornadas com indicadores e blocos semelhantes a painéis SaaS genéricos. Para quem lidera RH, o trabalho começa por identificar onde uma pessoa, uma data ou um controle obrigatório corre risco e decidir qual intervenção destrava o processo.

A home deve responder, numa olhada: **qual atividade devo fazer agora, para quem e até quando?** O produto continua sendo a superfície operacional do Nexo; Bitrix24 continua sendo a origem das movimentações, tarefas, checklists e pessoas. A pessoa que trabalha no processo não deve precisar interpretar vários painéis antes de agir.

## Usuários e contexto

- RH e People coordenam todas as atividades de RH nas jornadas ativas, inclusive as atribuídas a outros membros autorizados da área.
- Gestores e executores precisam identificar suas próprias responsabilidades sem receber contexto interno de RH que não lhes cabe.
- O app roda em navegador e dentro do espaço limitado do Bitrix24, conectado ao portal por webhooks.
- O processo lida com momentos pessoais sensíveis. A interface deve combinar rastreabilidade e controle com linguagem respeitosa.

## Direção visual e tese

**Nexo é a lista de trabalho que orienta a próxima ação:** uma atividade em foco e uma fila compacta das próximas responsabilidades ocupam a home. A sensação de uma LLM em trabalho aparece numa sequência simples: contexto necessário → prioridade compreensível → ação. O Nexo não afirma ter um modelo de IA nem inventa recomendações; as explicações são calculadas a partir dos dados e regras existentes.

Preservar as cores já aprovadas: superfícies claras, grafite, verde esmeralda e cores semânticas atuais para prazo e risco. A personalidade vem da leitura simples e do ritmo do trabalho. Cor só aparece para indicar localização, estado e urgência reais.

## Estrutura da home de RH

1. **Título de trabalho:** “Trabalho de hoje”, data no fuso do portal e ação de sincronização discreta. Mostrar estado de erro ou dado desatualizado com texto claro quando houver algo a resolver.
2. **Atividade em foco:** tarefa real que vem primeiro segundo as regras já existentes, com nome da pessoa, tipo de jornada, responsável e prazo. Mostrar o motivo apenas quando houver atraso, criticidade ou problema de sincronização. Uma ação principal abre a atividade; o link da tarefa Bitrix fica como ação secundária dentro do detalhe.
3. **Próximas atividades:** lista compacta de tarefas vencidas ou para hoje. Cada linha contém tarefa, pessoa, prazo e responsável. Busca e filtros aparecem como controles compactos e só quando houver volume que os justifique.

Radar, calendário de movimentações, histórico e tabela de jornadas completas ficam nas seções correspondentes, fora da home. O contexto completo da pessoa, etapa, modelo, checklist e movimentação aparece depois que o profissional abre a atividade. A home evita repetir os mesmos dados em painéis diferentes.

O atalho de busca/comandos existente permanece como forma rápida de navegar ou encontrar pessoas. Não adicionar um campo de chat que sugira interação com uma IA real.

## Sistema visual entre telas

Redesenhar o shell e aplicar a mesma linguagem às jornadas, tarefas, modelos, automações e configurações: navegação compacta; tipografia hierárquica e legível; linhas e espaços para separar grupos; uma ação principal por tela; estados semânticos consistentes. Remover a dependência de mosaicos de cartões e painéis simultâneos para comunicar a hierarquia. Mostrar primeiro os campos necessários ao trabalho e recolher configurações avançadas sob rótulos didáticos, com exemplos curtos. Formulários e detalhes devem conduzir uma tarefa por vez, com uma revisão clara antes de salvar ou iniciar. Links nativos e estados funcionais existentes permanecem reconhecíveis.

No Bitrix estreito e em celular, a lista mantém a mesma ordem e prioridade; a navegação recolhe pelo controle móvel existente e nenhuma ação crítica depende de hover. A tarefa, pessoa, prazo e ação ficam acessíveis sem rolagem horizontal.

## Dados, prioridade e privacidade

- Reusar `Workspace`, `Journey`, `JourneyTask`, `RadarAlert`, regras de criticidade e estado de sincronização já entregues ao cliente; não criar uma segunda fonte de verdade na UI.
- Manter as regras existentes para RH devido/atrasado, Radar e prazo de TI nas próximas 48 horas. A UI não reclassifica atividade como risco sem o campo/regra de domínio correspondente.
- Explicações citam evidência específica, como tarefa crítica vencida, prazo nas próximas 48 horas, responsável ausente ou sincronização incerta. Não declarar que um item bloqueia conclusão sem verificar a obrigatoriedade real.
- Dados e documentos com visibilidade `hr`, `team` ou `employee` continuam sujeitos à filtragem atual por papel; o inspetor não amplia acesso.
- Atualização atrasada ou integração incerta aparece como dado desatualizado/pendente, sem aparentar que a automação foi concluída.

## Interações e movimento

- Selecionar uma linha abre o detalhe da atividade, onde o profissional encontra checklist, instruções e acesso à tarefa Bitrix.
- Não adicionar gráficos ou marcas decorativas à home; cada elemento precisa ajudar a escolher ou avançar uma atividade.
- Transições curtas organizam a troca de item e a abertura do inspetor. Respeitar `prefers-reduced-motion`; não usar estrobo, pulsação contínua ou animação para simular pensamento.
- Loading mantém os títulos e mostra esqueleto discreto; lista vazia explica o estado e oferece a ação existente de criar jornada; falhas permitem atualizar e mantêm a última informação com seu estado de desatualização.

## Escopo e limites

Esta entrega simplifica a home de RH e a linguagem de jornadas, modelos e abertura de processo. Ela preserva contratos, regras, papéis e operações Bitrix existentes, enquanto torna os passos de configuração e abertura mais claros e recolhe opções avançadas. Não adiciona IA generativa, novas regras de risco nem automações de negócio.

## Validação da implementação

- Comparar home de RH, jornadas, configuração de modelos e detalhe com dados de teste, em viewport desktop e estreito de Bitrix/mobile.
- Confirmar que um profissional identifica em poucos segundos a tarefa em foco, a pessoa, o prazo e como avançar.
- Confirmar que Radar, calendário, histórico e tabela de jornadas completas não competem com as atividades na home e continuam acessíveis em suas seções próprias.
- Confirmar que configurações avançadas estão recolhidas e que os formulários explicam cada passo em linguagem direta.
- Confirmar que tarefas RH continuam incluindo todas as jornadas ativas, mesmo quando atribuídas a outra pessoa de RH.
- Validar link Bitrix, abertura do detalhe, filtros, estados de sincronização e controle de visibilidade por papel.
- Verificar foco de teclado, labels acessíveis, contraste, ausência de overflow e preferência de movimento reduzido.
- Rodar typecheck, lint, testes relevantes e build. Usar dados sintéticos claramente identificados nos testes; nunca simular integração real.
