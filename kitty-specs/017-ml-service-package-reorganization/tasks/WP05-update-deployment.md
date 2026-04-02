---
work_package_id: WP05
title: Update Dockerfile + Deployment
lane: planned
dependencies: [WP02]
subtasks: [T021, T022, T023]
phase: Phase 2 - Deployment
assignee: ''
agent: ''
shell_pid: ''
review_status: ''
reviewed_by: ''
history:
  - timestamp: '2026-04-02T22:16:11Z'
    lane: planned
    agent: system
    shell_pid: ''
    action: Prompt generated via /spec-kitty.tasks
requirement_refs: [FR-014, FR-015, FR-016]
---

# Work Package Prompt: WP05 – Update Dockerfile + Deployment

## Implementation Command

```bash
spec-kitty implement WP05 --base WP02
```

## Objectives & Success Criteria

- Dockerfile CMD updated to new entry point path
- Makefile retrain command works with new module paths
- Docker container builds, starts, and serves predictions

## Subtasks & Detailed Guidance

### Subtask T021 – Update Dockerfile.ml CMD

Read `docker/Dockerfile.ml` and update the CMD/entrypoint:

```dockerfile
# Old:
CMD ["uvicorn", "src.app:app", "--host", "0.0.0.0", "--port", "8000"]

# New:
CMD ["uvicorn", "src.api.app:app", "--host", "0.0.0.0", "--port", "8000"]
```

The `COPY ml/src/ ./src/` line should still work since the structure is under `src/`.

---

### Subtask T022 – Update Makefile retrain command

Check if `Makefile` references old module paths:

```makefile
# Old:
retrain:
    docker compose run --rm ml-service python -m src.retrain

# New:
retrain:
    docker compose run --rm ml-service python -m src.training.retrain
```

---

### Subtask T023 – Verify Docker build + health

```bash
docker compose build ml-service
docker compose up -d ml-service
sleep 5
curl -s http://localhost:8000/health | python -m json.tool
```

Verify `/health` returns 200 with model version.

**Validation**:

- [ ] `docker compose build ml-service` succeeds
- [ ] Container starts without import errors
- [ ] `/health` returns 200
- [ ] `make retrain` command syntax is correct (may need Docker rebuild to test fully)

## Activity Log

- 2026-04-02T22:16:11Z – system – lane=planned – Prompt created.
