# API interna e integração

Respostas JSON usam `{ "data": ... }` ou `{ "error": { "code": "...", "message": "..." } }`. Mensagens são apresentadas em português. Rotas privadas exigem `Authorization: Bearer <sessão Nexo>`, fornecida após abertura autenticada dentro do Bitrix. Não utilizar um token OAuth Bitrix diretamente como sessão Nexo.

## Rotas

| Método | Rota                          | Uso                                                                                     |
| ------ | ----------------------------- | --------------------------------------------------------------------------------------- |
| GET    | `/api/status`                 | Estado público da instalação, versão e nomes de configurações faltantes; sem segredos.  |
| POST   | `/api/bitrix/install`         | Contexto de instalação enviado pelo Bitrix.                                             |
| POST   | `/api/bitrix/launch`          | Contexto de abertura enviado pelo Bitrix; redireciona ao frame com sessão temporária.   |
| POST   | `/api/bitrix/events`          | Eventos Bitrix autenticados; enfileira processamento.                                   |
| GET    | `/api/workspace`              | Jornadas, tarefas e configurações filtradas pelas permissões do usuário.                |
| POST   | `/api/templates`              | Criar modelo.                                                                           |
| PUT    | `/api/templates/{id}`         | Salvar nova versão de modelo.                                                           |
| POST   | `/api/journeys`               | Iniciar jornada manual com `requestId`, tipo, modelo, colaborador, data e responsáveis. |
| POST   | `/api/journeys/{id}/complete` | Conferir requisitos e concluir jornada e movimentação.                                  |
| POST   | `/api/tasks/{id}/action`      | `start`, `complete`, `reopen`, `check` ou `uncheck`; itens usam `checklistId`.          |
| POST   | `/api/sync`                   | Solicitar conciliação persistida.                                                       |
| GET    | `/api/discovery`              | Seleções de `processes`, `categories`, `fields` e `stages`.                             |
| POST   | `/api/setup`                  | Ações administrativas `bootstrap`, `discover`, `provision`, `configure`, `finish`.      |

Os DTOs completos ficam em `src/shared/contracts.ts`. A API limita pedidos a 1 MB, valida dados e rejeita origens diferentes da instalação. O lançamento permite o portal configurado.

## Instalação

O Bitrix envia `DOMAIN` na query e credenciais no corpo URL-encoded. Valores divergentes são rejeitados. O bootstrap retorna sessão limitada até confirmação do segredo e das credenciais da aplicação. A instalação termina somente após o assistente e `BX24.installFinish`.

## Eventos e idempotência

Eventos de processos personalizados e tarefas são autenticados e colocados na fila. O processamento consulta os dados atuais no Bitrix. Não depende de `access_token` presente no evento; utiliza a identidade de automação configurada. Portal, tipo de entidade e registro identificam a movimentação. Um registro gera uma jornada; uma nova movimentação deve usar um novo registro.

## Erros e recuperação

401 indica sessão ausente/expirada; reabra pelo Bitrix. 403 indica origem, papel ou permissão insuficiente. 409 indica conflito/idempotência/execução concorrente. 503 indica configuração ou dependência indisponível. Mensagens específicas são retornadas no envelope de erro.

Nenhuma rota pública serve fixtures, cria sessões administrativas de desenvolvimento ou apresenta integração simulada. Transportes substituídos existem apenas nos testes.
