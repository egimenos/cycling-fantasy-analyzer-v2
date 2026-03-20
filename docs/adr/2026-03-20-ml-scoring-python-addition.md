# ADR: ML Scoring with Python Microservice

**Status:** Accepted
**Date:** 2026-03-20

## Context

Feature 005 research proved that ML (Random Forest) significantly improves scoring accuracy for stage races, achieving Spearman rho of 0.52-0.59 compared to the baseline rules-based rho of 0.39. The project constitution explicitly allows Python addition "if ML complexity warrants it." Classic races showed no improvement from ML (rho remained similar to baseline), so the decision is to apply ML only to stage races.

## Decision

- Add a Python FastAPI microservice for ML scoring, internal to the Docker network (not a public API endpoint)
- Hybrid scoring approach: ML predictions for stage races (mini tours and grand tours), rules-based scoring for classics
- Pre-trained scikit-learn Random Forest models loaded at service startup, with hot-reload on version change
- Predictions cached in the `ml_scores` database table to avoid redundant computation
- Weekly retraining via `make retrain` (CLI operation)

## Rationale

- Python is required for the scikit-learn ML pipeline (40-feature extraction validated in research v3)
- A microservice architecture avoids the 2-3 second subprocess cold start that would occur if spawning Python per request; models are loaded once at startup
- The service is internal only — it runs on the Docker network and is called by the TypeScript API, never exposed to the internet
- Rules-based scoring remains unchanged for classics where ML showed no improvement
- The constitution requires an ADR for any scoring algorithm change, and this feature introduces a new scoring path

## Consequences

### Positive

- Measurably better scoring accuracy for stage races (rho improvement from 0.39 to 0.52-0.59)
- Graceful degradation: if the ML service is down, the API falls back to rules-based scoring seamlessly
- Cache layer prevents redundant predictions and keeps response times fast after first prediction
- Hot-reload avoids container restarts when models are retrained

### Negative

- New Python dependency in an otherwise TypeScript-only project
- Additional Docker service to manage (ml-service container)
- Weekly retraining is a new operational requirement
- Increased infrastructure complexity (one more service to monitor and maintain)

### Neutral

- The hybrid approach means both scoring paths coexist; rules-based scoring is still the canonical method for classics
- Model files (\*.joblib) are gitignored and must be regenerated per environment via `make retrain`
