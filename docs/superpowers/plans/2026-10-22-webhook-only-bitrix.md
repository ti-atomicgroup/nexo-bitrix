# Nexo Webhook-Only Bitrix Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert Nexo to a standalone Onnira-hosted RH app that uses Bitrix inbound/outbound webhooks only, with local RH accounts and reliable event reconciliation.

**Architecture:** `BitrixClient` will call REST through an encrypted inbound webhook URL and never use OAuth tokens. `Auth` will manage local RH users, password hashes, and cookie sessions; a Bitrix user ID is a managed link for assignment only. The Bitrix administrator will register an outbound webhook to Nexo's public handler, whose secret is verified before a persisted idempotent job is enqueued. A 60-second worker reconciliation remains the recovery path.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Node.js 22.13+, SQLite via better-sqlite3/Drizzle, Vitest, Playwright, Node.js `scrypt` and AES-256-GCM.

## Global Constraints

- Host the application in Onnira and use `NEXO_APP_URL`, `BITRIX_PORTAL_URL`, `NEXO_ENCRYPTION_KEY`, and `NEXO_SETUP_TOKEN`; persist SQLite under the Onnira data volume.
- Use only inbound and outbound Bitrix webhooks; do not call OAuth refresh, `event.bind`, or `event.get`.
- Keep webhook URL and outgoing-webhook token encrypted at rest; never expose them to the browser after submission or write them to logs.
- The inbound webhook service account is the Bitrix identity for operations and must have only the required `task`, `user_brief`/`user`, `crm`, and `userfieldconfig` permissions.
- Local accounts identify Nexo actors; they do not provide Bitrix SSO or reproduce each linked employee's effective Bitrix permissions.
- Outbound events are hints, can be duplicated or lost, and must be idempotent with 60-second reconciliation.
- Follow test-first development for every behavior change. Preserve Portuguese user-facing copy and existing role checks.

---

## File map

- Modify `src/server/security.ts` for webhook environment/domain validation, safe secrets, and password hashing/session helpers.
- Modify `src/server/models.ts` and `src/server/store.ts` for encrypted webhook configuration and local account/session persistence.
- Modify `src/server/bitrix.ts` to replace per-user OAuth authorization with the validated webhook URL while preserving REST error, pagination, and rate-limit behavior.
- Modify `src/server/auth.ts` and `src/server/http.ts`; add login/logout/bootstrap routes or actions for local account sessions and remove OAuth install/launch flows.
- Modify `src/server/events.ts`, `src/server/worker.ts`, and `src/server/setup.ts` for outgoing-webhook verification, custom-process events, reconciliation, and webhook capability checks.
- Modify `src/components/setup-screen.tsx`, add `src/components/login-screen.tsx` and local-user management UI, and update `src/components/nexo-app.tsx` for local login/session/logout.
- Modify `src/shared/contracts.ts`, `src/shared/validation.ts`, `src/lib/client.ts`, `src/app/api/status/route.ts`, API route handlers, `.env.example`, `README.md`, `docs/api.md`, `docs/seguranca.md`, and `docs/homologacao.md` to match the new flow.
- Extend the existing Vitest suite in `tests/backend` and `tests/client`; update `tests/e2e` to cover setup, login, roles, and the standalone Onnira app.

## Tasks

### Task 1: Persist webhook credentials and local account records safely

**Files:** Modify `src/server/models.ts`, `src/server/store.ts`, and `src/server/security.ts`. Test in `tests/backend/security-domain.test.ts` and `tests/backend/persistence.test.ts`.

**Interfaces:** Add `WebhookConfiguration` with `inboundUrlEncrypted`, `outboundTokenEncrypted`, `serviceUserId`, `verifiedAt`, `outboundVerifiedAt`; add `LocalUser` with `id`, `bitrixUserId`, `name`, `email`, `role`, `passwordHash`, `active`, and timestamps. Store them using the existing document store and Zod schemas.

- [ ] **Step 1: Write failing tests** for rejecting non-HTTPS, wrong-host, query-bearing, and malformed incoming webhook URLs; for accepting a URL rooted at the configured portal's `/rest/{numericUserId}/{secret}/`; and for round-tripping encrypted webhook configuration without storing the plaintext.
- [ ] **Step 2: Run the focused tests and verify they fail** because webhook validators/configuration storage are absent.
- [ ] **Step 3: Write failing account security tests** proving password hashes are salted and differ for identical passwords, correct passwords verify, incorrect passwords fail, and session token storage contains only a hash.
- [ ] **Step 4: Run the focused tests and verify the expected missing-function failures.**
- [ ] **Step 5: Implement minimal Zod schemas and storage helpers.** Keep credentials in the existing AES-GCM envelope and use Node `scrypt` with a per-user random salt and versioned serialized parameters. Add helpers `hashPassword(password): Promise<string>` and `verifyPassword(password, encodedHash): Promise<boolean>`.
- [ ] **Step 6: Run `npm test -- tests/backend/security-domain.test.ts tests/backend/persistence.test.ts` and confirm the new tests pass.**
- [ ] **Step 7: Run `npm run typecheck` and commit the task.**

### Task 2: Make the Bitrix REST client webhook-only

**Files:** Modify `src/server/bitrix.ts`, `src/server/models.ts`, and `src/server/runtime.ts`. Test in `tests/backend/http.test.ts` and a focused `tests/backend/bitrix-webhook.test.ts`.

**Interfaces:** Add `BitrixClient.configureWebhook(url: string, serviceUserId: string)` and `BitrixClient.testWebhook(url: string): Promise<{ userId: string; userName: string; scopes: string[] }>`; change the REST request path builder to use the saved secret path and keep every REST method call using POST JSON.

- [ ] **Step 1: Write failing client tests** that assert a method request uses the webhook path, passes parameters in the POST body, paginates `next`, and never includes an `auth` field or calls `oauth.bitrix.info`.
- [ ] **Step 2: Run `npm test -- tests/backend/bitrix-webhook.test.ts` and verify the OAuth client fails these assertions.**
- [ ] **Step 3: Write failing validation tests** for webhook `INVALID_CREDENTIALS`, `insufficient_scope`, `WRONG_AUTH_TYPE`, 429, timeout, malformed response, and uncertain creation errors.
- [ ] **Step 4: Implement `testWebhook`** by calling `profile` and `scope`; validate portal host and path before the request and return only service user ID/name and scope names.
- [ ] **Step 5: Replace `request(access, method, params)` and `authorized(userId, method, params)` with a method that builds `${portalOrigin}/rest/${userId}/${secret}/${method}.json` from server-side parsed config. Reject invalid method names before transport.
- [ ] **Step 6: Preserve response envelopes, page limits, throttling, abort timeout, redirect rejection, and uncertain-write markers. Never format an error with the webhook URL.**
- [ ] **Step 7: Run focused tests and `npm run typecheck`; commit the task.**

### Task 3: Replace OAuth identity with local RH login and sessions

**Files:** Modify `src/server/auth.ts`, `src/server/models.ts`, `src/server/http.ts`, `src/server/runtime.ts`, `src/app/api/status/route.ts`, and `src/shared/contracts.ts`. Add route handlers under `src/app/api/auth/`. Test in `tests/backend/auth.test.ts` and `tests/backend/http.test.ts`.

**Interfaces:** Implement `Auth.login(email, password)`, `Auth.logout(sessionToken)`, `Auth.bootstrapFirstAdmin(setupToken, input)`, `Auth.session(sessionToken)`, and `Auth.createLocalUser(session, input)`. Session responses expose user ID, display name, linked Bitrix user ID, role, expiry, and capability booleans only.

- [ ] **Step 1: Write failing tests** that first-admin bootstrap succeeds only with `NEXO_SETUP_TOKEN`, only once, and only after a webhook has been verified; invalid passwords and inactive users fail without issuing sessions.
- [ ] **Step 2: Run focused tests and verify expected failures.**
- [ ] **Step 3: Write failing session tests** for expiry, logout invalidation, role calculation from the local account, and `HttpOnly; Secure; SameSite=Lax` cookie attributes.
- [ ] **Step 4: Implement account lookup and session issuance** using a random 32-byte token, persist only its SHA-256 hash, and set a 30-minute idle session expiry. Clear the cookie on logout.
- [ ] **Step 5: Implement first-admin bootstrap** so `NEXO_SETUP_TOKEN` is timing-safe compared, the token cannot create another admin after bootstrap, and the bootstrap operation is idempotently locked.
- [ ] **Step 6: Add login/logout/bootstrap handlers** with same-origin checks, CSRF protection for cookie-authenticated mutations, rate limiting for login attempts, and generic invalid-login messages.
- [ ] **Step 7: Replace bearer-token checks in `http.ts` with the session cookie**; do not accept tokens in URLs or localStorage.
- [ ] **Step 8: Run auth/HTTP tests, typecheck, and commit the task.**

### Task 4: Configure and validate incoming/outgoing webhooks in setup

**Files:** Modify `src/server/setup.ts`, `src/server/http.ts`, `src/shared/contracts.ts`, `src/shared/validation.ts`, `src/components/setup-screen.tsx`, and `src/app/api/status/route.ts`. Test in `tests/backend/setup.test.ts` and `tests/backend/http.test.ts`.

**Interfaces:** Add setup actions `test-inbound`, `save-inbound`, `save-outbound`, and `test-outbound`. The outbound handler URL is `${NEXO_APP_URL}/api/bitrix/events`. Setup status returns configured/verified booleans, service user display identity, scope list, and last verification timestamps; it never returns secret values.

- [ ] **Step 1: Write failing setup tests** for missing scopes, invalid incoming webhook, valid user/scope discovery, encrypted save, and status responses that omit both tokens.
- [ ] **Step 2: Run the tests and verify failures** against the current OAuth bootstrap.
- [ ] **Step 3: Write failing outgoing-token tests** for saved secret verification, constant-time comparison, invalid token rejection, and safe status output.
- [ ] **Step 4: Implement the onboarding UI** with separate password inputs for the incoming webhook URL and outgoing webhook token, a test button for each, a copy button for the event handler URL, and step-by-step Bitrix navigation.
- [ ] **Step 5: Require scopes needed for the actual REST methods:** `task`, `crm`, `userfieldconfig`, and `user_brief` (allow `user` as the broader equivalent). Explain that portal permissions of the webhook owner also apply.
- [ ] **Step 6: Store the service-user ID derived from webhook `profile`; do not trust an ID supplied by the browser. Store the outbound event secret only after validating the expected portal and secure configuration.
- [ ] **Step 7: Run setup/HTTP tests, typecheck, and commit the task.**

### Task 5: Convert the app to a standalone Onnira login experience

**Files:** Add `src/components/login-screen.tsx`; modify `src/components/setup-screen.tsx`, `src/components/nexo-app.tsx`, `src/lib/client.ts`, `src/app/page.tsx`, `src/app/layout.tsx`, `src/app/globals.css`, and `src/app/api/status/route.ts`. Update `tests/client/client.test.ts` and `tests/e2e/workspace.spec.ts`.

- [ ] **Step 1: Add failing client tests** proving the API client sends same-origin cookies and never stores an auth bearer token in localStorage or sessionStorage.
- [ ] **Step 2: Add failing end-to-end login tests** for first-time setup, bad password, successful RH login, role-specific navigation, and logout.
- [ ] **Step 3: Run focused tests and confirm they fail** because the app currently waits for Bitrix iframe launch.
- [ ] **Step 4: Replace the Bitrix JS SDK bootstrap and iframe fitting with the standalone login route.** Keep the existing workspace visual design and responsive behavior.
- [ ] **Step 5: Add local user management** for an admin to create, deactivate, and assign RH/gestor/executor/colaborador roles and Bitrix user IDs. Never display password hashes or stored webhook secrets.
- [ ] **Step 6: Change profile copy** to state “Conta Nexo”, the linked Bitrix user, and that Bitrix operations execute as the RH service account. Remove claims that a person's current Bitrix permissions are inherited.
- [ ] **Step 7: Run client/e2e tests, typecheck, and commit the task.**

### Task 6: Receive Bitrix outgoing webhooks and reconcile lost events

**Files:** Modify `src/server/events.ts`, `src/server/http.ts`, `src/server/worker.ts`, `src/server/journeys.ts`, and `src/app/api/bitrix/events/route.ts`. Test in `tests/backend/launch.test.ts`, `tests/backend/journeys.test.ts`, and a focused `tests/backend/events.test.ts`.

**Interfaces:** Replace application-token event validation with `Events.receive(input)` that validates outgoing-webhook token and `auth.domain`, accepts JSON and `application/x-www-form-urlencoded` body forms, then enqueues a typed `EventJob`.

- [ ] **Step 1: Write failing event tests** for valid form-encoded and JSON custom process events, bad token, wrong portal, unsupported event, malformed event fields, and repeated event idempotency.
- [ ] **Step 2: Run tests and verify they fail** against application OAuth token validation.
- [ ] **Step 3: Implement outbound event parsing** for `ONCRMDYNAMICITEMADD`, `ONCRMDYNAMICITEMUPDATE`, `ONTASKADD`, `ONTASKUPDATE`, and `ONTASKDELETE`. Verify outgoing-webhook token in constant time and compare the portal hostname to `BITRIX_PORTAL_URL`.
- [ ] **Step 4: Deduplicate by portal, event, object ID, and Bitrix timestamp/handler ID** before persisting jobs. Reject event payloads above the existing 1 MB request limit.
- [ ] **Step 5: Update the worker** to re-read full CRM item/task data through the inbound webhook, filter by configured entity/category/stage, and use existing reservations before creating a journey.
- [ ] **Step 6: Keep periodic reconciliation** and ensure a missing event is recovered after restart. Do not depend on webhook sender retries.
- [ ] **Step 7: Run event/journey/worker tests, typecheck, and commit the task.**

### Task 7: Remove OAuth-only setup and update security/operations documentation

**Files:** Modify `src/server/auth.ts`, `src/server/bitrix.ts`, `src/server/setup.ts`, `src/server/events.ts`, Bitrix API route handlers, `.env.example`, `scripts/configure.mjs`, `README.md`, `docs/api.md`, `docs/seguranca.md`, `docs/homologacao.md`, and `src/components/setup-screen.tsx`.

- [ ] **Step 1: Write failing regression tests** that `missingEnvironment` requires only the four Onnira variables and status/setup screens do not request `client_id`, `client_secret`, or OAuth permissions.
- [ ] **Step 2: Run tests and verify they fail** while OAuth fields remain required.
- [ ] **Step 3: Remove OAuth credential refresh, token storage, installation context, and obsolete `/api/bitrix/install` and `/api/bitrix/launch` handlers.** Keep a clear 404/410 response on legacy paths during transition; do not perform OAuth calls in the webhook client.
- [ ] **Step 4: Update setup guide** to create an inbound webhook in Bitrix and an outgoing webhook for `ONCRMDYNAMICITEMUPDATE`; explain scope selection, service-account ownership, expiry/rotation, and where to paste secrets in Nexo.
- [ ] **Step 5: Update `.env.example` and `scripts/configure.mjs`** so the generated file contains only Onnira app URL, Bitrix portal URL, AES key, setup token, data directory, and port. Webhook secrets remain in the encrypted Nexo setup store, not environment output.
- [ ] **Step 6: Document local user accounts, password recovery/admin reset, audit actor vs. Bitrix service executor, standalone URL access, and the loss of SSO/native Bitrix menu embedding.**
- [ ] **Step 7: Run regression tests, typecheck, lint, and commit the task.**

### Task 8: Full verification and portal homologation guide

**Files:** Update `tests/backend`, `tests/client`, `tests/e2e`, and `docs/homologacao.md` only where verification reveals missing coverage.

- [ ] **Step 1: Run `npm test` and fix all failures caused by the migration.**
- [ ] **Step 2: Run `npm run typecheck` and `npm run lint`; fix all failures.**
- [ ] **Step 3: Run `npm run test:e2e` and verify setup, login, RH agenda, role visibility, task completion, and logout with fixture data.
- [ ] **Step 4: Run `npm run build` and `npm run package:onnira`; verify the package excludes `.env`, database files, and local account/webhook secrets.
- [ ] **Step 5: Confirm no OAuth/token-refresh code remains in production REST paths with `rg -n "oauth\.bitrix\.info|event\.bind|REFRESH_ID|clientSecret|AUTH_ID" src` and inspect each remaining match.**
- [ ] **Step 6: Update the homologation checklist for the test portal:** create dedicated service-account incoming webhook; validate scopes; create outgoing webhook; test duplicate and lost events; verify re-publication persistence; rotate/revoke a webhook; verify local account role restrictions.
- [ ] **Step 7: Report that end-to-end portal verification still requires the user to paste the new webhook URLs/tokens directly into the Nexo setup screen; never ask them to send those secrets in chat.**

## Plan self-review

- Every design requirement maps to Tasks 1–8: webhook secrets and local accounts (1), webhook REST (2), login/session (3), setup (4), standalone UI and roles (5), outgoing events and recovery (6), OAuth cleanup/docs (7), and full validation (8).
- Coverage includes invalid and expired secrets, missing scopes, duplicate and lost events, restart/reconciliation, access roles, and external portal homologation.
- User IDs are derived from `profile` or validated by Bitrix before assignment; secret URLs/tokens are never returned to browser status APIs.
- The plan intentionally removes native Bitrix embedding and SSO to honor the approved webhook-only architecture.
