# Implementation Plan: ML Score Display in Frontend

**Branch**: `007-ml-score-display-frontend` | **Date**: 2026-03-20 | **Spec**: [spec.md](spec.md)

## Summary

Display ML scoring data in the React frontend. The API already returns `scoringMethod` and `mlPredictedScore` — this feature renders them across all score display locations. Frontend-only changes, no backend work.

## Technical Context

**Language/Version**: TypeScript (React 18+, TanStack Router)
**UI Library**: shadcn/ui (Radix UI + Tailwind CSS)
**Project Type**: Monorepo — `apps/web/src/`
**Scope**: 5 component files to modify, 1 new shared component

## Project Structure

```
apps/web/src/
├── features/
│   ├── rider-list/components/
│   │   └── rider-table.tsx          # MODIFIED — ML score column + badge
│   ├── optimizer/components/
│   │   ├── optimal-team-card.tsx     # MODIFIED — ML total
│   │   └── score-breakdown.tsx       # UNCHANGED
│   └── team-builder/components/
│       ├── team-builder-panel.tsx    # MODIFIED — ML total
│       └── team-summary.tsx          # MODIFIED — ML total
└── shared/ui/
    └── ml-badge.tsx                  # NEW — reusable ML indicator badge
```

## Key Decisions

- **Conditional rendering**: ML elements only render when `scoringMethod === "hybrid"`. For "rules", zero UI change.
- **New `MlBadge` component**: Reusable across all locations. Small pill badge "ML" with distinctive color.
- **Score display pattern**: Show `mlPredictedScore` next to `totalProjectedPts` with clear labels, not replacing it.
- **Team aggregates**: Sum `mlPredictedScore` across selected riders for ML total. Handle null values (skip in sum, show note).
