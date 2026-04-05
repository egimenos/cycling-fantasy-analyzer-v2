# ADR: Remove Rule-Based Scoring — ML-Only

**Status:** Accepted
**Date:** 2026-04-05
**Supersedes:** [2026-03-15-scoring-engine-as-pure-domain-logic](2026-03-15-scoring-engine-as-pure-domain-logic.md), [2026-03-20-ml-scoring-python-addition](2026-03-20-ml-scoring-python-addition.md)

## Context

The system previously had a hybrid scoring architecture: ML predictions for stage races with a rules-based fallback, and rules-only scoring for classics. With the addition of the classics ML model (LightGBM, 51 features), ML now covers all race types. The rules-based scoring path added complexity (dual scoring types, fallback logic, hybrid merging) without providing value — ML consistently outperforms it across stage races, and the classics model makes rules-based scoring redundant there too.

## Decision

Remove all rule-based scoring code and make ML the only scoring path:

- Delete the domain scoring engine (weights, pure functions, config)
- Remove the `ScoringMethod` type (`'rules'` / `'hybrid'` / `'ml'`)
- Remove fallback logic in the analyze and optimize use cases
- Simplify the benchmark to show only ML rho (no rules/hybrid columns)
- Remove the season breakdown table from the frontend UI

## Consequences

### Positive

- Simpler codebase — one scoring path instead of three (`rules`, `hybrid`, `ml`)
- No ambiguity about which scoring method is active
- Fewer shared types and DTOs to maintain
- Frontend is cleaner without dual-display logic

### Negative

- ML service is now mandatory — if it is down, the API cannot produce scores (no graceful degradation)
- Local development requires the ML service running (`make ml-up`) to test any scoring flow
- First-time setup is heavier (must train models before the app is fully functional)

### Neutral

- The Python ML microservice architecture from the previous ADR remains unchanged
- Caching, hot-reload, and retraining workflows are unaffected
