# Nexo RH — Central de exceções

**Estado:** direção de produto e experiência aprovada por conversa em 23/10/2026; especificação pronta para revisão antes da implementação.

## Problema e resultado

A home atual resume jornadas com indicadores e blocos semelhantes a painéis SaaS genéricos. Para quem lidera RH, o trabalho começa por identificar onde uma pessoa, uma data ou um controle obrigatório corre risco e decidir qual intervenção destrava o processo.

A home deve responder, numa olhada: **o que exige ação humana agora, por que entrou primeiro e qual é a próxima ação?** O produto continua sendo a superfície operacional do Nexo; Bitrix24 continua sendo a origem das movimentações, tarefas, checklists e pessoas.

## Usuários e contexto

- RH e People coordenam todas as atividades de RH nas jornadas ativas, inclusive as atribuídas a outros membros autorizados da área.
- Gestores e executores precisam identificar suas próprias responsabilidades sem receber contexto interno de RH que não lhes cabe.
- O app roda em navegador e dentro do espaço limitado do Bitrix24, conectado ao portal por webhooks.
- O processo lida com momentos pessoais sensíveis. A interface deve combinar rastreabilidade e controle com linguagem respeitosa.

## Direção visual e tese

**Nexo é uma lente de priorização:** uma fila viva de trabalho real ocupa a superfície principal e um inspetor lateral explica o contexto da tarefa selecionada. A sensação de uma LLM em trabalho aparece na sequência contexto → prioridade explicada → ação. O Nexo não afirma ter um modelo de IA nem inventa recomendações; as explicações são calculadas a partir dos dados e regras existentes.

Preservar as cores já aprovadas: superfícies claras, grafite, verde esmeralda e cores semânticas atuais para prazo e risco. A personalidade vem da composição e do ritmo, não de trocar a paleta. Uma trama de sinal/linhas pode visualizar grupos reais de trabalho e seus totais; cada marca precisa corresponder a uma atividade ou faixa de prazo e também ter uma representação textual acessível.

## Estrutura da home de RH

1. **Orientação imediata:** título curto de trabalho, data no fuso do portal e estado/horário da última sincronização.
2. **Próxima intervenção:** uma atividade prioritária real com pessoa, movimento (entrada/saída), prazo, responsável e a razão objetiva da prioridade. A ação principal abre a atividade no Nexo; o link secundário abre a tarefa original no Bitrix quando disponível.
3. **Faixas de atenção:** tarefas de RH atrasadas e para hoje em primeiro plano, seguidas de itens críticos/próximos já identificados pelo Radar. Os totais são calculados dos registros presentes; não exibir números demonstrativos em produção.
4. **Fila operacional:** agrupamento compacto e ordenado, com busca/filtros e estado de sincronização. Uma tarefa aguardando aprovação permanece pendente. Responsável ausente, falha de sincronização e estado desconhecido ficam explícitos.
5. **Inspetor de contexto:** pessoa, modelo e versão, etapa, data principal, progresso, responsável, prazo, checklist e motivo para atenção, respeitando a visibilidade da atividade e as permissões atuais.

O atalho de busca/comandos existente permanece como forma rápida de navegar ou encontrar pessoas. Não adicionar um campo de chat que sugira interação com uma IA real.

## Sistema visual entre telas

Redesenhar o shell e aplicar a mesma linguagem às jornadas, tarefas, modelos, automações e configurações: navegação compacta; tipografia hierárquica e legível; linhas e espaços para separar grupos; módulos de alto contraste apenas para a ação em foco; estados semânticos consistentes. Remover a dependência de mosaicos de cartões para comunicar a hierarquia. Formulários, modais, links nativos e estados funcionais existentes permanecem reconhecíveis.

No Bitrix estreito e em celular, a coluna de contexto passa abaixo da fila, a navegação recolhe pelo controle móvel existente e nenhuma ação crítica depende de hover. A tabela/lista preserva nome da pessoa, tarefa, prazo, responsável e estado sem exigir rolagem horizontal quando houver largura suficiente para reflow.

## Dados, prioridade e privacidade

- Reusar `Workspace`, `Journey`, `JourneyTask`, `RadarAlert`, regras de criticidade e estado de sincronização já entregues ao cliente; não criar uma segunda fonte de verdade na UI.
- Manter as regras existentes para RH devido/atrasado, Radar e prazo de TI nas próximas 48 horas. A UI não reclassifica atividade como risco sem o campo/regra de domínio correspondente.
- Explicações citam evidência específica, como tarefa crítica vencida, prazo nas próximas 48 horas, responsável ausente ou sincronização incerta. Não declarar que um item bloqueia conclusão sem verificar a obrigatoriedade real.
- Dados e documentos com visibilidade `hr`, `team` ou `employee` continuam sujeitos à filtragem atual por papel; o inspetor não amplia acesso.
- Atualização atrasada ou integração incerta aparece como dado desatualizado/pendente, sem aparentar que a automação foi concluída.

## Interações e movimento

- Selecionar uma linha atualiza o contexto e mantém uma ação direta para abrir a tarefa existente.
- Marcas de sinal, se usadas, são interativas somente quando levam ao grupo/tarefa correspondente; caso contrário, são removidas.
- Transições curtas organizam a troca de item e a abertura do inspetor. Respeitar `prefers-reduced-motion`; não usar estrobo, pulsação contínua ou animação para simular pensamento.
- Loading mantém os títulos e mostra esqueleto discreto; lista vazia explica o estado e oferece a ação existente de criar jornada; falhas permitem atualizar e mantêm a última informação com seu estado de desatualização.

## Escopo e limites

Esta entrega substitui a hierarquia visual genérica do app, começando pela home de RH e pela navegação compartilhada. Ela preserva fluxos, contratos, regras, modais, papéis e operações Bitrix existentes. Não adiciona IA generativa, novas regras de risco, integrações externas nem automações de negócio.

## Validação da implementação

- Comparar home de RH, jornadas, configurações e detalhe com dados de teste, em viewport desktop e estreito de Bitrix/mobile.
- Confirmar que a primeira tela distingue ação prioritária, motivo, pessoa, prazo e próximo passo em poucos segundos.
- Confirmar que tarefas RH continuam incluindo todas as jornadas ativas, mesmo quando atribuídas a outra pessoa de RH.
- Validar link Bitrix, abertura do detalhe, filtros, estados de sincronização e controle de visibilidade por papel.
- Verificar foco de teclado, labels acessíveis, contraste, ausência de overflow e preferência de movimento reduzido.
- Rodar typecheck, lint, testes relevantes e build. Usar dados sintéticos claramente identificados nos testes; nunca simular integração real.
