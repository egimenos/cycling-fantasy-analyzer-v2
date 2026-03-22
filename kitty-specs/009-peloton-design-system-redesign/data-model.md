# Data Model: Peloton Design System Redesign

**Feature**: 009-peloton-design-system-redesign
**Date**: 2026-03-22

## Overview

This feature is frontend-only. No database or API changes are required. The data model below describes the new client-side state structures introduced by the tab-based flow.

## New Entities

### FlowStep (Enum)

Represents each step in the progressive tab flow.

| Value          | Description                      |
| -------------- | -------------------------------- |
| `setup`        | Initial input configuration      |
| `dashboard`    | Rider analysis and team building |
| `optimization` | Optimizer results display        |
| `roster`       | Final team review and export     |

### FlowState

Manages which tabs are unlocked and holds cross-tab data.

| Field           | Type                       | Description                                           |
| --------------- | -------------------------- | ----------------------------------------------------- |
| `unlockedSteps` | `Set<FlowStep>`            | Which tabs the user can navigate to                   |
| `analyzeData`   | `AnalyzeResponse \| null`  | Cached analysis results (drives Dashboard)            |
| `optimizeData`  | `OptimizeResponse \| null` | Cached optimization results (drives Optimization tab) |

### FlowAction (Discriminated Union)

Actions that drive FlowState transitions.

| Action             | Trigger                                        | Effect                                             |
| ------------------ | ---------------------------------------------- | -------------------------------------------------- |
| `ANALYZE_SUCCESS`  | Analysis API returns                           | Unlock `dashboard`, store data                     |
| `OPTIMIZE_SUCCESS` | Optimization API returns                       | Unlock `optimization`, store data                  |
| `TEAM_COMPLETE`    | 9 riders selected or "Apply to Roster" clicked | Unlock `roster`                                    |
| `RESET`            | Re-analyze triggered                           | Lock all tabs except `setup`, clear data           |
| `INVALIDATE_FROM`  | Upstream state modified                        | Lock tabs from given step onward, clear their data |

## Existing Entities (unchanged)

The following existing types from `@cycling-analyzer/shared-types` are consumed but NOT modified:

- `PriceListEntryDto` — rider input data
- `ProfileSummary` — race profile metadata
- `RaceType` — race type enum
- `AnalyzeResponse` — analysis results with scored riders
- `OptimizeResponse` — optimization results with optimal team

## Design Tokens (CSS Custom Properties)

Not a runtime data model, but documented here as the "data" of the design system:

| Token Group       | Count | Example                                                             |
| ----------------- | ----- | ------------------------------------------------------------------- |
| Surface colors    | 7     | `--surface-dim`, `--surface-container-low`, etc.                    |
| On-surface colors | 4     | `--on-surface`, `--on-surface-variant`, etc.                        |
| Primary/Secondary | 8     | `--primary`, `--primary-container`, etc.                            |
| Category colors   | 4     | `--color-gc`, `--color-stage`, `--color-mountain`, `--color-sprint` |
| Functional colors | 3     | `--tertiary`, `--error`, `--outline`                                |
| Typography        | 3     | `--font-headline`, `--font-body`, `--font-mono`                     |
| Radii             | 1     | `--radius: 0.125rem` (sharp technical corners)                      |
