# Research: Peloton Design System Redesign

**Feature**: 009-peloton-design-system-redesign
**Date**: 2026-03-22

## R-001: Tailwind CSS 4 Custom Theme Tokens

**Decision**: Define all design tokens as CSS custom properties in `app.css` using `@theme inline` block, mapping to Tailwind utility classes.

**Rationale**: Tailwind CSS 4 uses `@theme` to declare custom design tokens that generate utility classes. The existing `app.css` already uses this pattern with shadcn/ui's oklch variables. We replace the oklch grayscale tokens with the Material Design surface tokens from the Stitch design (#0b1326, #131b2e, #222a3d, #31394d, etc.) and add new semantic tokens for category colors, typography families, and surface hierarchy.

**Alternatives considered**:

- Tailwind config file (`tailwind.config.ts`): Tailwind 4 prefers CSS-based configuration over JS config. The Stitch HTML uses a JS config, but that's because it uses the CDN version (v3 compat). Our app uses Tailwind 4 with CSS-first approach.
- CSS Modules: Would break the utility-first pattern already established.

**Implementation notes**:

- Surface tokens: `--surface-dim`, `--surface-container-low`, `--surface-container`, `--surface-container-high`, `--surface-container-highest`, `--surface-bright`
- On-surface tokens: `--on-surface`, `--on-surface-variant`, `--on-primary-container`
- Category color tokens: `--color-gc` (#3B82F6), `--color-stage` (#22C55E), `--color-mountain` (#F97316), `--color-sprint` (#EF4444)
- Typography: `--font-headline` (Manrope), `--font-body` (Inter), `--font-mono` (JetBrains Mono)
- Preserve shadcn/ui semantic tokens (primary, secondary, destructive, etc.) but remap their values to the new palette

## R-002: TanStack Router Search Params for Tab State

**Decision**: Use TanStack Router's `validateSearch` with a Zod schema to type-safe the `?tab=` search param. Default to `setup`.

**Rationale**: TanStack Router provides first-class support for typed search params via `validateSearch` on route definitions. This gives us:

- URL persistence (refresh keeps current tab)
- Type-safe access via `useSearch()`
- Navigation via `useNavigate()` with search param updates
- No additional state management library needed for tab selection

**Alternatives considered**:

- React state only: Loses tab position on refresh. Not ideal for debugging/sharing.
- Zustand/Jotai: Overkill for a single piece of UI state.

**Implementation notes**:

```typescript
// In index.tsx route definition
import { z } from 'zod';

const flowTabSchema = z.object({
  tab: z.enum(['setup', 'dashboard', 'optimization', 'roster']).default('setup'),
});

export const Route = createFileRoute('/')({
  validateSearch: flowTabSchema,
  component: HomePage,
});
```

Note: Check if Zod is already in dependencies. If not, can use TanStack Router's built-in validation without Zod.

## R-003: Tab Unlock State Machine

**Decision**: React Context with useReducer for tab unlock/invalidation state. Discriminated union for flow state.

**Rationale**: The tab unlock logic is a simple state machine:

- `setup` → always unlocked
- `dashboard` → unlocked after successful analysis
- `optimization` → unlocked after optimization request
- `roster` → unlocked after team completion (manual 9/9 or optimizer apply)

Reset/invalidation rules:

- Re-analyze: resets everything from dashboard onward
- Modify lock/exclude in dashboard: invalidates optimization
- This fits cleanly in a reducer pattern

**Alternatives considered**:

- XState: Formal state machine library. Powerful but overkill for 4 linear states with simple transitions.
- URL params for unlock state: Would pollute the URL with `?tab=dashboard&unlocked=setup,dashboard`. Better to keep unlock state in-memory.

**Implementation notes**:

```typescript
type FlowStep = 'setup' | 'dashboard' | 'optimization' | 'roster';

interface FlowState {
  unlockedSteps: Set<FlowStep>;
  analyzeData: AnalyzeResponse | null;
  optimizeData: OptimizeResponse | null;
}

type FlowAction =
  | { type: 'ANALYZE_SUCCESS'; data: AnalyzeResponse }
  | { type: 'OPTIMIZE_SUCCESS'; data: OptimizeResponse }
  | { type: 'TEAM_COMPLETE' }
  | { type: 'RESET' }
  | { type: 'INVALIDATE_FROM'; step: FlowStep };
```

## R-004: Google Fonts Loading Strategy

**Decision**: Preconnect + stylesheet link in `index.html` for Manrope, Inter, and JetBrains Mono.

**Rationale**: All three fonts are open source (SIL Open Font License). Google Fonts CDN provides optimal delivery with automatic subsetting and format selection. For a single-user tool, CDN loading is simpler than self-hosting.

**Alternatives considered**:

- Self-hosted via `@fontsource`: Better for offline use, but adds ~500KB to bundle. Unnecessary for a connected web tool.
- Variable fonts: Manrope and Inter have variable versions. Would reduce total font weight. Can adopt later as optimization.

**Implementation notes**:

```html
<!-- index.html -->
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link
  href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500;700&family=Manrope:wght@700;800&display=swap"
  rel="stylesheet"
/>
```

## R-005: Expandable Table Rows with TanStack Table

**Decision**: Use TanStack Table's built-in `getCanExpand()`, `getIsExpanded()`, and `toggleExpanded()` APIs with `renderSubComponent` for the rider detail panel.

**Rationale**: TanStack Table v8 has first-class support for expandable rows. The existing `data-table.tsx` component already wraps TanStack Table — we add expansion support to it. The detail panel (category scores + performance history) renders as a sub-row spanning all columns.

**Alternatives considered**:

- Radix Accordion wrapping table rows: Would break table semantics and accessibility.
- Custom expand state outside TanStack Table: Would duplicate state management.

**Implementation notes**:

- Add `getRowCanExpand` to table options
- Add expand toggle button to first column or row click handler
- Create `RiderDetailPanel` component for the expanded content
- Use `colspan` spanning all columns for the sub-row

## R-006: Zod Dependency Check

**Decision**: Needs verification at implementation time.

**Rationale**: TanStack Router's `validateSearch` works best with Zod for schema validation, but can also accept a plain function. Need to check if Zod is already in the project dependencies.

**Implementation notes**: If Zod is not present, use a plain validation function:

```typescript
validateSearch: (search: Record<string, unknown>) => ({
  tab: ['setup', 'dashboard', 'optimization', 'roster'].includes(search.tab as string)
    ? (search.tab as FlowStep)
    : 'setup',
});
```
