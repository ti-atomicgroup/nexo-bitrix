# Nexo · Pessoas e processos

Onboarding e offboarding dentro do Bitrix24, com modelos configuráveis, tarefas e checklists nativos, início manual ou por aprovação de RH e Radar de Prontidão.

**Quer instalar?** Siga o [manual fácil de instalação](docs/manual-instalacao.md), que orienta a publicação na Onnira e a conexão por webhooks ao Bitrix24.

## Executar localmente

Requisitos: Node.js 22.13 ou superior (validado com Node 24), npm e um portal Bitrix24 Cloud com API REST e processos personalizados disponíveis.

```sh
npm ci
npm run dev
```

Abra http://localhost:3000. Sem credenciais, a aplicação apresenta o guia de instalação. Não há login fictício, modo de demonstração autenticado ou integração simulada no produto.

## Configurar o ambiente

Copie `.env.example` para `.env` e configure os valores abaixo. Para gerar um arquivo novo com chaves aleatórias, use:

```sh
npm run configure -- --portal https://sua-empresa.bitrix24.com.br --url https://seu-app-publicado
```

O comando não sobrescreve um `.env` existente nem imprime as chaves. No Windows, use `npm.cmd` se o PowerShell bloquear scripts npm.

| Variável              | Uso                                                                                             |
| --------------------- | ----------------------------------------------------------------------------------------------- |
| `NEXO_APP_URL`        | Origem HTTPS pública do app na Onnira, sem caminho. HTTP localhost é aceito no desenvolvimento. |
| `BITRIX_PORTAL_URL`   | Origem HTTPS do portal cloud autorizado, sem `/rest`, credenciais ou parâmetros.                |
| `NEXO_ENCRYPTION_KEY` | Chave de 32 bytes em 64 caracteres hexadecimais. Preserve-a ao atualizar/restaurar o app.       |
| `NEXO_SETUP_TOKEN`    | Segredo forte para autorizar a primeira instalação. O gerador usa 32 bytes aleatórios.          |
| `NEXO_DATA_DIR`       | Diretório persistente. Padrão local: `./data`; na Onnira, o volume detectado em `/app/.data`.   |
| `PORT`                | Porta HTTP. Padrão: `3000`.                                                                     |

O Nexo usa somente webhooks Bitrix24. A URL do webhook de entrada é armazenada criptografada no servidor; o token do webhook de saída também. Nunca publique esses valores em código ou repositórios.

## Conectar ao Bitrix24

1. Publique o Nexo em HTTPS na Onnira, configure as quatro variáveis obrigatórias e habilite o volume persistente.
2. No portal Bitrix24, entre com uma conta RH de serviço e crie um **webhook de entrada** em Aplicativos → Recursos do desenvolvedor → Webhooks. Conceda `task`, `user_brief` (ou `user`), `crm` e `userfieldconfig`. Dê à conta de serviço apenas as permissões necessárias para usuários, tarefas e processos de RH.
3. Abra a URL do Nexo. Cole a URL completa do webhook e o `NEXO_SETUP_TOKEN`; o Nexo testa a conexão e os escopos.
4. Crie o primeiro acesso local de administrador. O ID Bitrix vinculado precisa ser o mesmo da conta que criou o webhook, pois o Bitrix executa operações usando essa identidade.
5. Configure empresa, responsáveis e processo **Movimentações de Pessoas** (novo ou existente). Os campos e etapas são descobertos pela API REST.
6. Para inícios automáticos, cadastre no Bitrix um **webhook de saída** para `ONCRMDYNAMICITEMUPDATE`. Use o handler mostrado em Configurações → Conexão e cole no Nexo o token emitido no evento.
7. Revise modelos e regras de aprovação e conclua a configuração. A reconciliação periódica cobre eventos perdidos.

O Nexo fica hospedado na Onnira e é acessado pela URL do app. Webhooks Bitrix não oferecem interface nativa nem SSO. Contas locais do Nexo controlam quem pode acessar a tela; os IDs Bitrix vinculados são usados para selecionar colaboradores e responsáveis. As ações de integração sempre são realizadas pela conta que criou o webhook de entrada.

## Publicar na Onnira

```sh
npm run build
npm run package:onnira
```

Na Onnira Cloud AI, é possível informar a URL e a branch de um **repositório GitHub público**. A conexão direta com repositórios privados ainda aparece como indisponível na interface. Escolha a opção Next.js/React, diretório base `/`, e confira instalação `npm ci`, build `npm run build`, inicialização `npm start` e porta `3000`. Não publique segredos, bancos ou dados reais no Git.

Como alternativa, envie `output/nexo-onnira.zip` à Onnira Cloud AI. Na API da plataforma, use runtime **next** e os mesmos comandos. O pacote exclui `.env`, banco, credenciais, dependências e artefatos locais.

**Persistência:** a Onnira detectou o banco local e informou um volume isolado em `/app/.data`; o Nexo usa esse caminho quando ele está montado, ou o valor explícito de `NEXO_DATA_DIR`. Localmente usa `./data`. Execute apenas uma réplica da instalação SQLite. Antes da homologação, crie uma jornada fictícia, reinicie, publique uma atualização e confirme que os dados e vínculos permanecem. Preserve a mesma chave de criptografia.

`npm start` inicia o servidor web e o sincronizador como processos filhos, encaminhando sinais de encerramento. Sem as variáveis obrigatórias, mantém o guia público disponível e não inicia o worker. Falha do sincronizador encerra o supervisor para que a plataforma registre/reinicie a instalação, evitando operação silenciosa sem sincronização.

## Funcionamento

- **Manual:** RH seleciona colaborador, modelo, data e responsáveis. O app registra a movimentação e gera atividades no Bitrix.
- **Automático:** aprovação em uma etapa associada ao modelo inicia a mesma execução. Eventos repetidos não devem duplicar a movimentação.
- **Prazos:** cada atividade aceita dias corridos ou úteis relativos à data principal, com vencimento às 18h no fuso configurado. O padrão é `America/Sao_Paulo`. Dias úteis excluem sábados e domingos; feriados ainda não são descontados.
- **Modelos:** alterações criam nova versão. Jornadas existentes preservam seus snapshots.
- **Saídas:** os modelos iniciais separam desligamento voluntário e involuntário. People pode ajustar contatos, benefícios, documentos e regras de pagamento no ambiente privado antes de iniciar uma jornada; o código público não contém dados pessoais nem promessas de pagamento.
- **SOP de TI:** os modelos iniciais criam uma tarefa Bitrix de preparo para TI com prazo de 3 dias úteis antes da entrada ou 1 dia útil antes da saída. A tarefa é atribuída quando a jornada inicia; uma jornada iniciada depois do prazo aparecerá atrasada. Checklists nativos acompanham Google Workspace, Drive, Notion, Bitrix24, 2FA, orientações e controle de acessos. Ações nesses sistemas externos são executadas e confirmadas pela equipe responsável; o Nexo não possui conexão direta com eles.
- **Radar:** indica responsáveis ausentes, prazos próximos e pendências críticas. Uma integração desatualizada precisa ser verificada antes de interpretar prontidão.
- **Conclusão:** tarefas com revisão pendente e checklists obrigatórios incompletos impedem o encerramento.
- **Revogação de acessos:** o produto cria e acompanha solicitações para a equipe responsável; não executa revogação em sistemas externos.

## Verificação

```sh
npm run typecheck
npm run lint
npm test
npx playwright install chromium
npm run test:e2e
npm run build
```

Os testes de servidor usam SQLite temporário real e transporte HTTP substituído somente nos testes. Os testes de interface usam respostas fictícias identificadas em `tests/e2e`. Eles não comprovam integração com um portal real. As capturas em `output/playwright` são da interface com esses dados fictícios, exceto o guia público, que usa a resposta real da instalação local.

Para usar um cache de navegador no próprio projeto, defina `PLAYWRIGHT_BROWSERS_PATH=.cache/ms-playwright` antes de instalar/executar Playwright. No PowerShell: `$env:PLAYWRIGHT_BROWSERS_PATH="$PWD\.cache\ms-playwright"`.

Consulte [homologação](docs/homologacao.md), [segurança](docs/seguranca.md), [API](docs/api.md), [pitch](docs/pitch.md) e [Marketplace](docs/marketplace.md).

## Suporte

O administrador da instalação é o primeiro contato. Reúna horário, ação, código de erro e identificador da jornada, sem tokens, senhas ou dados pessoais desnecessários. Consulte as notificações do Nexo e os logs de execução/build da Onnira. Um incidente de credenciais exige revogar/rotacionar as chaves no Bitrix, atualizar a instalação e conferir as permissões concedidas.

## Referências

- [Documentação Onnira](https://onnira.com/docs#cloud-create)
- [Aplicação Bitrix com interface](https://apidocs.bitrix24.com/local-integrations/serverside-local-app-with-ui.html)
- [Eventos de processos personalizados](https://apidocs.bitrix24.com/api-reference/crm/universal/events/index.html)
- [Tarefas e checklists](https://apidocs.bitrix24.com/api-reference/tasks/checklist-item/index.html)
