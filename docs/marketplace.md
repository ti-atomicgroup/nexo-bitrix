# Materiais para publicação

## Nome

Nexo — Onboarding e Offboarding

## Descrição curta

Organize entradas e saídas no Bitrix24 com modelos, tarefas e checklists automáticos. Acompanhe responsáveis, prazos e pendências em um Radar de Prontidão para integrar RH, gestores e TI.

## Descrição completa

O Nexo organiza os processos de entrada e saída de colaboradores na Onnira Cloud IA, conectado ao Bitrix24. Configure modelos com etapas, checklists, orientações e prazos; depois, inicie a jornada pelo RH ou por uma aprovação em um processo personalizado do portal.

Cada atividade se transforma em uma tarefa nativa com responsável e prazo. O progresso é acompanhado em uma central de jornadas e no Radar de Prontidão, que explica quais pendências exigem atenção antes da admissão ou do desligamento.

No onboarding, reúna preparação, orientações, materiais e atividades de integração. No offboarding, coordene passagem de conhecimento, devolução de equipamentos, encerramento de atividades e solicitações de revogação de acessos.

O aplicativo usa as permissões da conta Bitrix24 que criou o webhook e protege a credencial no servidor. Cada cliente conecta seu portal pelo assistente do Nexo e configura os responsáveis. As contas RH do Nexo controlam o acesso à interface enquanto a integração de identidade do Marketplace não estiver disponível.

## Requisitos e instalação

Portal Bitrix24 Cloud com API REST e conta RH autorizada a criar um webhook de entrada. A aplicação é hospedada pela Onnira com Node.js/Next.js e diretório persistente para SQLite. Uma empresa e um portal por instalação. A submissão ao catálogo exige instruções e acesso de publicador da Onnira. O roteiro completo está no manual.

## Segurança e suporte

Consulte `docs/seguranca.md`. O administrador da instalação é o contato inicial de suporte e deve informar um canal de atendimento próprio antes da publicação no Marketplace. A organização responsável pela publicação deve preencher esse contato; não há e-mail de suporte inventado no produto.

## Até cinco imagens

Capturas locais previstas: central, detalhes da jornada, modelos, automações e assistente de instalação em `output/playwright`. As capturas automatizadas usam dados fictícios e são referências de interface. Antes da publicação, produza ou revise as imagens da versão homologada na Onnira, mantendo apenas dados fictícios visíveis.
