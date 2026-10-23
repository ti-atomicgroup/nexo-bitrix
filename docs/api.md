# API interna e integração

Respostas JSON usam `{ "data": ... }` ou `{ "error": { "code": "...", "message": "..." } }`. Mensagens são apresentadas em português. Rotas privadas exigem o cookie `nexo_session`, emitido após login local; o navegador mantém o cookie HttpOnly e envia-o automaticamente. Tokens Bitrix nunca são usados como sessão Nexo.

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

Os DTOs completos ficam em `src/shared/contracts.ts`. A API limita pedidos a 1 MB, valida dados e rejeita origens diferentes da instalação. O lançamento permite o portal configurado.

## Instalação

O assistente testa a URL do webhook de entrada e armazena a credencial criptografada no servidor. O primeiro administrador local exige o token de instalação e deve estar vinculado à mesma conta Bitrix que criou o webhook. A sessão local é emitida em cookie HttpOnly; a tela e as operações REST podem ser usadas diretamente na Onnira.

O endpoint de trilha exige sessão RH, aceita até 12.000 caracteres e só recomenda IDs do modelo aprovado. A resposta aprovada pode ser enviada em `approvedTrail` ao criar uma jornada; o servidor confirma modelo, versão, etapa, responsável e atividades obrigatórias antes de criar operações Bitrix.

## Eventos e idempotência

Eventos de processos personalizados e tarefas são autenticados e colocados na fila. `ONTASKUPDATE` extrai o ID da tarefa e atualiza a atividade correspondente, incluindo sua coluna Kanban; `ONTASKDELETE` marca a atividade para revisão e não recria a tarefa. O processamento consulta o estado atual no Bitrix. Não depende de `access_token` presente no evento; utiliza a identidade de automação configurada. Portal, tipo de entidade e registro identificam a movimentação. Um registro gera uma jornada; uma nova movimentação deve usar um novo registro.

## Erros e recuperação

401 indica sessão ausente/expirada; reabra pelo Bitrix. 403 indica origem, papel ou permissão insuficiente. 409 indica conflito/idempotência/execução concorrente. 503 indica configuração ou dependência indisponível. Mensagens específicas são retornadas no envelope de erro.

Nenhuma rota pública serve fixtures, cria sessões administrativas de desenvolvimento ou apresenta integração simulada. Transportes substituídos existem apenas nos testes.
