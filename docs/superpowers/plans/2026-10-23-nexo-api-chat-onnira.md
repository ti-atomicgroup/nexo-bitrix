# Nexo Onnira Chat API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expor operações RH do Nexo por REST/OpenAPI para um conector de chat Onnira autenticado.

**Architecture:** Rotas `/api/chat/v1` autenticam um segredo Bearer opcional e derivam a identidade de uma conta local RH ligada ao webhook. Cada ação delega ao serviço `Journeys`; o contrato OpenAPI é separado e público para configuração do conector.

**Tech Stack:** Next.js App Router, TypeScript, Zod, SQLite atual, Vitest.

## Global Constraints

- Bitrix continua sendo a fonte oficial de tarefas e checklists.
- O webhook Bitrix não é usado como autenticação do chat nem é retornado ao cliente.
- A API de chat usa HTTPS e uma chave aleatória mantida como segredo de servidor e do conector Onnira.
- A conta usada em ações é a conta RH configurada no Nexo e associada ao webhook.
- As operações permanecem restritas a consultas e ações explicitamente listadas no contrato.

---

### Task 1: Chave e identidade de automação RH para o chat

**Files:** Modify `src/server/security.ts`, `src/server/auth.ts`, `.env.example`, `tests/backend/security-domain.test.ts`, `tests/backend/local-auth.test.ts`.

**Interfaces:** `Environment.chatApiKey: string | null`; `Auth.chatSession(): SessionInfo`. The method resolves the active local account bound to the incoming webhook service user, confirms its currently assigned role is `admin` or `rh`, and never synthesizes a broader role.

- [x] Test parsing a high-entropy optional `NEXO_CHAT_API_KEY`, short-key rejection, and preserved operation when absent.
- [x] Test active RH/admin identity resolution and rejection of missing, inactive, or non-RH linked accounts.
- [x] Implement only environment parsing and identity resolution; do not add the key to public status or logs.
- [x] Run focused Vitest tests and typecheck.

### Task 2: Authenticated HTTP operations and OpenAPI contract

**Files:** Create `src/server/chat-api.ts`, `src/app/api/chat/openapi/route.ts`, `src/app/api/chat/v1/workspace/route.ts`, `src/app/api/chat/v1/journeys/route.ts`, `src/app/api/chat/v1/journeys/[id]/route.ts`, `src/app/api/chat/v1/journeys/[id]/complete/route.ts`, `src/app/api/chat/v1/journeys/[id]/pause/route.ts`, `src/app/api/chat/v1/tasks/[id]/action/route.ts`, and `src/app/api/chat/v1/{templates,users}/route.ts`.

**Interfaces:** `chatApi(request, resource, id?)` authenticates bearer credentials with constant-time comparison, resolves `chatSession`, validates method/body, delegates to workspace/Journeys, and returns the existing `{ data }` / `{ error }` envelope. `GET /workspace` includes RH work due today and active journey summaries; `GET /journeys` supports bounded `status` and `type` filters; `GET /users?query=...` searches active people by name, position, or department and returns only Bitrix ID/name/position/department; `GET /templates` returns model activity IDs needed to create a journey; `POST /journeys` starts an idempotent journey; detail returns one visible journey; `POST /journeys/{id}/complete`; `POST /journeys/{id}/pause`; `POST /tasks/{id}/action` supports the existing task actions; OpenAPI declares each route and bearer security.

- [x] Write tests that missing and wrong Bearer keys return 401 before any domain operation.
- [x] Write tests that non-RH linked identities receive 403 and that valid RH can query and action a task.
- [x] Write tests for bounded query parameters, input validation, error envelopes and OpenAPI bearer declarations.
- [x] Implement routes with no generic dispatch surface and no credential-bearing response.
- [x] Run focused API tests and typecheck.

### Task 3: Setup guide and full verification

**Files:** Modify `docs/api.md`, `docs/manual-instalacao.md`, `.env.example`; add `tests/backend/chat-api.test.ts`.

- [x] Document generating a random 32-byte key, setting `NEXO_CHAT_API_KEY` in the Onnira server environment, configuring the HTTPS OpenAPI URL and secret Bearer header in the Onnira connector, and testing a read before enabling write actions.
- [x] State explicitly that publishing alone does not connect the chat and that the account must support a custom HTTP/OpenAPI connector.
- [x] Run `npm test` (76 tests), `npm run typecheck`, `npm run lint`, and `npm run build`; fix failures caused by the change.
- [x] Run `npm run package:onnira` and confirm the package contains chat routes and excludes environment secrets.
