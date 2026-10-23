# Nexo Bitrix Triggers and Progressive Task Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Start onboarding/offboarding from configured Bitrix CRM or Smart Process stages, or manually in Nexo, and create native Bitrix tasks only as each journey stage becomes available.

**Architecture:** Bitrix stays authoritative for source records, tasks, checklists and task completion. Nexo stores trigger rules, an idempotent origin link, the approved template snapshot and stage release state. Outgoing webhook events enqueue source/task IDs; a persistent worker rereads the current Bitrix state through the incoming webhook, applies matching rules, releases eligible stages and creates only the tasks for those stages. A 60-second reconciliation recovers missed events and date-based releases.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, SQLite with Drizzle, Zod, Vitest, Playwright, existing incoming/outgoing Bitrix webhook client.

## Global Constraints

- Use only Bitrix incoming and outgoing webhooks; do not add OAuth, `event.bind`, or `event.get`.
- Bitrix is the source of truth for source records, task owners, due dates, checklists, task execution status and Kanban stage.
- No process, category, stage, field or user ID is hardcoded; discover source options and persist the administrator's selections.
- One configured source record can start one journey; duplicate, repeated, concurrent and out-of-order events must not create duplicate journeys or tasks.
- Start and manual flows use the same journey snapshot and stage-release engine.
- Create all activities in a released stage together; do not create tasks for waiting stages.
- A stage configured after the previous stage releases only after every required activity in the previous stage is confirmed complete in Bitrix. Optional activities do not block it; awaiting approval remains pending.
- A date-based stage becomes eligible on its configured relative date; if already due, release on the next worker pass without shifting task deadlines.
- Create tasks in the configured private RH project. Never add non-RH users to that project automatically.
- Preserve old SQLite data through backward-compatible schema defaults and migrations.
- Keep webhook credentials encrypted and out of logs, browser responses, screenshots and Git.
- Do not place sensitive offboarding reasons or exit-interview notes in task titles/descriptions.
- Use only synthetic records in automated tests. Portal validation uses the user's test Bitrix24 `helpbr24.bitrix24.com.br` and credentials entered directly in Nexo; never put secrets in Git or chat.
- Keep Portuguese labels, role visibility, keyboard operation and responsive Bitrix-frame layouts.

## File Map

- `src/shared/contracts.ts`, `src/shared/validation.ts`: trigger source/data mapping, journey origin/person snapshot, stage release configuration/state, task release state, pause state, per-rule last-run result and safe configuration contracts.
- `src/server/validation.ts`, `src/server/models.ts`, `src/server/store.ts`: validate and persist new shapes, load legacy settings/journeys safely, and reserve unique source-to-journey/task operations.
- `src/server/bitrix.ts`, `src/server/setup.ts`: discover CRM entity types, CRM categories/stages/fields and Smart Process fields/stages; reread source records through the incoming webhook.
- `src/server/events.ts`, `src/app/api/bitrix/events/route.ts`: accept, authenticate, validate, deduplicate and enqueue supported CRM, Smart Process and task event IDs.
- `src/server/worker.ts`: evaluate matching rules, reconcile configured source records, release eligible stages and process persisted events without duplicate work.
- `src/server/journeys.ts`, `src/server/domain.ts`: snapshot the journey, origin and person, calculate deadlines and release stages, create tasks once, refresh remote completion and pause/cancel safely.
- `src/server/workspace.ts`, `src/server/http.ts`, `src/app/api/workspace/route.ts`, `src/app/api/journeys/route.ts`, `src/app/api/journeys/[id]/*`: expose authorized trigger setup, journey release status, pending source/person issues and pause/resume actions.
- `src/components/settings.tsx`, `src/components/workspace.tsx`: add a guided trigger-rule editor for CRM/Smart Process sources and concise execution/repair status.
- `src/components/templates.tsx`: let RH configure each stage's release mode and relative offset while editing a model.
- `src/components/journey-form.tsx`, `src/components/journey-detail.tsx`: preserve manual opening and show waiting, released and completed stages plus source/person linking issues.
- `src/components/nexo-app.tsx`, `src/lib/client.ts`, `src/app/globals.css`: connect new authenticated operations and accessible, responsive status/actions.
- `tests/backend/{events,journeys,setup,security-domain,seeds}.test.ts`, `tests/client/client.test.ts`, `tests/e2e/{fixtures,workspace.spec}.ts`: prove source discovery, migration compatibility, idempotency, stage release, authorization and user-visible configuration.
- `docs/manual-instalacao.md`, `docs/api.md`, `docs/homologacao.md`, `docs/seguranca.md`: document webhook event registration and a safe test-portal verification run.

---

### Task 1: Define persistent trigger, origin, person and release snapshots

**Files:** Modify `src/shared/contracts.ts`, `src/shared/validation.ts`, `src/server/validation.ts`, `src/server/models.ts`, `src/server/store.ts`, `tests/backend/seeds.test.ts`, and `tests/backend/security-domain.test.ts`.

**Interfaces:** Define `TriggerSource` as `{ kind: "crm_lead" | "crm_deal" | "smart_process"; entityTypeId: number; categoryId: number | null; stageId: string }`. Extend `AutomationRule` with `source`, `fieldMapping: { nameField: string; dateField: string; bitrixUserField: string | null; positionField: string | null; departmentField: string | null }`, and existing `type`, `templateId`, `enabled`. Persist `AutomationRun` by rule and source key with outcome `started | pending_data | ignored | failed`, safe message, journey ID and timestamp so the editor can show the last result without storing raw payloads. Define `StageRelease` as `{ mode: "immediate" | "date" | "previous_stage_completed"; offsetDays: number; offsetUnit: "calendar_days" | "business_days" }`; `StageDefinition.release` defaults to immediate for legacy templates. Add `JourneyStageSnapshot` with stable `id`, `title`, `order`, `release`, `state: "waiting" | "released" | "completed"`, and nullable `releasedAt`. Add `JourneyOrigin` with source entity type, source item ID, optional category, and source URL. Add `JourneyPerson` with `bitrixUserId: string | null`, name, position, department, active state and origin reference. Journey keeps its separate HR movement link for status/cancellation. `JourneyTask` stores `stageId` and `releaseState: "waiting" | "released"`; `syncState` continues to describe only a task already eligible for Bitrix creation. Extend journey status with `paused` and migration defaults for existing journeys: synthesize one `legacy:<normalized-stage-title>` snapshot for each distinct task stage title, mark those stages and all existing tasks as released, and link the person to the existing employee user ID. This ensures the migration never creates a duplicate Bitrix task or reblocks an active journey.

- [ ] Write parsing tests for a legacy journey/template, a CRM-origin person without a Bitrix user, a Smart Process trigger and all release modes.

```ts
expect(triggerRuleSchema.parse(rule).source.kind).toBe("crm_deal");
expect(legacyTemplateSchema.parse(oldTemplate).stages[0]?.release.mode).toBe("immediate");
expect(legacyJourneySchema.parse(oldJourney).tasks[0]?.releaseState).toBe("released");
```

- [ ] Run `npx vitest run tests/backend/seeds.test.ts tests/backend/security-domain.test.ts`; confirm new schema assertions fail before implementation.
- [ ] Implement typed schemas/transforms and store migration so old rows load without changing their visible state or remote task mappings.
- [ ] Add uniqueness validation for source entity type + source item ID and stage ID membership for every journey task.
- [ ] Run `npx vitest run tests/backend/seeds.test.ts tests/backend/security-domain.test.ts` and `npm run typecheck`.

### Task 2: Discover CRM and Smart Process source fields and stages

**Files:** Modify `src/server/bitrix.ts`, `src/server/setup.ts`, `src/shared/contracts.ts`, `src/server/validation.ts`, and `tests/backend/setup.test.ts`.

**Interfaces:** Add `BitrixClient.discoverTriggerSources(userId)` returning CRM entity types/categories/stages/fields and available Smart Process entity types/categories/stages/fields in normalized discovery records. Add `BitrixClient.getTriggerSource(userId, source, itemId)` using the appropriate CRM item read method and validating that the returned ID, entity type and current stage match the requested record. Setup validates the chosen source and field mapping against discovery before saving rules; it never provisions or edits the user's CRM pipeline.

- [ ] Add fake REST responses and failing tests for lead, deal and Smart Process source discovery, including category-specific stages and custom fields.

```ts
const sources = await client.discoverTriggerSources("1");
expect(sources.find((source) => source.kind === "crm_deal")?.stages).toContainEqual(
  expect.objectContaining({ id: "C2:WON", name: "Contratado" }),
);
```

- [ ] Add tests that an unknown entity, stage or field mapping is rejected and a source item with a mismatched returned ID is denied.
- [ ] Run `npx vitest run tests/backend/setup.test.ts` and observe missing discovery behavior.
- [ ] Implement normalized discovery using current Bitrix REST webhook transport and reuse its pagination/error handling.
- [ ] Add setup validation for `source.entityTypeId`, `categoryId`, `stageId`, compatible published template type and required name/date mappings.
- [ ] Run `npx vitest run tests/backend/setup.test.ts tests/backend/bitrix-webhook.test.ts` and `npm run typecheck`.

### Task 3: Configure and safely execute source trigger rules

**Files:** Modify `src/server/events.ts`, `src/server/worker.ts`, `src/server/journeys.ts`, `src/server/workspace.ts`, `src/server/http.ts`, `src/components/settings.tsx`, `src/components/workspace.tsx`, `src/lib/client.ts`, `src/app/api/workspace/route.ts`, and `tests/backend/events.test.ts`, `tests/backend/journeys.test.ts`, `tests/e2e/workspace.spec.ts`.

**Interfaces:** Expand `EventJob` to `{ event: string; entityTypeId?: number; itemId?: number; taskId?: string }` for `ONCRMDEALUPDATE`, `ONCRMLEADUPDATE`, `ONCRMDYNAMICITEMUPDATE`, and task events. Add `JourneyOriginKey` as `portalDomain:entityTypeId:itemId` and `Journeys.findByOrigin(key)`. `Worker.processSourceEvent(job)` rereads the entity, matches one enabled rule against its current stage/category, resolves mapped person/date data, writes a source-specific issue if required values are missing, then reserves the origin key before creating one journey. Keep the CRM/Smart Process origin separately from the RH movement record: when the source is already the configured RH movement process, link that item directly; otherwise create one RH movement with the mapped name in its title, date and available employee ID, and store the origin link locally. Leave the destination employee field empty when the candidate has no Bitrix user; RH-process configuration must confirm that the field is optional for automatic CRM candidates. Reconciliation queries configured source kinds and stages every 60 seconds and feeds discovered IDs through the same `processSourceEvent` path. Settings exposes a safe list of rules and last execution result; its editor selects source, entity/process, funnel/category, stage, data fields, journey type and published template.

- [ ] Write tests for lead, deal and Smart Process events, event payload variants, current-state reread, wrong-stage ignore, missing-field issue and source-key deduplication.

```ts
await worker.processSourceEvent(job);
await worker.processSourceEvent(job);
expect(store.list("journey", journeySchema)).toHaveLength(1);
expect(bitrix.calls.filter((call) => call.method === "tasks.task.add")).toHaveLength(0);
```

- [ ] Write concurrency tests that invoke the same source twice and prove one journey and one HR movement reservation result.
- [ ] Write reconciliation tests that recover an event missed while the Nexo endpoint was unavailable and ignore a source record no longer at the configured stage.
- [ ] Run `npx vitest run tests/backend/events.test.ts tests/backend/journeys.test.ts`; verify the new assertions fail on unsupported CRM events and duplicate-free origin storage.
- [ ] Implement event parsing/authentication, source matching, atomic origin reservation and per-record recoverable issues; keep existing webhook validation and 60-second worker lease.
- [ ] Build the compact rule editor with a review-before-enable action; show source, selected stage, model and last result in a readable rules list.
- [ ] Add an e2e flow with synthetic discovered fields that configures and enables a deal-stage onboarding rule and shows a missing-data issue without creating a task.
- [ ] Run focused Vitest, the trigger-rule Playwright test, `npm run typecheck` and `npm run lint`.

### Task 4: Release model stages and create only eligible Bitrix tasks

**Files:** Modify `src/shared/contracts.ts`, `src/shared/validation.ts`, `src/server/domain.ts`, `src/server/validation.ts`, `src/server/journeys.ts`, `src/server/worker.ts`, `src/components/templates.tsx`, `src/components/journey-detail.tsx`, and `tests/backend/journeys.test.ts`, `tests/client/client.test.ts`, `tests/e2e/workspace.spec.ts`.

**Interfaces:** `Journeys.create(session, input, origin?)` snapshots `JourneyStageSnapshot[]`, planned tasks and `JourneyPerson` but performs no `tasks.task.add`. `Journeys.releaseEligibleStages(journeyId, now = new Date())` releases due/immediate stages and stages whose previous required activities are all Bitrix-confirmed complete, then enqueues or runs one idempotent task-creation job for newly released activity IDs. `Journeys.runJourney(id)` creates only tasks with `releaseState === "released"`, reconciles every uncertain create by the stable journey/activity marker, and never sends waiting activities. `StageDefinition.release` is edited in the template UI: first-stage options are immediate/date; later-stage options are date/after previous required tasks. `pause(id)` and `resume(id)` preserve existing task state and prevent/restart releases. Completing a journey requires all required activities to have released and completed; waiting required work prevents completion.

- [ ] Add failing tests proving journey creation makes zero task REST calls before a stage is released and saves all planned activities as waiting/released correctly.

```ts
const journey = await journeys.create(session, input);
expect(bitrix.calls.some((call) => call.method === "tasks.task.add")).toBe(false);
expect(journey.stages.map((stage) => stage.state)).toEqual(["released", "waiting"]);
```

- [ ] Add tests for immediate first stage, date stage on/before its release time, overdue catch-up without deadline shifting, and previous-stage release after all required tasks complete.
- [ ] Add tests proving optional tasks do not block, `awaiting_review` and incomplete required checklist items do block, and duplicate workers create each activity once.
- [ ] Add tests for partial Bitrix task creation, uncertain responses, restart recovery, paused/cancelled journeys, and completion blocked by waiting required stages.
- [ ] Run `npx vitest run tests/backend/journeys.test.ts` and confirm stage-release assertions fail on current eager task creation.
- [ ] Implement deterministic stage transition/release logic and persist release state before enqueuing network work; keep task state refresh sourced from Bitrix.
- [ ] Add release mode controls to template editing with inline examples for date offsets and predecessor completion; show each journey stage as waiting, active or complete.
- [ ] Run focused Vitest, `npm run typecheck`, `npm run lint`, and e2e tests for template release configuration and journey stage visibility.

### Task 5: Support a CRM person before Bitrix user creation

**Files:** Modify `src/server/journeys.ts`, `src/server/worker.ts`, `src/server/workspace.ts`, `src/server/validation.ts`, `src/components/journey-form.tsx`, `src/components/journey-detail.tsx`, `src/components/settings.tsx`, and `tests/backend/journeys.test.ts`, `tests/e2e/fixtures.ts`, `tests/e2e/workspace.spec.ts`.

**Interfaces:** `JourneyPerson.bitrixUserId` is nullable while `origin` and mapped name/date remain available. Add RH-only `Journeys.linkEmployee(journeyId, bitrixUserId)` that verifies the active Bitrix user and records an audit entry. Activities assigned to the collaborator remain blocked from Bitrix task creation while no user ID is linked; activities assigned to configured RH/manager/TI users can release normally. The journey detail shows a clear “Vincular usuário Bitrix” action and identifies activities waiting on that link. Existing manual start continues requiring an active Bitrix user.

- [ ] Add tests for an automatic CRM candidate with no Bitrix account, linking an active user, rejecting inactive/unknown IDs and requiring RH authorization.

```ts
const journey = await worker.processSourceEvent(dealEvent);
expect(journey.person.bitrixUserId).toBeNull();
expect(journey.tasks.find((task) => task.assigneeRole === "colaborador")?.releaseState).toBe("waiting");
```

- [ ] Add tests proving only collaborator-assigned tasks wait for the link while other released tasks are created once.
- [ ] Run the focused journey tests and confirm current required-user behavior cannot represent a candidate identity.
- [ ] Implement safe person snapshot/linking and re-run stage release immediately after a valid link.
- [ ] Add e2e coverage that links a synthetic candidate to a test Bitrix user and verifies the blocked task becomes eligible.
- [ ] Run focused Vitest, `npm run typecheck`, `npm run lint` and the new Playwright flow.

### Task 6: Verify webhook installation and the test Bitrix portal end to end

**Files:** Modify `docs/manual-instalacao.md`, `docs/api.md`, `docs/homologacao.md`, `docs/seguranca.md`, `tests/backend/bitrix-webhook.test.ts`, and `tests/e2e/workspace.spec.ts`.

**Interfaces:** Document only the event names supported by the webhook-only design, required incoming webhook scopes and how RH selects discovered stages/fields. Add a homologation checklist that records expected behavior without storing the webhook URLs/tokens or real employee information. The test portal test is operator-driven through the Nexo UI; automated tests remain synthetic.

- [ ] Add a webhook parser test matrix for CRM deal, CRM lead, Smart Process and task update payloads in nested and flattened form, including invalid token/domain/IDs.
- [ ] Document in Portuguese how to register the test portal's outgoing CRM/Smart Process/task events and verify that a missed event is recovered by reconciliation.
- [ ] Document that a CRM candidate may lack a Bitrix user and that collaborator-owned tasks wait until RH links the account.
- [ ] Run the complete synthetic end-to-end scenario: source event -> one journey -> first-stage tasks -> Bitrix task completion -> next-stage tasks -> journey completion.
- [ ] In the user's Bitrix test portal, verify one CRM or Smart Process trigger, one date release, one predecessor-completion release, task/project links, duplicate event handling and a 60-second recovery. Record only pass/fail and sanitized record IDs in local test notes; never capture credentials.
- [ ] Run `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`, `npm run test:e2e`, and `git diff --check`.

## Final verification

- Synthetic backend and browser suites prove legacy migration, trigger discovery, missing-data safety, idempotent event/reconciliation, progressive releases, candidate-to-user linking, role visibility, pause/cancel and completion rules.
- The user's Bitrix test portal confirms the configured webhook scopes/events, one automatic source trigger, native tasks and Kanban placement, release after Bitrix completion, and recovery after an intentionally missed notification.
- The production bundle contains no test portal credentials, webhook URL, secrets or real employee data.
