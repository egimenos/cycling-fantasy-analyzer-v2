---
work_package_id: WP02
title: Tab Flow Infrastructure
lane: planned
dependencies: [WP01]
subtasks:
  - T008
  - T009
  - T010
  - T011
  - T012
  - T013
phase: Phase 0 - Foundation
assignee: ''
agent: ''
shell_pid: ''
review_status: ''
reviewed_by: ''
history:
  - timestamp: '2026-03-22T12:03:57Z'
    lane: planned
    agent: system
    shell_pid: ''
    action: Prompt generated via /spec-kitty.tasks
requirement_refs:
  - FR-004
  - FR-005
  - FR-006
  - FR-007
  - FR-008
---

# Work Package Prompt: WP02 – Tab Flow Infrastructure

## ⚠️ IMPORTANT: Review Feedback Status

**Read this first if you are implementing this task!**

- **Has review feedback?**: Check the `review_status` field above.

---

## Review Feedback

_[Empty initially.]_

---

## Objectives & Success Criteria

- Create the tab-based navigation system with 4 tabs: Setup, Dashboard, Optimization, Roster
- Active tab persisted in URL via TanStack Router search params (`?tab=setup`)
- Tab unlock state managed via React Context + useReducer
- Progressive unlock: only Setup available initially, others unlock as flow progresses
- Glassmorphic navigation bar with branding
- After this WP: app shows tab bar, only Setup tab is clickable, URL reflects active tab

## Context & Constraints

- **Plan**: `kitty-specs/009-peloton-design-system-redesign/plan.md` — DD-002 (URL search params + context)
- **Research**: `kitty-specs/009-peloton-design-system-redesign/research.md` — R-002 (TanStack Router), R-003 (state machine), R-006 (Zod check)
- **Data Model**: `kitty-specs/009-peloton-design-system-redesign/data-model.md` — FlowStep, FlowState, FlowAction definitions
- **Design Reference**: `redesign/stitch_cycling_fantasy_analizer/2._main_dashboard_analyzed_full_width/code.html` — nav bar HTML
- **Constitution**: TypeScript strict mode, zero `any`, Feature-Sliced Design

**Implementation command**: `spec-kitty implement WP02 --base WP01`

## Subtasks & Detailed Guidance

### Subtask T008 – Create `features/flow/types.ts`

- **Purpose**: Define the type system for the tab flow state machine.
- **Steps**:
  1. Create `apps/web/src/features/flow/types.ts`
  2. Define types:

  ```typescript
  export type FlowStep = 'setup' | 'dashboard' | 'optimization' | 'roster';

  export const FLOW_STEPS: readonly FlowStep[] = [
    'setup',
    'dashboard',
    'optimization',
    'roster',
  ] as const;

  export const FLOW_STEP_LABELS: Record<FlowStep, string> = {
    setup: 'Setup',
    dashboard: 'Dashboard',
    optimization: 'Optimization',
    roster: 'Roster',
  };

  export interface FlowState {
    unlockedSteps: ReadonlySet<FlowStep>;
  }

  export type FlowAction =
    | { type: 'ANALYZE_SUCCESS' }
    | { type: 'OPTIMIZE_SUCCESS' }
    | { type: 'TEAM_COMPLETE' }
    | { type: 'RESET' }
    | { type: 'INVALIDATE_FROM'; step: FlowStep };
  ```

- **Files**: `apps/web/src/features/flow/types.ts` (new)
- **Notes**: Keep data (analyzeData, optimizeData) in existing hooks, NOT in flow state. Flow state only tracks which tabs are unlocked.

### Subtask T009 – Create `features/flow/hooks/use-flow-state.ts`

- **Purpose**: Implement the state machine that controls tab unlock/lock/invalidation.
- **Steps**:
  1. Create `apps/web/src/features/flow/hooks/use-flow-state.ts`
  2. Implement the reducer:

  ```typescript
  function flowReducer(state: FlowState, action: FlowAction): FlowState {
    switch (action.type) {
      case 'ANALYZE_SUCCESS':
        return { unlockedSteps: new Set([...state.unlockedSteps, 'dashboard']) };
      case 'OPTIMIZE_SUCCESS':
        return { unlockedSteps: new Set([...state.unlockedSteps, 'optimization']) };
      case 'TEAM_COMPLETE':
        return { unlockedSteps: new Set([...state.unlockedSteps, 'roster']) };
      case 'RESET':
        return { unlockedSteps: new Set(['setup']) };
      case 'INVALIDATE_FROM': {
        const stepIndex = FLOW_STEPS.indexOf(action.step);
        const kept = FLOW_STEPS.filter((_, i) => i < stepIndex);
        return { unlockedSteps: new Set([...kept, 'setup']) };
      }
      default:
        return state;
    }
  }
  ```

  3. Create FlowContext and FlowProvider:

  ```typescript
  interface FlowContextValue {
    state: FlowState;
    dispatch: React.Dispatch<FlowAction>;
    isUnlocked: (step: FlowStep) => boolean;
  }

  const FlowContext = createContext<FlowContextValue | null>(null);

  export function FlowProvider({ children }: { children: React.ReactNode }) {
    const [state, dispatch] = useReducer(flowReducer, {
      unlockedSteps: new Set<FlowStep>(['setup']),
    });

    const isUnlocked = useCallback(
      (step: FlowStep) => state.unlockedSteps.has(step),
      [state.unlockedSteps],
    );

    const value = useMemo(() => ({ state, dispatch, isUnlocked }), [state, dispatch, isUnlocked]);

    return <FlowContext.Provider value={value}>{children}</FlowContext.Provider>;
  }

  export function useFlowState(): FlowContextValue {
    const ctx = useContext(FlowContext);
    if (!ctx) throw new Error('useFlowState must be used within FlowProvider');
    return ctx;
  }
  ```

- **Files**: `apps/web/src/features/flow/hooks/use-flow-state.ts` (new)
- **Notes**: The INVALIDATE_FROM action removes all steps from the given step onward. This handles: user changes lock/exclude in Dashboard → Optimization tab gets invalidated.

### Subtask T010 – Create `features/flow/components/flow-tabs.tsx`

- **Purpose**: Render the horizontal tab bar with visual states for locked/active/completed tabs.
- **Steps**:
  1. Create `apps/web/src/features/flow/components/flow-tabs.tsx`
  2. Props: `activeTab: FlowStep`, `onTabChange: (tab: FlowStep) => void`
  3. For each tab:
     - **Locked**: `text-outline/40 cursor-not-allowed` — click does nothing
     - **Active**: `text-on-surface border-b-2 border-primary font-bold`
     - **Unlocked (not active)**: `text-on-surface-variant hover:text-on-surface cursor-pointer`
  4. Tab bar container: `flex gap-1 border-b border-outline-variant/10 bg-surface-container-low px-6`
  5. Each tab: `px-4 py-3 text-xs font-mono uppercase tracking-widest transition-colors`
  6. Use `useFlowState().isUnlocked(step)` to determine if clickable
  7. Locked tabs show a small lock icon (use Lucide `Lock` icon, 12px)

- **Files**: `apps/web/src/features/flow/components/flow-tabs.tsx` (new)
- **Notes**: The tab bar sits below the nav bar and above the content area.

### Subtask T011 – Rewrite `routes/__root.tsx` with glassmorphic nav bar

- **Purpose**: Replace the simple header with the Stitch-style glassmorphic navigation.
- **Steps**:
  1. Rewrite `apps/web/src/routes/__root.tsx`:

  ```tsx
  function RootLayout() {
    return (
      <div className="min-h-screen bg-surface-dim text-on-surface">
        <nav className="fixed top-0 w-full z-50 bg-surface-dim/70 backdrop-blur-md border-b border-outline-variant/15 shadow-sm shadow-black/20 flex justify-between items-center px-6 h-16">
          <span className="text-xl font-black tracking-tighter text-on-surface uppercase italic font-headline">
            CYCLING FANTASY OPTIMIZER
          </span>
          <div className="flex items-center gap-4">
            {/* Theme toggle placeholder — dark-only for now */}
          </div>
        </nav>
        <main className="pt-16">
          <Outlet />
        </main>
        <Toaster richColors position="top-right" />
      </div>
    );
  }
  ```

  2. Key styling: `bg-surface-dim/70 backdrop-blur-md` for glassmorphism
  3. Keep `fixed top-0` so the nav scrolls with content
  4. `pt-16` on main compensates for the fixed nav height

- **Files**: `apps/web/src/routes/__root.tsx`
- **Parallel?**: Yes — independent from flow state work

### Subtask T012 – Rewrite `routes/index.tsx` with `validateSearch`

- **Purpose**: Persist the active tab in the URL and render the flow orchestrator.
- **Steps**:
  1. Check if `zod` is in `apps/web/package.json` dependencies
  2. If Zod is present:

  ```typescript
  import { z } from 'zod';

  const searchSchema = z.object({
    tab: z.enum(['setup', 'dashboard', 'optimization', 'roster']).default('setup'),
  });

  export const Route = createFileRoute('/')({
    validateSearch: searchSchema,
    component: HomePage,
  });
  ```

  3. If Zod is NOT present, use plain validation:

  ```typescript
  const VALID_TABS = ['setup', 'dashboard', 'optimization', 'roster'] as const;

  export const Route = createFileRoute('/')({
    validateSearch: (search: Record<string, unknown>) => ({
      tab: VALID_TABS.includes(search.tab as FlowStep) ? (search.tab as FlowStep) : 'setup',
    }),
    component: HomePage,
  });
  ```

  4. HomePage renders FlowProvider → FlowTabs → Tab content

- **Files**: `apps/web/src/routes/index.tsx`

### Subtask T013 – Create tab content switcher

- **Purpose**: Conditionally render the correct screen component based on active tab and unlock state.
- **Steps**:
  1. Inside `HomePage`, use `useSearch()` to get `tab` from URL
  2. Use `useNavigate()` to change tabs (updates URL)
  3. Use `useFlowState()` to check if the requested tab is unlocked
  4. If tab is not unlocked, redirect to the last unlocked tab
  5. Render structure:

  ```tsx
  function HomePage() {
    const { tab } = Route.useSearch();
    const navigate = Route.useNavigate();
    const { isUnlocked } = useFlowState();

    const handleTabChange = (newTab: FlowStep) => {
      if (isUnlocked(newTab)) {
        navigate({ search: { tab: newTab } });
      }
    };

    // Guard: redirect if tab not unlocked
    useEffect(() => {
      if (!isUnlocked(tab)) {
        const lastUnlocked = [...FLOW_STEPS].reverse().find((s) => isUnlocked(s)) ?? 'setup';
        navigate({ search: { tab: lastUnlocked }, replace: true });
      }
    }, [tab, isUnlocked, navigate]);

    return (
      <FlowProvider>
        <FlowTabs activeTab={tab} onTabChange={handleTabChange} />
        <div className="max-w-7xl mx-auto px-6 py-6">
          {tab === 'setup' && <SetupTab />}
          {tab === 'dashboard' && <DashboardTab />}
          {tab === 'optimization' && <OptimizationTab />}
          {tab === 'roster' && <RosterTab />}
        </div>
      </FlowProvider>
    );
  }
  ```

  6. Create placeholder components for each tab initially (just a div with the tab name) — real implementations come in WP03–WP07

- **Files**: `apps/web/src/routes/index.tsx`
- **Notes**: The FlowProvider must wrap everything so all tabs access flow state. The tab content components will be imported from their respective feature modules.

## Risks & Mitigations

- **Zod dependency**: Check `package.json` first. Both paths (Zod schema vs plain function) are provided.
- **TanStack Router regeneration**: After changing `index.tsx`, the route tree may need regeneration. Run `pnpm --filter web dev` to trigger auto-generation.
- **FlowProvider placement**: Must be inside the route component, not in `__root.tsx`, because it depends on the route's search params.

## Review Guidance

- **Check**: URL changes when clicking tabs (`?tab=dashboard`)
- **Check**: Refreshing the page preserves the active tab
- **Check**: Locked tabs cannot be clicked
- **Check**: Nav bar has visible backdrop blur effect
- **Check**: FlowProvider throws if used outside its provider boundary
- **Check**: No `any` types — all flow state is fully typed

## Activity Log

- 2026-03-22T12:03:57Z – system – lane=planned – Prompt created.
