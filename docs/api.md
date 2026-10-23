# API interna e integração

Respostas JSON usam `{ "data": ... }` ou `{ "error": { "code": "...", "message": "..." } }`. Mensagens são apresentadas em português. Rotas da interface exigem o cookie `nexo_session`; as rotas `/api/chat/v1/*` exigem `Authorization: Bearer` com a chave independente do chat. Tokens Bitrix nunca são usados como sessão Nexo.

## Rotas

| Método | Rota                          | Uso                                                                                     |
| ------ | ----------------------------- | --------------------------------------------------------------------------------------- |
| GET    | `/api/status`                 | Estado público da instalação, versão e nomes de configurações faltantes; sem segredos.  |
| POST   | `/api/auth`                   | Login ou logout local do Nexo.                                                          |
| POST   | `/api/bitrix/install`         | Legado desativado (`410`); a conexão é configurada pelo assistente webhook.             |
| POST   | `/api/bitrix/launch`          | Legado desativado (`410`); acesso é feito pela URL independente do Nexo.                 |
| POST   | `/api/bitrix/events`          | Eventos Bitrix autenticados; enfileira processamento.                                   |
| GET    | `/api/workspace`              | Jornadas, tarefas e configurações filtradas pelas permissões do usuário.                |
| POST   | `/api/templates`              | Criar modelo.                                                                           |
| PUT    | `/api/templates/{id}`         | Salvar nova versão de modelo.                                                           |
| POST   | `/api/journeys`               | Iniciar jornada manual com `requestId`, tipo, modelo, colaborador, data e responsáveis. |
| POST   | `/api/ai/onboarding-trail`    | RH autorizado envia descrição transitória e modelo; retorna sugestão sem criar ou salvar jornada/tarefas. |
| POST   | `/api/journeys/{id}/complete` | Conferir requisitos e concluir jornada e movimentação.                                  |
| POST   | `/api/tasks/{id}/action`      | `start`, `complete`, `reopen`, `check` ou `uncheck`; itens usam `checklistId`.          |
| POST   | `/api/sync`                   | Solicitar conciliação persistida.                                                       |
| GET    | `/api/discovery`              | Seleções de `processes`, `categories`, `fields` e `stages`.                             |
| POST   | `/api/setup`                  | Ações administrativas `bootstrap`, `discover`, `provision`, `configure`, `finish`.      |
| GET    | `/api/chat/openapi.json`       | Contrato OpenAPI público para cadastrar o Nexo como conector de chat.                  |
| GET    | `/api/chat/v1/workspace`       | Trabalho de hoje/atrasados e resumo das jornadas ativas (Bearer API key + RH).         |
| GET    | `/api/chat/v1/journeys`        | Lista filtrável de jornadas (`status`, `type`, `limit`).                                |
| POST   | `/api/chat/v1/journeys`        | Inicia jornada com `requestId`, tipo, modelo, pessoa, data e responsáveis.              |
| GET    | `/api/chat/v1/templates`       | Lista de modelos disponíveis ao RH.                                                    |
| GET    | `/api/chat/v1/users?query=...`  | Busca pessoas ativas do Bitrix por nome, cargo ou área.                                |
| GET    | `/api/chat/v1/journeys/{id}`   | Detalhe visível de uma jornada.                                                        |
| POST   | `/api/chat/v1/journeys/{id}/complete` | Conclusão controlada após validar tarefas e checklists.                         |
| POST   | `/api/chat/v1/journeys/{id}/pause` | Pausa/retomada da liberação de etapas (`{ "paused": true|false }`).                |
| POST   | `/api/chat/v1/tasks/{id}/action` | Ação Bitrix `start`, `complete`, `reopen`, `check`, `uncheck`.                       |

Os DTOs completos ficam em `src/shared/contracts.ts`. A API limita pedidos a 1 MB, valida dados e rejeita origens diferentes da instalação. O lançamento permite o portal configurado.

### API do chat Onnira

A API do chat fica desabilitada até definir `NEXO_CHAT_API_KEY` no ambiente do servidor. Gere um valor aleatório de pelo menos 32 caracteres e guarde o mesmo valor como segredo Bearer no conector HTTP/OpenAPI da Onnira. A URL do contrato é `https://<domínio-publicado-do-nexo>/api/chat/openapi.json`; o servidor OpenAPI usa a URL pública configurada em `NEXO_APP_URL`. Não use a URL ou o segredo do webhook Bitrix como chave do chat.

As operações autenticadas executam com a conta RH local associada à conta proprietária do webhook Bitrix. Essa conta precisa estar ativa e com papel RH ou administrador. A API só permite as operações listadas; não permite alterar modelos, usuários, permissões ou credenciais. Iniciar uma jornada exige um modelo e usa `requestId` único para deduplicação. Ações de tarefa passam pelas validações de checklist, aprovação, visibilidade e sincronização já aplicadas pelo Nexo.

O chat pode consultar trabalho do dia, listar modelos/jornadas e iniciar ou atualizar atividades. A publicação do Nexo sozinha não conecta o chat. É necessário que o plano/conta Onnira ofereça um conector que aceite URL externa OpenAPI e header Bearer secreto; a documentação pública consultada descreve a API Onnira para consumo de modelos, mas não confirma se o conector customizado está habilitado na conta. Faça um teste de leitura antes de liberar ações de escrita.

## Instalação

O assistente testa a URL do webhook de entrada e armazena a credencial criptografada no servidor. O primeiro administrador local exige o token de instalação e deve estar vinculado à mesma conta Bitrix que criou o webhook. A sessão local é emitida em cookie HttpOnly; a tela e as operações REST podem ser usadas diretamente na Onnira.

O endpoint de trilha exige sessão RH, aceita até 12.000 caracteres e só recomenda IDs do modelo aprovado. A resposta aprovada pode ser enviada em `approvedTrail` ao criar uma jornada; o servidor confirma modelo, versão, etapa, responsável e atividades obrigatórias antes de criar operações Bitrix.

## Eventos e idempotência

Eventos de processos personalizados e tarefas são autenticados e colocados na fila. `ONTASKUPDATE` extrai o ID da tarefa e atualiza a atividade correspondente, incluindo sua coluna Kanban; `ONTASKDELETE` marca a atividade para revisão e não recria a tarefa. O processamento consulta o estado atual no Bitrix. Não depende de `access_token` presente no evento; utiliza a identidade de automação configurada. Portal, tipo de entidade e registro identificam a movimentação. Um registro gera uma jornada; uma nova movimentação deve usar um novo registro.

## Erros e recuperação

401 indica sessão ausente/expirada; reabra pelo Bitrix. 403 indica origem, papel ou permissão insuficiente. 409 indica conflito/idempotência/execução concorrente. 503 indica configuração ou dependência indisponível. Mensagens específicas são retornadas no envelope de erro.

Nenhuma rota pública serve fixtures, cria sessões administrativas de desenvolvimento ou apresenta integração simulada. Transportes substituídos existem apenas nos testes.
