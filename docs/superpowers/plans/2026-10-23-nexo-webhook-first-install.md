# Nexo Webhook-First Installation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A new Onnira-hosted Nexo instance accepts a Bitrix webhook, lets the same browser create the first RH password, then opens the application.

**Architecture:** The server creates an instance AES key in the app data directory and pins the validated public origin. Connecting a verified webhook creates a short-lived, one-use installation grant in an HttpOnly cookie. Bootstrap consumes that grant and binds the RH account to the webhook owner. The UI has two short steps.

**Tech Stack:** Next.js, TypeScript, SQLite/Drizzle, Vitest, Playwright.

## Global Constraints

- Bitrix webhook URL is a secret and must not appear in logs, URLs, responses, or Git.
- Exactly one portal and one initial administrator per instance.
- Keep the later role-based RH login and task permissions.
- Do not depend on Onnira Marketplace identity contracts that have not been provided.

---

### Task 1: Instance configuration

**Files:** `src/server/security.ts`, `src/server/runtime.ts`, `src/server/http.ts`, `scripts/start.mjs`, `tests/backend/security-domain.test.ts`.

- [x] Add failing tests for a new instance without technical environment variables, generated key reuse after reopening, and rejected invalid public origins.
- [x] Implement private, exclusive key creation in the data directory and validated origin pinning. Preserve explicit publisher overrides.
- [x] Update status and worker startup so the first web request can initialize the instance.
- [x] Run targeted tests and typecheck.

### Task 2: One-use webhook installation grant

**Files:** `src/server/auth.ts`, `src/server/http.ts`, `src/server/bitrix.ts`, `tests/backend/auth.test.ts`, `tests/backend/http.test.ts`.

- [x] Add tests for browser-bound short-lived grant, automatic Bitrix owner binding, and one-time bootstrap; existing Bitrix tests cover webhook and portal validation.
- [x] Implement grant issuance and consumption, atomic first-admin creation, and session cookie.
- [x] Run targeted tests.

### Task 3: Two-step UI and docs

**Files:** `src/components/setup-screen.tsx`, `src/components/nexo-app.tsx`, `docs/manual-instalacao.md`, `README.md`, `tests/e2e/setup.spec.ts`.

- [x] Add browser tests for one-field connection and password step without setup token or Bitrix ID.
- [x] Implement concise two-step interface and automatic handoff to the app.
- [x] Update customer manual; keep technical hosting notes separate.
- [x] Run tests, typecheck, lint, build, and package. Inspect the setup screen visually.
