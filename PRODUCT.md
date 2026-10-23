# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- People/RH operators who coordinate active onboarding and offboarding journeys and need to see all RH work due today.
- Managers, IT executors, and collaborators who complete or follow the activities assigned to them.

## Product Purpose

Nexo standardizes employee entry and exit processes by organizing stages, owners, deadlines, and checklists. Success means RH can see what needs attention, move through the work reliably, and confirm completion in Bitrix24.

## Positioning

Nexo turns each people movement into real Bitrix24 tasks and brings the context, priorities, and progress of the journey into one operational view.

## Operating Context

Nexo is hosted on Onnira and connected to a Bitrix24 portal using inbound and outbound webhooks. RH works from a private Nexo account; Bitrix24 remains the source of truth for users, movement records, tasks, and checklists. The product is used in Portuguese for an organization in Brazil.

## Capabilities and Constraints

- Configure versioned onboarding and offboarding templates, stages, activities, instructions, owners, due dates, and checklists.
- Start a journey manually or from a configured Bitrix24 approval event.
- Give RH an overview of every RH activity in active journeys that is overdue or due today.
- Track readiness, task synchronization, approvals, pending work, and completion requirements.
- Run inside a web browser, including the Bitrix24 context, and use Bitrix24 through webhooks only.
- Use local Nexo accounts for access; the Bitrix webhook owner is the identity used for Bitrix operations.
- Do not claim that Nexo directly revokes access in external systems; it tracks requests for the responsible team.

## Evidence on Hand

- User-provided onboarding/offboarding SOPs and challenge brief are referenced in the project history.
- Current implementation: Next.js, TypeScript, SQLite, Bitrix24 webhook integration, RH daily agenda, journey management, templates, and readiness queue.
- No real customer metrics, testimonials, or public performance claims have been provided.

## Product Principles

- Put the next useful RH action in view without hiding the journey context.
- Keep Bitrix24 tasks, checklists, and movement records authoritative.
- Make responsibility, timing, and blockers explicit.
- Protect internal People information and credentials.
- Keep critical offboarding work respectful, traceable, and controlled.
