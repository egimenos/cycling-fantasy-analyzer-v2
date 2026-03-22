---
work_package_id: WP01
title: Design System Foundation
lane: 'done'
dependencies: []
base_branch: main
base_commit: cb200ea39a10b206868140f0c75b0f6a72886f69
created_at: '2026-03-22T12:17:36.056478+00:00'
subtasks:
  - T001
  - T002
  - T003
  - T004
  - T005
  - T006
  - T007
phase: Phase 0 - Foundation
assignee: ''
agent: 'claude-opus'
shell_pid: '31655'
review_status: 'approved'
reviewed_by: 'egimenos'
history:
  - timestamp: '2026-03-22T12:03:57Z'
    lane: planned
    agent: system
    shell_pid: ''
    action: Prompt generated via /spec-kitty.tasks
requirement_refs:
  - FR-001
  - FR-002
  - FR-003
  - FR-019
  - FR-020
---

# Work Package Prompt: WP01 – Design System Foundation

## ⚠️ IMPORTANT: Review Feedback Status

**Read this first if you are implementing this task!**

- **Has review feedback?**: Check the `review_status` field above. If it says `has_feedback`, scroll to the **Review Feedback** section immediately.
- **You must address all feedback** before your work is complete.

---

## Review Feedback

_[This section is empty initially. Reviewers will populate it if the work is returned from review.]_

---

## Objectives & Success Criteria

- Replace the entire CSS custom property system in `app.css` with "The Technical Peloton" design tokens
- Load Google Fonts (Manrope, Inter, JetBrains Mono) with preconnect
- Restyle all 16 shared UI components to use new tokens
- **Zero hardcoded color values** in any component — all colors via Tailwind utility classes referencing design tokens
- After this WP, the app should load with the correct dark navy background, correct fonts, sharp corners, and no 1px solid borders

## Context & Constraints

- **Constitution**: `.kittify/memory/constitution.md` — Tailwind CSS, shadcn/ui, Feature-Sliced Design
- **Plan**: `kitty-specs/009-peloton-design-system-redesign/plan.md` — DD-001 (tokens as CSS vars), DD-003 (big bang)
- **Research**: `kitty-specs/009-peloton-design-system-redesign/research.md` — R-001 (Tailwind 4 tokens), R-004 (Google Fonts)
- **Design Reference**: `redesign/stitch_cycling_fantasy_analizer/peloton_analytics/DESIGN.md` — full design system spec
- **Design HTML**: `redesign/stitch_cycling_fantasy_analizer/1._initial_setup_simplified/code.html` — reference Tailwind config with all color tokens

**Key constraint**: Tailwind CSS 4 uses `@theme inline` in CSS, NOT a JS config file. The Stitch HTML uses CDN Tailwind v3 with `tailwind.config = {...}` — we must translate those tokens to the CSS-first syntax.

**Implementation command**: `spec-kitty implement WP01`

## Subtasks & Detailed Guidance

### Subtask T001 – Replace CSS custom properties in `apps/web/src/styles/app.css`

- **Purpose**: Establish the single source of truth for all design tokens. Every color, font, and radius in the app traces back to this file.
- **Steps**:
  1. Remove the existing `:root` and `.dark` blocks with oklch values
  2. Create a single `:root` block (dark-only) with these token groups:

  **Surface hierarchy** (from DESIGN.md Section 2):

  ```css
  --surface-dim: #0b1326;
  --surface-container-lowest: #060e20;
  --surface-container-low: #131b2e;
  --surface-container: #171f33;
  --surface-container-high: #222a3d;
  --surface-container-highest: #2d3449;
  --surface-bright: #31394d;
  ```

  **On-surface text colors**:

  ```css
  --on-surface: #dae2fd;
  --on-surface-variant: #c5c6cd;
  --on-primary-container: #8590a6;
  --on-background: #dae2fd;
  ```

  **Primary/Secondary/Tertiary** (map to shadcn semantic tokens):

  ```css
  --primary: #bcc7de;
  --primary-foreground: #263143;
  --primary-container: #1e293b;
  --primary-fixed: #d8e3fb;
  --primary-fixed-dim: #bcc7de;
  --secondary: #adc6ff;
  --secondary-foreground: #002e6a;
  --secondary-container: #0566d9;
  --tertiary: #eac34a;
  --tertiary-container: #cca830;
  ```

  **Functional colors**:

  ```css
  --destructive: #ffb4ab;
  --destructive-foreground: #690005;
  --error: #ffb4ab;
  --error-container: #93000a;
  --outline: #8f9097;
  --outline-variant: #45474c;
  ```

  **Category colors** (cycling discipline colors):

  ```css
  --color-gc: #3b82f6;
  --color-stage: #22c55e;
  --color-mountain: #f97316;
  --color-sprint: #ef4444;
  ```

  **Border radius**:

  ```css
  --radius: 0.125rem;
  ```

  3. Update the `@theme inline` block to map all new tokens to Tailwind utility classes:

  ```css
  @theme inline {
    --color-surface-dim: var(--surface-dim);
    --color-surface-container-lowest: var(--surface-container-lowest);
    --color-surface-container-low: var(--surface-container-low);
    --color-surface-container: var(--surface-container);
    --color-surface-container-high: var(--surface-container-high);
    --color-surface-container-highest: var(--surface-container-highest);
    --color-surface-bright: var(--surface-bright);
    --color-on-surface: var(--on-surface);
    --color-on-surface-variant: var(--on-surface-variant);
    --color-on-primary-container: var(--on-primary-container);
    --color-on-background: var(--on-background);
    --color-primary: var(--primary);
    --color-primary-foreground: var(--primary-foreground);
    --color-primary-container: var(--primary-container);
    --color-primary-fixed: var(--primary-fixed);
    --color-primary-fixed-dim: var(--primary-fixed-dim);
    --color-secondary: var(--secondary);
    --color-secondary-foreground: var(--secondary-foreground);
    --color-secondary-container: var(--secondary-container);
    --color-tertiary: var(--tertiary);
    --color-tertiary-container: var(--tertiary-container);
    --color-destructive: var(--destructive);
    --color-destructive-foreground: var(--destructive-foreground);
    --color-error: var(--error);
    --color-error-container: var(--error-container);
    --color-outline: var(--outline);
    --color-outline-variant: var(--outline-variant);
    --color-gc: var(--color-gc);
    --color-stage: var(--color-stage);
    --color-mountain: var(--color-mountain);
    --color-sprint: var(--color-sprint);
    --font-family-headline: 'Manrope', sans-serif;
    --font-family-body: 'Inter', sans-serif;
    --font-family-mono: 'JetBrains Mono', monospace;
    --radius-sm: calc(var(--radius) - 0.0625rem);
    --radius-md: var(--radius);
    --radius-lg: calc(var(--radius) + 0.125rem);
    --radius-xl: calc(var(--radius) + 0.375rem);
  }
  ```

  4. Update the `@layer base` block:

  ```css
  @layer base {
    * {
      @apply border-outline-variant/15;
    }
    body {
      @apply bg-surface-dim text-on-surface font-body;
    }
  }
  ```

  5. Keep the `@custom-variant dark` line for future light theme support but remove the `.dark {}` block

- **Files**: `apps/web/src/styles/app.css`
- **Validation**: Run `pnpm --filter web dev` and verify:
  - Body background is dark navy (#0b1326)
  - Text is light (#dae2fd)
  - No CSS errors in console
  - Tailwind classes like `bg-surface-container-high`, `text-on-surface`, `font-headline` work

### Subtask T002 – Add Google Fonts to `apps/web/index.html`

- **Purpose**: Load the three font families required by the design system.
- **Steps**:
  1. Add preconnect links before the existing `<link>` tags:
  ```html
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link
    href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500;700&family=Manrope:wght@700;800&display=swap"
    rel="stylesheet"
  />
  ```
- **Files**: `apps/web/index.html`
- **Validation**: Open Network tab, verify fonts load from `fonts.gstatic.com`

### Subtask T003 – Restyle `button.tsx`

- **Purpose**: Apply sharp corners and new color tokens to all button variants.
- **Steps**:
  1. Update the `buttonVariants` CVA definition:
     - `default` variant: `bg-primary text-primary-foreground` → sharp corners via `rounded-sm` (which is now 0.0625rem)
     - `destructive`: `bg-destructive text-destructive-foreground`
     - `outline`: `border border-outline-variant/15 bg-transparent text-on-surface hover:bg-surface-container-high`
     - `secondary`: `bg-surface-container-high text-on-surface hover:bg-surface-container-highest`
     - `ghost`: `hover:bg-surface-container-high text-on-surface`
     - `link`: `text-primary underline-offset-4`
  2. For a "metallic gradient" primary CTA style, add a new variant or utility class:
     ```
     bg-gradient-to-br from-primary-fixed-dim to-primary-container text-on-surface
     ```
  3. Ensure all sizes use consistent padding and the `font-body` or `font-headline` where appropriate
- **Files**: `apps/web/src/shared/ui/button.tsx`
- **Parallel?**: Yes — independent file

### Subtask T004 – Restyle `card.tsx` and `badge.tsx`

- **Purpose**: Apply no-line philosophy to cards, add category color variants to badges.
- **Steps**:
  1. **card.tsx**: Replace border styling with surface layer backgrounds:
     - Card: `bg-surface-container-low` (no border, or `border-outline-variant/10` ghost border max)
     - CardHeader: remove bottom border, use spacing instead
     - Apply `rounded-sm` consistently
  2. **badge.tsx**: Update variants:
     - `default`: `bg-surface-container-high text-on-surface`
     - `secondary`: `bg-secondary-container/20 text-secondary border-secondary/30`
     - `destructive`: `bg-error-container/20 text-error`
     - `success`: `bg-green-500/10 text-green-400 border-green-500/20`
     - `warning`: `bg-tertiary/10 text-tertiary border-tertiary/20`
     - Add new variants: `gc` (blue), `stage` (green), `mountain` (orange), `sprint` (red) using the category color tokens
     - All badges: `rounded-sm font-mono text-xs` (sharp, monospace)
- **Files**: `apps/web/src/shared/ui/card.tsx`, `apps/web/src/shared/ui/badge.tsx`
- **Parallel?**: Yes

### Subtask T005 – Restyle `input.tsx`, `textarea.tsx`, `select.tsx`

- **Purpose**: Match the Stitch input styling — no visible border, surface-container-high background.
- **Steps**:
  1. All inputs: `bg-surface-container-high border-none rounded-sm text-on-surface placeholder:text-outline/40 focus:ring-1 focus:ring-primary-fixed font-body`
  2. Remove any `border-input` references
  3. Textarea: same styling, add `font-mono` variant for code/data input
  4. Select trigger: same background, use `text-on-surface` and `bg-surface-container-high`
- **Files**: `apps/web/src/shared/ui/input.tsx`, `apps/web/src/shared/ui/textarea.tsx`, `apps/web/src/shared/ui/select.tsx`
- **Parallel?**: Yes

### Subtask T006 – Restyle `score-badge.tsx`, `ml-badge.tsx`, `budget-indicator.tsx`

- **Purpose**: Apply monospace fonts and category color coding to score displays, gradient to budget bar.
- **Steps**:
  1. **score-badge.tsx**: Use `font-mono` for all numeric values. Color coding:
     - Top 25%: green text on green/10 bg
     - Middle 50%: `text-tertiary` on `tertiary/10` bg
     - Bottom 25%: `text-error` on `error-container/20` bg
     - Borders: matching color at 30% opacity
     - Sharp corners: `rounded-sm`
  2. **ml-badge.tsx**: Update to use `bg-secondary-container/20 text-secondary` instead of purple, `font-mono`
  3. **budget-indicator.tsx**: Track: `bg-surface-container-highest rounded-full`. Indicator: `bg-gradient-to-r from-secondary to-blue-400`. Over-budget: indicator shifts to `bg-error` with pulse animation. Labels: `font-mono text-xs`
- **Files**: `apps/web/src/shared/ui/score-badge.tsx`, `apps/web/src/shared/ui/ml-badge.tsx`, `apps/web/src/shared/ui/budget-indicator.tsx`
- **Parallel?**: Yes

### Subtask T007 – Restyle remaining shared UI components

- **Purpose**: Ensure all shared components use the new palette consistently.
- **Steps**:
  1. **accordion.tsx**: Remove borders between items. Use `bg-surface-container-low` for item backgrounds. Trigger hover: `bg-surface-container-high`. Content: use spacing instead of borders for separation.
  2. **empty-state.tsx**: Update to use `text-on-surface` for title, `text-on-surface-variant` for description, icon container with `bg-surface-container-high rounded-full`
  3. **error-alert.tsx**: Use `bg-error-container/20 border-l-4 border-error` styling (left accent border only)
  4. **alert.tsx**: Similar pattern — `bg-surface-container-high` with left accent border for variant
  5. **loading-spinner.tsx**: Update spinner color to `text-primary`
- **Files**: `apps/web/src/shared/ui/accordion.tsx`, `apps/web/src/shared/ui/empty-state.tsx`, `apps/web/src/shared/ui/error-alert.tsx`, `apps/web/src/shared/ui/alert.tsx`, `apps/web/src/shared/ui/loading-spinner.tsx`
- **Parallel?**: Yes

## Risks & Mitigations

- **Tailwind 4 `@theme` syntax**: Verify that custom color names with hyphens (e.g., `surface-container-high`) generate correct utility classes. Test with `bg-surface-container-high` in a component.
- **Font loading FOUT**: Fonts may flash unstyled on first load. Use `display=swap` (already included) to minimize perceived delay.
- **Existing component tests**: Some unit tests may assert specific class names. These will break — that's expected and will be addressed in WP07.

## Review Guidance

- **Check**: Every shared UI component uses only design token classes, never hardcoded hex values
- **Check**: Body renders with #0b1326 background and #dae2fd text
- **Check**: Fonts load correctly (inspect computed font-family in DevTools)
- **Check**: No 1px solid borders anywhere — only ghost borders (outline-variant at 10-15% opacity) or tonal shifts
- **Check**: All existing component props/APIs are preserved — only styling changed

## Activity Log

- 2026-03-22T12:03:57Z – system – lane=planned – Prompt created.
- 2026-03-22T12:17:37Z – claude-opus – shell_pid=14218 – lane=doing – Assigned agent via workflow command
- 2026-03-22T12:22:09Z – claude-opus – shell_pid=14218 – lane=for_review – Design system foundation complete: tokens, fonts, 15 restyled components
- 2026-03-22T12:39:06Z – claude-opus – shell_pid=31655 – lane=doing – Started review via workflow command
- 2026-03-22T12:41:12Z – claude-opus – shell_pid=31655 – lane=done – Review passed: all design tokens via CSS vars, zero hardcoded hex, 15 components restyled with no-line philosophy
