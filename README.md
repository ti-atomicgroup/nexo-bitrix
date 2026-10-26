# Nexo · Pessoas e processos

Onboarding e offboarding hospedados na Onnira Cloud IA e conectados ao Bitrix24 por webhooks, com modelos configuráveis, tarefas e checklists nativos, início manual ou por aprovação de RH e Radar de Prontidão.

**Quer usar?** Siga o [manual fácil de instalação](docs/manual-instalacao.md) e depois o [guia rápido de uso](docs/como-usar-nexo.md). O cliente conecta seu portal pelo assistente do Nexo. A publicação no Marketplace da Onnira depende de acesso de publicador; o repositório documenta também a publicação técnica de uma instância Cloud IA.

## Executar localmente

Requisitos: Node.js 22.13 ou superior (validado com Node 24), npm e um portal Bitrix24 Cloud com API REST e processos personalizados disponíveis.

```sh
npm ci
npm run dev
```

Abra http://localhost:3000. Na primeira visita, cole o webhook Bitrix e crie a senha do primeiro RH. Não há login fictício, modo de demonstração autenticado ou integração simulada no produto.

## Configuração técnica opcional

O instalador do cliente não pede variáveis. O Nexo gera e guarda uma chave de criptografia no volume de dados da instância. O publicador pode usar `.env.example` para sobrescrever valores em ambientes administrados. Para gerar um arquivo com chaves aleatórias, use:

```sh
npm run configure -- --url https://seu-app-publicado
```

O comando não sobrescreve um `.env` existente nem imprime as chaves. No Windows, use `npm.cmd` se o PowerShell bloquear scripts npm.

| Variável              | Uso                                                                                             |
| --------------------- | ----------------------------------------------------------------------------------------------- |
| `NEXO_APP_URL`        | Sobrescrita opcional da origem HTTPS pública. Na Onnira, a origem é identificada na primeira abertura. |
| `NEXO_ENCRYPTION_KEY` | Sobrescrita opcional da chave de 32 bytes. Sem ela, a chave é criada no volume de dados. Preserve o volume ao atualizar/restaurar. |
| `NEXO_SETUP_TOKEN`    | Compatibilidade com instalações anteriores; o instalador novo não pede este valor. |
| `NEXO_DATA_DIR`       | Diretório persistente. Padrão local: `./data`; na Onnira, o volume detectado em `/app/.data`.   |
| `PORT`                | Porta HTTP. Padrão: `3000`.                                                                     |
| `NEXO_AI_BASE_URL`, `NEXO_AI_MODEL`, `NEXO_AI_API_KEY` | Integração opcional para sugerir trilhas por competências; configure somente como segredo no servidor. |

O Nexo usa somente webhooks Bitrix24. A URL do webhook de entrada é armazenada criptografada no servidor; o token do webhook de saída também. Nunca publique esses valores em código ou repositórios.

Na abertura de um onboarding, RH pode solicitar uma trilha a partir da descrição da vaga e revisar atividades, prazos e ordem antes de confirmar. A IA só pode recomendar atividades que já existem no modelo escolhido; lacunas ficam para decisão do RH. O texto da vaga é enviado ao provedor configurado e não é armazenado pelo Nexo. Sem as três variáveis opcionais de IA, o fluxo manual segue disponível. Consulte o [manual](docs/manual-instalacao.md) e a [política de segurança](docs/seguranca.md).

## Conectar ao Bitrix24

1. O responsável técnico publica o Nexo em HTTPS na Onnira e habilita o volume persistente em `/app/.data`. Quando distribuído pelo Marketplace, essa etapa pertence à Onnira/publicador.
2. No portal Bitrix24, entre com uma conta RH de serviço e crie um **webhook de entrada** em Aplicativos → Recursos do desenvolvedor → Webhooks. Conceda `task`, `user_brief` (ou `user`), `crm`, `sonet` e `userfieldconfig`. Dê à conta de serviço apenas as permissões necessárias para usuários, tarefas, projeto e processos de RH.
3. Abra o Nexo e cole a URL completa do webhook. O Nexo identifica o portal, testa a conexão e os escopos.
4. No mesmo navegador, crie o primeiro acesso de RH com e-mail e senha de pelo menos 12 caracteres. A conta Bitrix vinculada é identificada pelo webhook. A autorização desta etapa expira em dez minutos.
5. Configure empresa, responsáveis e processo **Movimentações de Pessoas** (novo ou existente). O assistente cria o projeto privado **Nexo · RH**; adicione nele os profissionais autorizados de RH. Os campos e etapas são descobertos pela API REST.
6. Para inícios automáticos e sincronização do Kanban, cadastre webhooks de saída para `ONCRMDYNAMICITEMUPDATE` e `ONTASKUPDATE`. Use o handler mostrado em Configurações → Conexão e cole no Nexo o token emitido nos eventos.
7. Revise modelos e regras de aprovação e conclua a configuração. A reconciliação periódica cobre eventos perdidos.

O Nexo fica hospedado na Onnira e é acessado pela URL do app. Webhooks Bitrix não oferecem interface nativa nem SSO. Contas locais do Nexo controlam quem pode acessar a tela; os IDs Bitrix vinculados são usados para selecionar colaboradores e responsáveis. As ações de integração sempre são realizadas pela conta que criou o webhook de entrada.

## Publicar na Onnira

```sh
npm run build
npm run package:onnira
```

Para publicação técnica na Onnira Cloud IA, é possível informar a URL e a branch de um **repositório GitHub público**. A conexão direta com repositórios privados ainda aparece como indisponível na interface. Escolha a opção Next.js/React, diretório base `/`, e confira instalação `npm ci`, build `npm run build`, inicialização `npm start` e porta `3000`. Não publique segredos, bancos ou dados reais no Git. Publicar no Marketplace exige o processo de publicador da Onnira, que ainda não foi disponibilizado nesta conta.

Como alternativa, envie `output/nexo-onnira.zip` à Onnira Cloud AI. Na API da plataforma, use runtime **next** e os mesmos comandos. O pacote exclui `.env`, banco, credenciais, dependências e artefatos locais.

**Persistência:** a Onnira detectou o banco local e informou um volume isolado em `/app/.data`; o Nexo usa esse caminho quando ele está montado, ou o valor explícito de `NEXO_DATA_DIR`. Localmente usa `./data`. Execute apenas uma réplica da instalação SQLite. Antes da homologação, crie uma jornada fictícia, reinicie, publique uma atualização e confirme que os dados e vínculos permanecem. Preserve a mesma chave de criptografia.

`npm start` inicia o servidor web e o sincronizador como processos filhos, encaminhando sinais de encerramento. O worker aguarda a conexão Bitrix antes de sincronizar. Falha do sincronizador encerra o supervisor para que a plataforma registre/reinicie a instalação, evitando operação silenciosa sem sincronização.

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
