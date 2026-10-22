# Agenda diária de RH Implementation Plan

> **For agentic workers:** Execute this plan inline in the current user-authorized task. Work through the single task and verify the UI and build.

**Goal:** Put all pending RH-role activities due today or overdue from active journeys on the RH home page.

**Architecture:** Derive the agenda from the workspace journeys already delivered to the signed-in RH/admin session. Add a focused agenda component that groups and sorts its items, and open the existing journey detail with the chosen task selected.

**Tech Stack:** Next.js App Router, React, TypeScript, Lucide, existing workspace contracts and CSS.

## Global Constraints

- Preserve the Bitrix24 workspace as the source of task status and checklists.
- Use the configured portal timezone for calendar-day grouping.
- Show RH-role activities from active journeys regardless of assigned person.
- Keep actions and data access within the current session permissions.
- Retain the current Nexo light surface, graphite, emerald and semantic deadline colors.

---

### Task 1: Add the RH daily agenda to the overview

**Files:**
- Create: `src/components/rh-daily-agenda.tsx`
- Modify: `src/components/workspace.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**
- Consumes `Workspace`, `Journey`, and `JourneyTask` from `src/shared/contracts.ts`.
- Accepts `onTask(journey: Journey, task: JourneyTask): void` so the existing modal opens the selected activity.
- Uses `workspace.settings.timezone`, `task.assigneeRole`, `task.dueAt`, `task.status`, and `journey.status` to derive visible rows.

- [ ] Show only tasks with `assigneeRole === "rh"` in active or creating journeys; exclude completed tasks and tasks due after today in the configured timezone.
- [ ] Group past deadlines under “Atrasadas” and the remaining local-date matches under “Para hoje”; order by criticality and then due time.
- [ ] Display task title, employee, stage, assignee, task state, deadline, and a clear “Abrir atividade” action; provide counts and an “Tudo em dia” empty state.
- [ ] Render for RH/admin sessions above the general deadline queue, with responsive rows and visible keyboard focus.
- [ ] Run `npm run typecheck`, `npm run lint`, and `npm run build`; inspect desktop and narrow layouts.
