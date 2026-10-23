# Nexo RH Exception Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax.

**Goal:** Redesign Nexo around a senior-RH exception queue that explains priority, keeps person/journey context available, and opens the real Bitrix task in one action.

**Architecture:** Keep all domain decisions in the existing workspace and journey/task records. Add a small, tested RH-task priority helper, reshape the daily agenda into a focused queue with a context inspector, then carry the approved visual language through the existing app shell and pages without changing backend contracts or Bitrix operations.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Lucide, existing CSS tokens, Vitest, Playwright.

## Global Constraints

- Keep Bitrix24 as the source of truth for users, movement records, tasks, and checklists.
- Use only Bitrix inbound and outbound webhooks.
- Keep RH activities visible across active journeys even when another RH user is assigned.
- Preserve the approved light, graphite, emerald, amber, and red palette.
- Do not imply a generative AI connection; explanations must cite existing records and rules.
- Respect visibility (`hr`, `team`, `employee`), session permissions, reduced-motion preference, keyboard focus, and narrow Bitrix/mobile viewports.
- Do not claim that Nexo executes external access revocations.

## File Map

- `src/lib/rh-priority.ts`: pure, deterministic priority ranking and explanation for one RH task.
- `tests/client/rh-priority.test.ts`: real-data tests for ranking and reason labels.
- `src/components/rh-daily-agenda.tsx`: RH exception queue, next-action focus, selectable tasks, and person/journey context inspector.
- `src/components/readiness-queue.tsx`: keep existing Radar data while aligning row hierarchy and status language.
- `src/components/workspace.tsx`: fit the overview around the RH work queue and retain journey/calendar navigation.
- `src/components/nexo-app.tsx`: align shared shell and navigation with the new visual hierarchy, preserving current actions and permissions.
- `src/components/journey-detail.tsx`, `src/components/templates.tsx`, `src/components/settings.tsx`: apply consistent typography, separators, statuses, and action priority without changing behavior.
- `src/app/globals.css`: responsive layout, typography, signal treatment, motion, and shared surface rules.
- `tests/e2e/workspace.spec.ts`: assert RH queue context and actions survive the redesign on desktop and narrow viewports.
- `DESIGN.md`: record the shipped visual system after screenshots and review.

---

### Task 1: Rank RH activities by intervention priority

**Files:**
- Create: `src/lib/rh-priority.ts`
- Create: `tests/client/rh-priority.test.ts`
- Modify: `src/components/rh-daily-agenda.tsx`

**Interfaces:**
- `RhAgendaItem` contains `{ journey: Journey; task: JourneyTask; overdue: boolean }`.
- `priorityForRhItem(item)` returns `{ rank: 0 | 1 | 2 | 3; reason: string }`.
- `sortRhAgendaItems(items)` returns items ordered by rank, then `task.dueAt` ascending.

- [x] Write a failing test with four synthetic activities: critical overdue, ordinary overdue, critical due today, and ordinary due today. Assert that order and reasons are respectively “Atividade crítica vencida”, “Prazo vencido”, “Atividade crítica prevista para hoje”, and “Prazo de hoje”.
- [x] Run `npm test -- tests/client/rh-priority.test.ts` and confirm it fails because the helper does not exist.
- [x] Implement the pure helpers using `task.critical` and the already-calculated `overdue` flag; do not add new risk rules or mutate input items.
- [x] Run the focused test and confirm it passes, then run `npm run typecheck`.
- [x] Replace the inline sort in `collectItems` with `sortRhAgendaItems` and carry the returned reason to the queue view.

### Task 2: Build the senior-RH exception queue and context inspector

**Files:**
- Modify: `src/components/rh-daily-agenda.tsx`
- Modify: `src/app/globals.css`
- Test: `tests/e2e/workspace.spec.ts`

**Interfaces:**
- Continue consuming `Workspace` and using `onTask(journey, task)` to open the existing selected-task detail.
- Keep the agenda scope exactly: RH-role tasks in active/creating journeys, overdue or due today in the portal timezone, excluding completed work.

- [x] Add a failing Playwright test that opens a RH user workspace and verifies the first item shows task, person, stage, deadline reason, assignee, status, and “Abrir atividade”; verify the context panel shows model/version and the movement reference date.
- [x] Run `npm run test:e2e -- --grep "contexto da prioridade"` and confirm the expected new labels are absent.
- [x] Split the queue into a focus row and a compact task list: select the highest-priority item by default; selecting another row updates the context inspector; the primary action calls the existing `onTask` callback with that exact task.
- [x] Add the “Por que está em foco” explanation from `priorityForRhItem`, and show critical/required checklist state using existing `task.critical`, `task.required`, and `task.checklist` fields only.
- [x] Show the Bitrix link only when `task.bitrixUrl` exists; keep it a separate external link with safe `target` and `rel` attributes.
- [x] Add accessible headings, button names, selected state, keyboard focus, and loading/empty states; preserve `prefers-reduced-motion`.
- [x] Run the focused e2e test, `npm run typecheck`, and `npm run lint`.

### Task 3: Make the overview scan like an operational decision surface

**Files:**
- Modify: `src/components/workspace.tsx`
- Modify: `src/components/readiness-queue.tsx`
- Modify: `src/app/globals.css`
- Test: `tests/e2e/workspace.spec.ts`

- [x] Add an e2e assertion that the RH queue appears before the general Radar and journey list and that the Radar’s overdue/TI-within-48-hours reasons remain visible.
- [x] Run the affected e2e test and confirm it fails if the RH queue is moved below the journey overview.
- [x] Replace the four equal dashboard counters with a clear “Atenção de hoje” hierarchy: next RH intervention, actionable overdue/today counts, then the existing readiness queue and active journeys.
- [x] Use the existing search, date filters, `onView`, `onDate`, and journey modal callbacks; do not introduce new backend fields or charts with synthetic totals.
- [x] Align the Radar rows to the same person/task/reason/deadline reading order, preserving existing onboarding/offboarding filters and Bitrix links.
- [x] Keep the employee home personalized and permission-safe; the RH exception queue remains limited to sessions that already have `canManage`.
- [x] Run the focused e2e tests and `npm run typecheck`.

### Task 4: Carry the visual language across the product

**Files:**
- Modify: `src/components/nexo-app.tsx`
- Modify: `src/components/journey-detail.tsx`
- Modify: `src/components/templates.tsx`
- Modify: `src/components/settings.tsx`
- Modify: `src/app/globals.css`
- Test: `tests/e2e/workspace.spec.ts`

- [x] Add a Playwright test that visits journeys, templates, automations, settings, and a journey detail, asserting one app navigation landmark, visible page titles, and no horizontal overflow at 390px.
- [x] Run the test and confirm the new title/navigation assertions fail before implementation.
- [x] Use the existing green/graphite/light palette and reduce card framing: make section rhythm, strong typography, precise dividers, and semantic status markers carry hierarchy.
- [x] Give the shared app shell compact responsive navigation, a clear current location, portal sync status, and the existing `Ctrl/Cmd+K` search affordance.
- [x] Preserve all route callbacks, role-gated navigation, modal behavior, task actions, form controls, and status colors. Do not change server files or API contracts.
- [x] Run the focused e2e test, `npm run typecheck`, and `npm run lint`.

### Task 5: Verify, inspect, and document the shipped system

**Files:**
- Modify: `src/app/globals.css` only if the two inspection rounds reveal a material visual defect.
- Create: `DESIGN.md`
- Output: `output/playwright/nexo-central.png`, `output/playwright/nexo-mobile.png`, and one journey-detail screenshot.

- [x] Run `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build`.
- [x] Run `npx playwright install chromium` if Chromium is not installed, then run `npm run test:e2e`.
- [x] Capture one desktop and one 390px viewport in the same Playwright run using the synthetic fixtures; inspect them together for focus order, contrast, clipping, and task/context hierarchy.
- [x] Fix all material issues from that inspection in one batch and capture the same views once more; stop after this second inspection round.
- [x] Run `node C:\Users\rico7\.codex\skills\impeccable\scripts\detect.mjs --json src/components/nexo-app.tsx src/components/workspace.tsx src/components/rh-daily-agenda.tsx src/components/readiness-queue.tsx src/app/globals.css` once and resolve every material finding.
- [x] Write `DESIGN.md` from the final rendered interface: palette, typography, navigation, hierarchy, status language, responsive rules, motion, and accessibility.
- [x] Run `git diff --check` and ensure screenshots contain only explicitly synthetic test data.
