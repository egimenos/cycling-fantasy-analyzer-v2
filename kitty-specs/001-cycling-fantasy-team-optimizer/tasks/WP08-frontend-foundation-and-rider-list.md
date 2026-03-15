---
work_package_id: WP08
title: Frontend Foundation & Rider List
lane: planned
dependencies: [WP01]
subtasks:
- T038
- T039
- T040
- T041
- T042
phase: Phase 5 - Frontend
assignee: ''
agent: ''
shell_pid: ''
review_status: ''
reviewed_by: ''
history:
- timestamp: '2026-03-14T23:51:57Z'
  lane: planned
  agent: system
  shell_pid: ''
  action: Prompt generated via /spec-kitty.tasks
requirement_refs:
- FR-001
- FR-002
- FR-004
- FR-012
---

# WP08 — Frontend Foundation & Rider List

## Review Feedback

_No review feedback yet._

---

## Objectives

1. Set up the frontend application shell using TanStack Start with proper routing, layout, and Tailwind + shadcn/ui theming.
2. Build a typed API client that uses shared types from `@cycling-analyzer/shared-types` for full type safety between frontend and backend.
3. Create a reusable shared UI component library (data table, budget indicator, score badges, loading/error states).
4. Implement the rider list feature: paste input, API call, and sortable/expandable rider table display.

---

## Context

This work package establishes the entire frontend foundation. It only depends on WP01 (monorepo structure) because the frontend can be developed with mock data before the API is ready. The shared types package (created in WP06/T032) provides the API contracts, but the frontend structure itself does not require the backend to be running.

**Key references:**
- `plan.md` — Phase 5 frontend architecture, Feature-Sliced Design structure
- `spec.md` — UI/UX requirements, rider table columns, expandable rows
- `contracts/api.md` — AnalyzeRequest/AnalyzeResponse shapes
- `.kittify/memory/constitution.md` — Feature-Sliced Design, TypeScript strict, no `any`, Tailwind + shadcn/ui

**Architecture:** Feature-Sliced Design (FSD) organizes code into layers: `app/`, `pages/`, `features/`, `shared/`. Each feature is self-contained with its own components, hooks, and types.

**Stack reminder:** React, TanStack Start (file-based routing with SSR support), Tailwind CSS, shadcn/ui components, TanStack Table for data grids.

---

## Subtasks

### T038: TanStack Start Routing + Layout

**Files:**
- `apps/web/src/routes/__root.tsx`
- `apps/web/src/routes/index.tsx`
- `apps/web/src/app/styles/globals.css`
- `apps/web/tailwind.config.ts`

**Step-by-step instructions:**

1. Configure TanStack Start in `apps/web/`:
   - Ensure `app.config.ts` (or equivalent TanStack Start config) is set up for file-based routing
   - Configure SSR/CSR mode — start with CSR for simplicity, SSR can be added later
   - Set up the router entry point

2. Create root layout `__root.tsx`:
   ```typescript
   import { Outlet, createRootRoute } from '@tanstack/react-router';

   export const Route = createRootRoute({
     component: RootLayout,
   });

   function RootLayout() {
     return (
       <div className="min-h-screen bg-background text-foreground">
         <header className="border-b bg-card px-6 py-4">
           <h1 className="text-xl font-bold">Cycling Fantasy Optimizer</h1>
         </header>
         <main className="container mx-auto px-4 py-6">
           <Outlet />
         </main>
       </div>
     );
   }
   ```

3. Create index route `index.tsx`:
   ```typescript
   import { createFileRoute } from '@tanstack/react-router';
   import { RiderListPage } from '@/features/rider-list/components/rider-list-page';

   export const Route = createFileRoute('/')({
     component: HomePage,
   });

   function HomePage() {
     return <RiderListPage />;
   }
   ```

4. Configure Tailwind:
   - Set up `tailwind.config.ts` with shadcn/ui theme tokens (background, foreground, card, primary, secondary, destructive, muted, accent, popover, border, input, ring)
   - Add content paths for `apps/web/src/**/*.{ts,tsx}`
   - Include the shared-ui package path if components are shared across apps
   - Create `globals.css` with Tailwind directives and CSS custom properties for the theme

5. Initialize shadcn/ui:
   - Run `npx shadcn-ui@latest init` in `apps/web/` (or manually configure)
   - Set up `components.json` pointing to the correct paths
   - Install base shadcn/ui dependencies: `@radix-ui/react-slot`, `class-variance-authority`, `clsx`, `tailwind-merge`
   - Create the `cn()` utility in `apps/web/src/shared/lib/utils.ts`

**Validation criteria:**
- `pnpm dev` in apps/web starts without errors
- Navigating to `/` shows the header with "Cycling Fantasy Optimizer" and the main content area
- Tailwind classes render correctly (check with browser dev tools)
- Dark/light mode CSS variables are properly defined

---

### T039: Typed API Client

**File:** `apps/web/src/shared/lib/api-client.ts`

**Step-by-step instructions:**

1. Define the result type pattern:
   ```typescript
   type ApiResult<T> =
     | { status: 'success'; data: T }
     | { status: 'error'; error: string };
   ```

2. Configure base URL:
   ```typescript
   const API_BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';
   ```

3. Implement generic fetch wrapper:
   ```typescript
   async function apiPost<TReq, TRes>(path: string, body: TReq): Promise<ApiResult<TRes>> {
     try {
       const response = await fetch(`${API_BASE_URL}${path}`, {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify(body),
       });

       if (!response.ok) {
         const errorBody = await response.json().catch(() => ({}));
         return { status: 'error', error: errorBody.message ?? `Request failed with status ${response.status}` };
       }

       const data = await response.json() as TRes;
       return { status: 'success', data };
     } catch (err) {
       return { status: 'error', error: err instanceof Error ? err.message : 'Unknown network error' };
     }
   }
   ```

4. Implement typed API methods:
   ```typescript
   import type { AnalyzeRequest, AnalyzeResponse, OptimizeRequest, OptimizeResponse } from '@cycling-analyzer/shared-types';

   export function analyzeRiders(request: AnalyzeRequest): Promise<ApiResult<AnalyzeResponse>> {
     return apiPost<AnalyzeRequest, AnalyzeResponse>('/api/analyze', request);
   }

   export function optimizeTeam(request: OptimizeRequest): Promise<ApiResult<OptimizeResponse>> {
     return apiPost<OptimizeRequest, OptimizeResponse>('/api/optimize', request);
   }
   ```

5. Export `ApiResult` type and all functions.

**Validation criteria:**
- TypeScript compiles without errors; request and response types are fully typed
- No `any` types anywhere in the client
- Network errors are caught and returned as `{ status: 'error' }`, never thrown
- HTTP error responses (4xx, 5xx) are caught and returned with the server's error message
- Base URL is configurable via environment variable

**Edge cases to test:**
- Server returns 400 with JSON error body — error message is extracted
- Server returns 500 with no body — fallback error message used
- Network timeout / connection refused — error is caught gracefully
- Server returns 200 with unexpected shape — passes through (runtime type checking is out of scope)

---

### T040: Shared UI Components

**Directory:** `apps/web/src/shared/ui/`

**Step-by-step instructions:**

1. **`data-table.tsx`** — Generic sortable data table:
   - Use shadcn/ui `Table`, `TableHeader`, `TableRow`, `TableHead`, `TableBody`, `TableCell`
   - Integrate TanStack Table (`@tanstack/react-table`) for column definitions, sorting state, and row model
   - Generic component: `DataTable<TData>` accepting `columns: ColumnDef<TData>[]` and `data: TData[]`
   - Support sortable column headers: click to toggle asc/desc/none, show sort indicator arrow
   - Accept optional `onRowClick` callback for expandable rows
   - Style: hover highlight on rows, alternating row backgrounds

2. **`budget-indicator.tsx`** — Budget progress display:
   - Props: `spent: number`, `total: number`, `unit?: string` (default "H")
   - Display: "1,250H / 2,000H" text with a progress bar below
   - Progress bar: green when under 80%, yellow 80-100%, red when over budget
   - Format numbers with locale-aware thousand separators
   - If spent > total: show the bar at 100% with red color and "Over budget!" warning text

3. **`score-badge.tsx`** — Colored score indicator:
   - Props: `score: number | null`, `maxScore?: number`
   - Display: rounded badge with score number
   - Color: green (top 25%), yellow (middle 50%), red (bottom 25%) based on score relative to maxScore
   - If score is null: display "---" in gray badge

4. **`loading-spinner.tsx`** — Centered loading indicator:
   - Use a simple CSS spinner animation (Tailwind `animate-spin` on a border-based circle)
   - Centered both horizontally and vertically in its container
   - Optional `message` prop for text below spinner (e.g., "Analyzing riders...")

5. **`error-alert.tsx`** — Error display with retry:
   - Props: `message: string`, `onRetry?: () => void`
   - Use shadcn/ui `Alert` component with destructive variant
   - Show error icon, message text, and optional "Retry" button
   - If no onRetry callback: hide the retry button

6. **`empty-state.tsx`** — Friendly empty state:
   - Props: `title: string`, `description?: string`, `icon?: React.ReactNode`
   - Centered layout with muted text
   - Default icon: a subtle bicycle or list illustration (or just a text emoji placeholder)

**Validation criteria:**
- All components render without errors
- DataTable sorts correctly when column headers are clicked
- BudgetIndicator shows correct color states at each threshold
- Components are properly typed with explicit prop interfaces
- No `any` types in component props

---

### T041: Rider List Feature

**Directory:** `apps/web/src/features/rider-list/`

**Step-by-step instructions:**

1. **`components/paste-input.tsx`**:
   - Large `<textarea>` (minimum 8 rows) with placeholder text: "Paste rider price list here..."
   - Race type dropdown using shadcn/ui `Select`:
     - Options: "Grand Tour", "Classic", "Mini Tour"
     - Values: "grand_tour", "classic", "mini_tour"
     - Default: "grand_tour"
   - Budget number input using shadcn/ui `Input` with type="number", min=1, placeholder="Budget in Hillios"
   - "Analyze" button using shadcn/ui `Button`:
     - Disabled when textarea is empty
     - Shows loading state during API call
   - Layout: textarea full width, controls row below with race type + budget + button

2. **`components/rider-list-page.tsx`**:
   - Orchestrates the full flow: paste-input -> loading -> rider-table
   - State management:
     ```typescript
     const [rawText, setRawText] = useState('');
     const [raceType, setRaceType] = useState<RaceType>('grand_tour');
     const [budget, setBudget] = useState(2000);
     const { analyze, result, isLoading, error } = useAnalyze();
     ```
   - Conditional rendering:
     - Before analysis: show PasteInput + EmptyState ("Paste a rider list to get started")
     - During loading: show PasteInput + LoadingSpinner
     - On error: show PasteInput + ErrorAlert with retry
     - On success: show PasteInput (collapsed or smaller) + RiderTable + metadata summary

3. **`hooks/use-analyze.ts`**:
   ```typescript
   function useAnalyze() {
     const [result, setResult] = useState<AnalyzeResponse | null>(null);
     const [isLoading, setIsLoading] = useState(false);
     const [error, setError] = useState<string | null>(null);

     const analyze = async (request: AnalyzeRequest) => {
       setIsLoading(true);
       setError(null);
       const response = await analyzeRiders(request);
       setIsLoading(false);
       if (response.status === 'success') {
         setResult(response.data);
       } else {
         setError(response.error);
       }
     };

     return { analyze, result, isLoading, error };
   }
   ```

4. **`types.ts`**: local feature types if needed (re-export or extend shared types for UI-specific concerns like selected state, expanded state).

**Validation criteria:**
- Pasting text into textarea and clicking Analyze triggers API call
- Loading state is shown during API call
- Successful response renders the rider table
- Error response shows error alert with retry button
- Empty textarea disables the Analyze button

---

### T042: Rider Table Component

**File:** `apps/web/src/features/rider-list/components/rider-table.tsx`

**Step-by-step instructions:**

1. Define column configuration using TanStack Table `ColumnDef<AnalyzedRider>[]`:
   ```typescript
   const columns: ColumnDef<AnalyzedRider>[] = [
     { accessorKey: 'rank', header: '#', cell: ({ row }) => row.index + 1 },
     { accessorKey: 'name', header: 'Name', enableSorting: true },
     { accessorKey: 'team', header: 'Team' },
     {
       accessorKey: 'priceHillios',
       header: 'Price (H)',
       enableSorting: true,
       cell: ({ getValue }) => formatNumber(getValue<number>()),
     },
     {
       accessorKey: 'totalProjectedPts',
       header: 'Score',
       enableSorting: true,
       cell: ({ row }) => row.original.unmatched
         ? <span className="text-muted-foreground">---</span>
         : <ScoreBadge score={row.original.totalProjectedPts} />,
     },
     {
       id: 'matchStatus',
       header: 'Match',
       cell: ({ row }) => row.original.unmatched
         ? <Badge variant="warning">Unmatched</Badge>
         : <Badge variant="success">Matched</Badge>,
     },
   ];
   ```

2. Default sorting: Score column descending.

3. Expandable rows:
   - Click on a row to expand and show score breakdown
   - Expanded content shows a sub-table or card with:
     - GC Points
     - Stage Points
     - Mountain Points
     - Sprint Points
     - Daily Projected Points
   - Use TanStack Table's `getCanExpand()` and `getIsExpanded()` APIs
   - Style expanded row with a light background and indentation

4. Unmatched rider handling:
   - Unmatched riders (where `unmatched === true`):
     - Score column shows "---" instead of a score badge
     - Match status shows a yellow "Unmatched" warning badge
     - Row has a subtle warning background tint
     - Expandable row content shows "No match found in database" message

5. Metadata summary above table:
   - "Showing X riders (Y matched, Z unmatched)"
   - If parse errors exist: "W lines could not be parsed" with expandable error details

**Validation criteria:**
- Table renders all riders from AnalyzeResponse
- Clicking column headers sorts the table
- Default sort is by Score descending
- Clicking a row expands to show breakdown
- Unmatched riders display correctly with warning styling
- Metadata summary shows correct counts

**Edge cases to test:**
- Zero riders — show EmptyState instead of table
- All unmatched — table still renders, all rows show warning
- Very long rider names — text truncation with tooltip
- 200+ riders — table remains performant (virtual scrolling not needed for MVP, but verify scroll performance)

---

## Test Strategy

**Unit tests (target 90%+ coverage):**

- `apps/web/src/shared/lib/__tests__/api-client.spec.ts`:
  - Mock `fetch` globally
  - Test successful POST returns `{ status: 'success', data }`
  - Test HTTP error returns `{ status: 'error', error: 'message' }`
  - Test network failure returns error gracefully
  - Test base URL configuration

- `apps/web/src/shared/ui/__tests__/`:
  - `data-table.spec.tsx`: renders columns, sorting toggles work
  - `budget-indicator.spec.tsx`: correct color at each threshold, over-budget state
  - `score-badge.spec.tsx`: correct color mapping, null score display
  - `loading-spinner.spec.tsx`: renders with and without message
  - `error-alert.spec.tsx`: renders message, retry button calls callback
  - `empty-state.spec.tsx`: renders title and description

- `apps/web/src/features/rider-list/__tests__/`:
  - `paste-input.spec.tsx`: button disabled when empty, calls onAnalyze with correct params
  - `rider-list-page.spec.tsx`: renders all states (empty, loading, error, success)
  - `use-analyze.spec.ts`: hook state transitions
  - `rider-table.spec.tsx`: renders riders, sorting, expandable rows, unmatched display

**Testing tools:** Vitest + React Testing Library + MSW (Mock Service Worker) for API mocking.

**Visual smoke test:** Run `pnpm dev`, paste a sample price list, verify the full flow works visually.

---

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| TanStack Start setup complexity | Medium | Medium | Follow official TanStack Start docs; start with CSR mode; add SSR later if needed |
| shadcn/ui component compatibility with monorepo | Medium | Medium | Test component installation in monorepo context; manually copy if CLI fails |
| Shared types package not available yet (WP06 dependency for types) | High | Low | Create placeholder types locally in frontend; swap to shared package when ready |
| Large rider tables cause performance issues | Low | Medium | TanStack Table handles 500+ rows well; add virtual scrolling only if needed |
| CORS issues between frontend (3000) and backend (3001) | Medium | Low | Configure NestJS CORS in backend; use proxy in Vite dev config as fallback |

---

## Review Guidance

When reviewing this WP, verify the following:

1. **Feature-Sliced Design compliance**: Check that the directory structure follows FSD layers — features are self-contained, shared UI has no feature-specific logic, no circular dependencies between features.
2. **Type safety**: All component props have explicit interfaces. No `any` types. API client uses shared types correctly.
3. **Accessibility**: Table has proper ARIA attributes, buttons have labels, form inputs have associated labels, focus management on expand/collapse.
4. **Responsive design**: Test at mobile (375px), tablet (768px), and desktop (1280px) widths. Table should scroll horizontally on narrow screens.
5. **Error states**: Every async operation has loading, error, and empty states. No white screens on failure.
6. **Component reusability**: Shared UI components are generic and not coupled to specific feature data shapes.

---

## Activity Log

| Timestamp | Action | Agent | Details |
|-----------|--------|-------|---------|
| 2026-03-14T23:51:57Z | Created | system | Prompt generated via /spec-kitty.tasks |
