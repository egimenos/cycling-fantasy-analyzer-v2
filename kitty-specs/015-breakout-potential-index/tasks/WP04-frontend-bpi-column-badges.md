---
work_package_id: WP04
title: Frontend — BPI Column & Flag Badges
lane: 'done'
dependencies: [WP03]
base_branch: 015-breakout-potential-index-WP03
base_commit: dfcd0625ef9fc477a966de8524394478f011bab8
created_at: '2026-04-01T18:41:13.621339+00:00'
subtasks:
  - T017
  - T018
  - T019
  - T020
phase: Phase 2 - Frontend
assignee: ''
agent: 'claude-opus'
shell_pid: '44140'
review_status: 'approved'
reviewed_by: 'egimenos'
history:
  - timestamp: '2026-04-01T17:57:39Z'
    lane: planned
    agent: system
    shell_pid: ''
    action: Prompt generated via /spec-kitty.tasks
requirement_refs:
  - FR-008
  - FR-009
---

# Work Package Prompt: WP04 – Frontend — BPI Column & Flag Badges

## Objectives & Success Criteria

- Add a sortable "BPI" column to the rider analysis table with color coding
- Create a reusable BPI badge component
- Display flag chips next to rider names
- **Success**: After analyzing a price list, the table shows a BPI column (green ≥70, amber 40-69, gray <40) and flag chips. Column is sortable. Unmatched riders show "—".

## Context & Constraints

- **Spec**: `kitty-specs/015-breakout-potential-index/spec.md` (User Story 2)
- **Constitution**: Feature-Sliced Design. Shared UI in `/shared/ui/`. No cross-feature imports. Tailwind CSS for styling.
- **Tech stack**: React 19, TanStack React Table 8, Tailwind CSS, Lucide React (icons).
- **Existing table**: `apps/web/src/features/rider-list/components/rider-table.tsx` — uses TanStack Table with expandable rows, 5 filter buttons, columns for rank/name/team/price/score/value/match/actions.

## Implementation Command

```bash
spec-kitty implement WP04 --base WP03
```

## Subtasks & Detailed Guidance

### Subtask T017 – Add BPI column to rider table

**Purpose**: Display BPI score in the table so users can see breakout potential at a glance.

**Steps**:

1. Open `apps/web/src/features/rider-list/components/rider-table.tsx`
2. Find the column definitions array (TanStack Table `columnHelper.accessor` calls)
3. Add a new column after the "Value" column:
   ```typescript
   columnHelper.accessor((row) => row.breakout?.index ?? null, {
     id: 'bpi',
     header: 'BPI',
     cell: ({ getValue }) => <BpiBadge value={getValue()} />,
     sortingFn: (rowA, rowB) => {
       const a = rowA.original.breakout?.index ?? -1;
       const b = rowB.original.breakout?.index ?? -1;
       return a - b;
     },
     enableSorting: true,
   })
   ```
4. Ensure the column header is clickable for sorting (should work automatically with TanStack Table's sorting setup).

**Files**:

- `apps/web/src/features/rider-list/components/rider-table.tsx` (modify)

**Parallel?**: Yes — can proceed alongside T018 and T019.

**Notes**:

- Check how existing columns handle sorting and follow the same pattern.
- Null BPI values (unmatched riders) sort to bottom by using -1 as the fallback.
- The column width should be compact — BPI is a 0-100 number.

### Subtask T018 – Create BPI badge component

**Purpose**: Reusable color-coded badge that renders the BPI score with visual context.

**Steps**:

1. Create `apps/web/src/features/rider-list/components/bpi-badge.tsx`
2. Implement:

   ```typescript
   interface BpiBadgeProps {
     value: number | null;
   }

   export function BpiBadge({ value }: BpiBadgeProps): JSX.Element {
     if (value == null) {
       return <span className="text-gray-400">—</span>;
     }

     const colorClass =
       value >= 70
         ? 'bg-green-100 text-green-800'
         : value >= 40
           ? 'bg-amber-100 text-amber-800'
           : 'bg-gray-100 text-gray-600';

     return (
       <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${colorClass}`}>
         {value}
       </span>
     );
   }
   ```

**Files**:

- `apps/web/src/features/rider-list/components/bpi-badge.tsx` (new)

**Parallel?**: Yes — independent component.

**Notes**:

- Use Tailwind color classes that match the existing design language. Check if the project uses custom color tokens (e.g., `surface-*`, `outline-*`) — if so, adapt the classes.
- The badge is intentionally simple — just a colored pill with the number.

### Subtask T019 – Add flag chip badges next to rider names

**Purpose**: Show abbreviated flag labels as small colored chips next to the rider name, enabling quick identification of breakout characteristics.

**Steps**:

1. In `rider-table.tsx`, find the "name" column cell renderer
2. After the rider name text, conditionally render flag chips:
   ```typescript
   {row.original.breakout?.flags?.map((flag) => (
     <FlagChip key={flag} flag={flag} />
   ))}
   ```
3. Create a `FlagChip` component (can be inline or in a separate file):

   ```typescript
   const FLAG_CONFIG: Record<BreakoutFlag, { label: string; color: string }> = {
     EMERGING_TALENT: { label: 'EMERGING', color: 'bg-purple-100 text-purple-700' },
     HOT_STREAK: { label: 'HOT', color: 'bg-red-100 text-red-700' },
     DEEP_VALUE: { label: 'VALUE', color: 'bg-green-100 text-green-700' },
     CEILING_PLAY: { label: 'CEILING', color: 'bg-blue-100 text-blue-700' },
     SPRINT_OPPORTUNITY: { label: 'SPRINT', color: 'bg-yellow-100 text-yellow-700' },
     BREAKAWAY_HUNTER: { label: 'BREAKAWAY', color: 'bg-orange-100 text-orange-700' },
   };

   function FlagChip({ flag }: { flag: BreakoutFlag }): JSX.Element {
     const config = FLAG_CONFIG[flag];
     return (
       <span className={`ml-1 inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ${config.color}`}>
         {config.label}
       </span>
     );
   }
   ```

4. Import `BreakoutFlag` from `@cycling-analyzer/shared-types`.

**Files**:

- `apps/web/src/features/rider-list/components/rider-table.tsx` (modify)

**Parallel?**: Yes — modifies a different column cell than T017.

**Notes**:

- Flag chips should be small enough not to break the table layout. Use `text-[10px]` and compact padding.
- If too many flags appear, they'll wrap to the next line — this is acceptable for table rows.
- Riders with no flags show nothing (clean row).
- The `FlagChip` can live in the same file or be extracted to `bpi-badge.tsx` alongside `BpiBadge`.

### Subtask T020 – Make BPI column sortable

**Purpose**: Enable users to sort the entire table by BPI score to quickly find top breakout candidates.

**Steps**:

1. Verify the column definition from T017 has `enableSorting: true`
2. Check the existing table's sorting implementation — it likely uses TanStack Table's `getSortedRowModel()` and `SortingState`
3. Ensure null BPI values sort to the bottom regardless of sort direction:
   ```typescript
   sortingFn: (rowA, rowB, columnId) => {
     const a = rowA.original.breakout?.index ?? -1;
     const b = rowB.original.breakout?.index ?? -1;
     return a - b;
   },
   ```
4. Test: click the BPI header → riders sort by BPI descending. Click again → ascending. Unmatched riders always at bottom.

**Files**:

- `apps/web/src/features/rider-list/components/rider-table.tsx` (modify — part of T017's column definition)

**Parallel?**: No — depends on T017 (column must exist).

**Notes**:

- This may already work from T017's column definition. Verify by testing.
- If the table uses a custom sort handler, integrate the BPI column into it.

## Risks & Mitigations

- **Table layout shift**: Adding a column may push others off-screen on small viewports → use a narrow fixed width (`w-16`) for BPI.
- **Type import**: `BreakoutFlag` enum must be imported from shared-types. Verify the import path works in the web app.
- **Performance**: Flag chips add DOM elements per row. With 200 riders and avg 1-2 flags each, this is ~400 extra spans — negligible.

## Review Guidance

- Verify color coding matches spec: green ≥70, amber 40-69, gray <40.
- Verify unmatched riders show "—" in BPI column (not 0, not empty).
- Verify flag chips have distinct colors and abbreviated labels.
- Verify sorting works in both directions.
- Check responsiveness on narrow viewports — table should scroll horizontally if needed.
- Verify no cross-feature imports (BPI components stay in `features/rider-list/`).

## Activity Log

- 2026-04-01T17:57:39Z – system – lane=planned – Prompt created.
- 2026-04-01T18:41:14Z – claude-opus – shell_pid=44140 – lane=doing – Assigned agent via workflow command
- 2026-04-01T18:42:38Z – claude-opus – shell_pid=44140 – lane=for_review – BPI column + flag badges + sorting. Build passes.
- 2026-04-01T18:43:13Z – claude-opus – shell_pid=44140 – lane=done – Review passed: BPI column + badges match design tokens, sorting correct, FlagChip avoids ESM enum
