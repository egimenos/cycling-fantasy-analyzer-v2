# Quickstart: Peloton Design System Redesign

**Feature**: 009-peloton-design-system-redesign

## Prerequisites

- Node.js 20+
- pnpm 9+
- Running backend (`apps/api`) for API calls during testing

## Development

```bash
# From repo root
pnpm install
pnpm --filter web dev
```

The frontend runs at `http://localhost:5173`.

## Key Files to Modify

### Design Tokens (start here)

1. `apps/web/index.html` — Add Google Fonts preconnect + stylesheet links
2. `apps/web/src/styles/app.css` — Replace all CSS custom properties with new design tokens

### Layout Shell

3. `apps/web/src/routes/__root.tsx` — Glassmorphic nav bar
4. `apps/web/src/routes/index.tsx` — Tab flow orchestrator

### New Module

5. `apps/web/src/features/flow/` — Tab state management (hooks, components, types)

### Screen Components (in order)

6. `apps/web/src/features/rider-list/components/rider-input.tsx` — Setup tab
7. `apps/web/src/features/rider-list/components/rider-table.tsx` — Dashboard table
8. `apps/web/src/features/rider-list/components/rider-detail-panel.tsx` — NEW: Expandable row detail
9. `apps/web/src/features/rider-list/components/race-profile-summary.tsx` — Dashboard race bar
10. `apps/web/src/features/team-builder/components/team-builder-panel.tsx` — Dashboard sidebar
11. `apps/web/src/features/optimizer/components/optimizer-panel.tsx` — Optimization tab
12. `apps/web/src/features/optimizer/components/optimal-team-card.tsx` — Rider grid cards
13. `apps/web/src/features/optimizer/components/score-breakdown.tsx` — Distribution bar
14. `apps/web/src/features/team-builder/components/team-summary.tsx` — Roster tab

### Shared UI (restyle all)

15. `apps/web/src/shared/ui/*.tsx` — Update all 16 components to use new tokens

## Testing

```bash
# Unit tests
pnpm --filter web test

# E2E tests (requires running frontend + backend)
pnpm --filter web test:e2e
```

## Design Reference

Design mockups and design system documentation are in `/redesign/`:

- `redesign/stitch_cycling_fantasy_analizer/1._initial_setup_simplified/screen.png` — Setup screen
- `redesign/stitch_cycling_fantasy_analizer/2._main_dashboard_analyzed_full_width/screen.png` — Dashboard
- `redesign/stitch_cycling_fantasy_analizer/3._optimization_results_full_width/screen.png` — Optimization
- `redesign/stitch_cycling_fantasy_analizer/4._final_team_roster_full_width/screen.png` — Final Roster
- `redesign/stitch_cycling_fantasy_analizer/peloton_analytics/DESIGN.md` — Design system spec
- `redesign/stitch_cycling_fantasy_analizer/*/code.html` — Reference HTML for each screen
