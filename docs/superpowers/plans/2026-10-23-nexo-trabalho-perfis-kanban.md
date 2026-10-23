# Nexo RH — Trabalho do dia, perfis e Kanban Bitrix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make RH's daily work concise and actionable, let RH configure onboarding models by profile, and keep each journey activity synchronized with a native Bitrix task in a private RH project/Kanban.

**Architecture:** Preserve Bitrix as the authority for movement/task/checklist data and Nexo as the authority for templates, journey context, and mappings. Extend the existing webhook-only REST client, SQLite settings/contracts, queue and worker for an idempotent private-project setup and task-event reconciliation. Keep the UI based on existing domain data: a compact daily queue, guided journey/model forms, and project connection status.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, SQLite with Drizzle, Zod, Vitest, Playwright, existing Bitrix incoming/outgoing webhook integration.

## Global Constraints

- Use only Bitrix incoming and outgoing webhooks; do not add OAuth, `event.bind`, or `event.get`.
- Bitrix is the source of truth for users, movement records, tasks, checklists, task status, and Kanban stage.
- RH selects the model when manually opening a journey; automatic approval rules continue to name their model explicitly.
- Keep one private project named `Nexo · RH` by default; never add non-RH users to the project automatically.
- Persist the exact model version and profile on each journey; edits to templates do not mutate active journeys.
- Calculate configured activity offsets in calendar or business days; use the existing portal timezone for daily due-work selection.
- Duplicate or repeated task events must reconcile current state and must never create duplicate tasks.
- Task deletion is a visible RH exception; never recreate the task without an explicit action.
- Outbound task events are hints; retain 60-second reconciliation as recovery.
- Do not place sensitive offboarding reasons or exit-interview notes in task title/description.
- Preserve role visibility, keyboard access, reduced-motion support, mobile and narrow Bitrix-frame layouts, and Portuguese labels.
- Use synthetic fixtures only in tests; never claim a real portal integration was exercised without the user's Bitrix credentials.

## File Map

- `src/shared/contracts.ts`, `src/shared/validation.ts`, `src/server/models.ts`, `src/server/validation.ts`: backward-compatible profile, journey snapshot, project settings, and Kanban-stage fields.
- `src/server/store.ts`, `src/server/auth.ts`: persist and initialize project configuration with safe legacy defaults.
- `src/server/bitrix.ts`, `src/server/setup.ts`: project create/validate, project Kanban stages, and task retrieval/mutation using existing webhook transport.
- `src/server/journeys.ts`: create each task in the configured RH project and capture Bitrix Kanban stage separately from task status.
- `src/server/events.ts`, `src/server/worker.ts`: validate/queue task event IDs and reconcile the mapped activity idempotently.
- `src/server/workspace.ts`, `src/server/http.ts`, `src/lib/client.ts`, `src/app/api/**`: expose safe configuration and journey/task state through existing authenticated APIs.
- `src/components/workspace.tsx`, `src/components/rh-daily-agenda.tsx`, `src/components/readiness-queue.tsx`: reduce RH home to a compact prioritized work queue and move secondary radar/calendar/history/list material into their proper existing sections.
- `src/components/templates.tsx`, `src/components/journey-form.tsx`: add free-text profile and short guided flows with advanced activity details collapsed.
- `src/components/settings.tsx`, `src/components/setup-screen.tsx`: show/setup private RH project, permissions, Kanban link, webhook and last synchronization.
- `src/app/globals.css`: responsive hierarchy and compact, accessible controls.
- `tests/backend/{setup,journeys,events,seeds,security-domain}.test.ts`, `tests/client/*`, `tests/e2e/{fixtures,workspace}.spec.ts`: regression coverage for migrations/defaults, project/task integration, event reconciliation, forms, and home behavior.
- `docs/manual-instalacao.md`, `docs/api.md`, `docs/seguranca.md`, `DESIGN.md`: update install permissions and user-facing project/queue guidance where relevant.

---

### Task 1: Add backward-compatible profile and Kanban fields

**Files:** Modify `src/shared/contracts.ts`, `src/shared/validation.ts`, `src/server/models.ts`, `src/server/validation.ts`, `tests/backend/seeds.test.ts`, and existing client contract tests.

**Interfaces:** `JourneyTemplate.profile: string` defaults to `Geral` when parsing saved templates; `Journey.templateProfile: string` snapshots the selected profile. `JourneyTask.bitrixStageId: string | null` and `bitrixStageTitle: string | null` are independent of task status. `Settings.rhProject` is `{ id: string; name: string; url: string } | null`.

- [x] Write failing parsing tests for a legacy saved template/journey/task/settings record missing the new fields, plus a profile-specific template and a task with a Kanban stage.
- [x] Run `npm test -- tests/backend/seeds.test.ts` and the focused contract test; confirm the new assertions fail on absent fields.
- [x] Add schemas/default transforms so legacy state parses as `Geral`, `null` stage fields, and no configured project without dropping any old data.
- [x] Update typed fixtures to include the new contract fields and assert serialization preserves profile/version snapshots.
- [x] Run the focused tests and `npm run typecheck`.

### Task 2: Create and persist the private RH project through webhook setup

**Files:** Modify `src/server/bitrix.ts`, `src/server/setup.ts`, `src/server/store.ts`, `src/server/auth.ts`, `src/server/http.ts`, `src/shared/contracts.ts`, `src/shared/validation.ts`, and `tests/backend/setup.test.ts`.

**Interfaces:** Add webhook-backed `BitrixClient.createRhProject(name): Promise<{ id: string; name: string; url: string }>` using `sonet_group.create`, with `PROJECT: "Y"`, private visibility, and name. `Setup.provisionRhProject(name)` validates `sonet` scope and the create permission, creates once under the existing setup lock, persists `Settings.rhProject`, and returns the safe project record. Repeated calls return the already-persisted project instead of creating another.

- [x] Write failing tests proving project creation sends the expected private-project fields, missing `sonet` scope is reported, and a second provisioning call reuses the stored ID.
- [x] Run `npm test -- tests/backend/setup.test.ts` and observe the expected missing method/config failures.
- [x] Implement the smallest webhook client method and idempotent setup flow; surface insufficient permission and missing-scope errors in Portuguese-safe status fields.
- [x] Run setup tests and `npm run typecheck`.

### Task 3: Put journey tasks in the project and map Kanban stages

**Files:** Modify `src/server/bitrix.ts`, `src/server/journeys.ts`, `src/server/workspace.ts`, and `tests/backend/journeys.test.ts`.

**Interfaces:** Extend `tasks.task.add` input with configured `GROUP_ID`; map returned task ID/URL as today. Add `BitrixClient.getTask(taskId)` to include `GROUP_ID` and `STAGE_ID`, and `BitrixClient.getTaskStage(groupId, stageId)` to resolve the column name through `task.stages.get`. Keep `JourneyTask.status` mapped only from Bitrix execution status and populate `bitrixStageId/Title` from Kanban fields.

- [x] Add failing journey tests asserting task creation uses `GROUP_ID` from settings and fails before any task is created when the HR project is not configured.
- [x] Add failing refresh tests showing moving a task's `STAGE_ID` changes Kanban stage fields without changing its execution status.
- [x] Run `npm test -- tests/backend/journeys.test.ts` and verify failures match missing project/stage behavior.
- [x] Implement task-group assignment and separate stage retrieval; keep uncertain task-creation reconciliation by the existing activity marker.
- [x] Run focused journey tests and typecheck.

### Task 4: Reconcile task updates from outgoing Bitrix webhook events

**Files:** Modify `src/server/events.ts`, `src/server/worker.ts`, `src/server/store.ts` only if a targeted job payload requires it, and `tests/backend/events.test.ts`.

**Interfaces:** `ONTASKUPDATE` extracts `data.FIELDS_AFTER.ID`, with `FIELDS_BEFORE.ID` fallback and supported flattened payload compatibility; enqueue payload `{ event: "ONTASKUPDATE", taskId: string }` keyed idempotently by event/task ID. Worker calls a targeted `Journeys.refreshByBitrixTaskId(taskId)` for mapped tasks. `ONTASKDELETE` records an actionable broken-link sync state on the matching task; it does not enqueue task creation.

- [x] Write failing tests for nested and flattened update payloads, missing task ID rejection, repeated event idempotency, targeted refresh, and deletion leaving the task unlinked without a create call.
- [x] Run `npm test -- tests/backend/events.test.ts` and observe the new missing behavior.
- [x] Implement event extraction and targeted worker reconciliation by looking up the Bitrix task mapping; retain the existing 60-second global reconcile.
- [x] Run event/journey tests and typecheck.

### Task 5: Add profile-aware, guided template and journey flows

**Files:** Modify `src/components/templates.tsx`, `src/components/journey-form.tsx`, `src/shared/validation.ts`, `tests/client/*`, `tests/e2e/fixtures.ts`, and `tests/e2e/workspace.spec.ts`.

**Interfaces:** Template editor collects `profile` as free text. Template list filters by journey type and profile. Journey creation follows two steps: select person/type/profile-compatible template/date; review activities, deadlines, and assignees; then start. Bitrix job title/department is display-only context. Approval-rule template IDs remain unchanged.

- [x] Add failing UI tests for saving a “Vendedor” profile, filtering by profile, RH manually selecting the model, and seeing job/department without auto-selection.
- [x] Run the focused client/e2e tests and confirm current UI lacks the profile and guided-review states.
- [x] Implement profile input/filter and two-step flow; collapse checklist, criticality, visibility, and materials under each activity's “Mais detalhes” disclosure.
- [x] Preserve existing validation, callbacks, auth permissions, model versioning, and app-frame responsiveness.
- [x] Run focused UI tests, typecheck, and lint.

### Task 6: Simplify “Trabalho de hoje” and keep reference views accessible

**Files:** Modify `src/components/workspace.tsx`, `src/components/rh-daily-agenda.tsx`, `src/components/readiness-queue.tsx`, `src/components/nexo-app.tsx`, `src/app/globals.css`, and `tests/e2e/workspace.spec.ts`.

**Interfaces:** Continue using the existing RH agenda collection and priority helper; all RH-role activities in active journeys overdue or due today remain in the queue. Overview contains a clear focus task plus compact actionable rows and no Radar, calendar, history, or full journey table. Existing navigation keeps full journey and task views reachable; Radar/calendar/history move to their relevant existing sections.

- [x] Write failing e2e assertions that home contains the focus task/person/deadline/primary action and does not show Radar, calendar, history, or the full journey table; assert those data remain accessible from other sections.
- [x] Run `npm run test:e2e -- --grep "Trabalho de hoje"` and confirm current dashboard layout fails the new hierarchy assertions.
- [x] Reduce agenda to task, person, deadline, responsible and primary open action; retain reasons only for genuine overdue, critical, or sync-error cases.
- [x] Move readiness, calendar and history components to existing journeys/tasks views; do not add duplicate data or unsupported dashboard counts.
- [x] Verify 390px and narrow-frame layouts, keyboard focus, no hover-only actions, and reduced-motion behavior; run focused e2e tests.

### Task 7: Expose project and stage status in connection and task detail

**Files:** Modify `src/server/workspace.ts`, `src/server/http.ts`, `src/shared/contracts.ts`, `src/components/settings.tsx`, `src/components/setup-screen.tsx`, task/journey detail components, `tests/backend/setup.test.ts`, and `tests/e2e/workspace.spec.ts`.

**Interfaces:** Safe setup status exposes project name, ID, URL, last sync, and webhook scope/verification state, never credentials. Task detail displays “Coluna no Kanban” separately from execution status and links to the original Bitrix task. Project setup presents permission prerequisites and lets an authorized RH administrator create the private project.

- [x] Add failing API/UI tests that project details are available without credentials and task detail labels Kanban stage and status as separate values.
- [x] Run focused setup and e2e tests and observe missing project/stage display.
- [x] Implement safe status mapping and project setup action; ensure only RH admin can trigger provisioning and non-RH task views reveal no project-wide data.
- [x] Run focused tests, typecheck, lint, and build.

### Task 8: Document installation, verify responsive product flow

**Files:** Modify `docs/manual-instalacao.md`, `docs/api.md`, `docs/seguranca.md`, and `DESIGN.md`; capture screenshots under `output/playwright/`.

- [x] Update installation instructions with webhook scopes `task`, `crm`, `user_brief` (or broader `user`), `userfieldconfig` when needed, plus `sonet` for creating the private project; explain outbound `ONTASKUPDATE` registration in the Bitrix interface without `event.bind`.
- [x] Document that service-user permissions apply, non-RH users are not auto-added to the private project, and assigned-task access follows Bitrix permissions.
- [x] Run `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`, and `npm run test:e2e`.
- [x] Capture/inspect home, template editor, journey wizard and project setup at desktop and 390px; fix any clipping, inaccessible control or misleading status revealed by inspection.
- [x] Run `git diff --check` and verify generated screenshots use only synthetic fixture data.

### Final verification

- `npx vitest run`: 13 files, 51 tests passed.
- `npm run test:e2e`: 14 tests passed, including mobile and accessibility checks.
- `npm run lint`, `npm run typecheck`, `npm run build`, and `git diff --check`: passed.

## Evolução aprovada

O usuário aprovou uma trilha de onboarding assistida por IA, usando a Feedz somente como inspiração conceitual para etapas, materiais e progresso — sem reproduzir sua interface ou fluxos. O trabalho está especificado em `docs/superpowers/specs/2026-10-23-nexo-perfis-kanban-bitrix-design.md` e planejado em `docs/superpowers/plans/2026-10-23-nexo-trilha-onboarding-ia.md`.

