---
name: Nexo · Pessoas e processos
description: Central operacional de RH para acompanhar jornadas ligadas ao Bitrix24.
colors:
  primary: "#17785c"
  primary-hover: "#116348"
  graphite: "#202825"
  neutral-background: "#f7f9f8"
  surface: "#ffffff"
  text: "#202a28"
  muted-text: "#526158"
  divider: "#e8edea"
  mint: "#eaf5ef"
  warning: "#ac721a"
  warning-background: "#fff7e8"
  danger: "#b34c43"
  danger-background: "#fff0ec"
typography:
  display:
    fontFamily: "IBM Plex Sans, system-ui, sans-serif"
    fontSize: "clamp(25px, 2.3vw, 31px)"
    fontWeight: 600
    lineHeight: 1.18
    letterSpacing: "-0.035em"
  body:
    fontFamily: "IBM Plex Sans, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
rounded:
  sm: "6px"
  md: "8px"
  lg: "10px"
  dialog: "12px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface}"
    rounded: "{rounded.sm}"
    padding: "9px 14px"
  navigation-active:
    backgroundColor: "#34483b"
    textColor: "#f1fbf5"
    rounded: "{rounded.sm}"
---

# Design System: Nexo · Pessoas e processos

## Overview

**Creative North Star: “A mesa de operações que mantém a pessoa visível.”**

Nexo is an operational workspace for People teams. Its RH home is a concise queue of due and overdue work, with the person, owner, deadline, and a direct action on each row. Bitrix24 remains the source of operational work; Radar, dates, history, and complete journeys stay in the Jornadas section.

The interface uses a compact graphite navigation rail and open, light work surfaces. Emerald marks safe action and current location; amber and red are reserved for time pressure and risk. Information is arranged in a clear reading sequence, with real names, dates, statuses, and explanations carrying more weight than decorative metrics.

**Key Characteristics:**

- Show the next activity, its owner, and its deadline before supporting context.
- Explain urgency only when a real deadline, critical flag, or sync error requires attention.
- Use semantic color for status and restrained surfaces for structure.

## Colors

Emerald actions sit against cool, quiet neutrals; amber and red identify time pressure with distinct text and icon cues.

### Primary
- **Operational emerald** (`{colors.primary}`): primary actions, current navigation, links, and safe progress.
- **Deep emerald** (`{colors.primary-hover}`): hover state for primary actions.

### Secondary
- **Graphite** (`{colors.graphite}`): app navigation and the frame around the work surface.
- **Soft mint** (`{colors.mint}`): selected rows, calm status backgrounds, and supportive context.

### Tertiary
- **Deadline amber** (`{colors.warning}`) on `{colors.warning-background}`: activities due soon or critical activities due today.
- **Risk red** (`{colors.danger}`) on `{colors.danger-background}`: overdue critical work and synchronization errors.

### Neutral
- **Canvas** (`{colors.neutral-background}`): page background.
- **Surface** (`{colors.surface}`): task panels, lists, forms, and dialogs.
- **Ink** (`{colors.text}`): titles and primary content.
- **Secondary ink** (`{colors.muted-text}`): supporting copy and metadata; keep it readable on white and mint surfaces.
- **Divider** (`{colors.divider}`): fine separators between related records.

### Named Rules
**The Color Follows the Record Rule.** Use warning colors only when a deadline or status warrants them; do not use color alone to explain why a record needs attention.

## Typography

**Display Font:** IBM Plex Sans (with system-ui, sans-serif fallback)  
**Body Font:** IBM Plex Sans (with system-ui, sans-serif fallback)  
**Label/Mono Font:** IBM Plex Sans; use tabular numerals for counts and deadlines.

**Character:** Practical, calm, and direct. Weight and spacing establish hierarchy without a second display voice.

### Hierarchy
- **Display** (600, responsive 25–31px, 1.18): page titles.
- **Headline** (600, 20–26px, 1.22): the focused HR activity.
- **Title** (600, 12–17px, 1.4): panel and record names.
- **Body** (400, 12–14px, 1.5–1.65): descriptions, guidance, and readable process detail; long copy stays within roughly 65ch.
- **Label** (600, 10–11px, 1.4): field names, statuses, and compact metadata.

### Named Rules
**The Record Before the Number Rule.** Give a person, activity, reason, or deadline more visual weight than a summary count.

## Layout

The app uses a persistent graphite rail on desktop and a compact mobile menu. The work area grows to a maximum width of 1600px with generous desktop gutters, then reduces to 14px page padding on narrow screens. The RH exception center places the selected activity and its context in a two-column workbench; it stacks into one readable column below 900px. Filters and small action groups wrap before they force page-level horizontal scrolling.

Use 4px increments for tight control spacing and 8px increments for larger groups. Separate page titles from their first section more than related rows inside a section. Keep the person, stage, deadline, owner, and action adjacent when presenting a task.

## Elevation & Depth

Nexo uses tonal surfaces and thin dividers for most hierarchy. Cards and panels stay flat at rest; a small offset shadow belongs to actionable hover states and the modal backdrop. Keyboard focus uses a visible emerald outline with offset, and selected states use mint rather than a shadow.

### Shadow Vocabulary
- **Modal:** `0 25px 100px #162b2433` separates a focused dialog from the workspace.
- **Primary button hover:** `0 2px 5px #174a3320` gives a small lift to the highest-priority action.

### Named Rules
**The Flat Work Surface Rule.** Use borders and background tone to group routine work; reserve stronger depth for overlays and transient action states.

## Shapes

The form language uses compact rounded corners and restrained one-pixel borders. Buttons and small controls use 6px corners, work panels use 8–10px, and dialogs use 12px. Avatars and status markers remain circular; task rows stay rectangular so their alignment remains easy to scan.

## Components

### Buttons
- **Shape:** compact rounded rectangle (6px).
- **Primary:** emerald fill, white text, 38px minimum height, and 14px horizontal padding.
- **Hover / Focus:** darken the emerald slightly; keyboard focus receives a 2px outline with 3px offset.
- **Secondary / Ghost / Tertiary:** white with a fine border for secondary actions; transparent text buttons for low-emphasis navigation.

### Chips
- **Style:** compact pills or small rounded labels on soft neutral, mint, amber, or red backgrounds.
- **State:** selected filters use mint and emerald text. Deadline and risk chips include a label or icon as well as color.

### Cards / Containers
- **Corner Style:** 8–10px for work panels and 7px for reusable template tiles.
- **Background:** white on the page canvas; mint or pale neutral only for selected or contextual surfaces.
- **Shadow Strategy:** flat at rest; see Elevation & Depth for overlays and hover states.
- **Border:** one-pixel divider color; avoid accent borders as a substitute for hierarchy.
- **Internal Padding:** 16–25px depending on density, reducing to 14–16px on mobile.

### Inputs / Fields
- **Style:** white field, clear neutral stroke, compact 5px corners.
- **Focus:** emerald outline and border shift.
- **Error / Disabled:** semantic red error feedback; disabled controls retain readable content and visibly communicate unavailable action.

### Navigation
- **Style:** fixed graphite rail, compact labels, and a mint-green active indicator. On mobile the same navigation opens as a drawer; the active location remains marked with `aria-current`.

### RH Exception Center
The selected activity leads with the priority reason, then the person and stage, task description, deadline, owner, and status. “Por que está em foco” cites the deadline and the task's configured critical flag. A separate context column keeps movement date, template version, and required checklist progress visible. The next-action button opens the linked Nexo task detail; the Bitrix link is a separate external action when present.

## Do's and Don'ts

### Do:
- **Do** keep the next HR action and its explanation in the first screen of the workspace.
- **Do** pair any risk color with explicit status text and a readable reason.
- **Do** show the employee name, responsible person, and deadline with the selected activity.
- **Do** keep task and checklist states aligned with the Bitrix record.
- **Do** preserve a keyboard-visible focus outline and respect reduced-motion preferences.

### Don't:
- **Don't** turn task priority into a synthetic score or an unexplained AI recommendation.
- **Don't** let summary metrics outrank the person and next action.
- **Don't** use amber or red for decoration or to identify an entire journey type.
- **Don't** hide internal HR context inside employee-visible material.
