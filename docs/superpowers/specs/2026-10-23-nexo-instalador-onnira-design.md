# Guia facilitado de instalação Onnira — Nexo

## Problema

Na primeira abertura, o Nexo mostra apenas os nomes das quatro variáveis de ambiente ausentes. Quem instala não sabe o que cada uma significa, onde configurá-las, como gerar os segredos ou por que precisa reiniciar o serviço.

## Direção aprovada

Transformar o bloqueio inicial em um passo a passo curto dentro do Nexo e atualizar o manual para acompanhar os mesmos passos. A tela explica que as variáveis pertencem ao serviço da Onnira, explica os quatro valores necessários, fornece um comando copiável para gerar os dois segredos localmente e deixa claro que a URL pública do app vem da publicação Onnira. Depois de salvar e reiniciar, a pessoa pode verificar novamente e prosseguir à conexão Bitrix já existente.

## Segurança e limites

- Nunca pedir ou aceitar as chaves de ambiente dentro do Nexo.
- Gerar segredos no computador do administrador usando Node.js, sem enviá-los ao navegador, ao chat ou ao repositório.
- Não tentar derivar a URL canônica do app de cabeçalhos ou da URL recebida pelo navegador.
- Não incluir API da Onnira, credenciais administrativas, novos escopos ou dependências.
- Manter os passos opcionais recolhidos/fora do fluxo inicial; esta mudança cobre somente os quatro pré-requisitos obrigatórios e a passagem ao webhook Bitrix.

## Experiência

Apresentar três passos numerados: adicionar variáveis na configuração da aplicação Onnira; copiar e executar um comando que imprime `NEXO_ENCRYPTION_KEY` e `NEXO_SETUP_TOKEN`; salvar, reiniciar e validar. Exibir o nome de cada variável acompanhado do significado e origem do valor, sem revelar segredos. O botão de verificação consulta o status existente. Um estado de sucesso leva naturalmente ao formulário já existente de conexão Bitrix. O manual repete as instruções e aponta para o armazenamento persistente.

## Verificação

Um teste de navegador confirma que o bloqueio mostra o guia, descreve os quatro nomes, oferece o comando copiável e mantém o formulário Bitrix oculto até os pré-requisitos serem aprovados. O manual deve ser revisado junto com a implementação; executar testes E2E, tipos, lint e build.
