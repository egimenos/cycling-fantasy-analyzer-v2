"""
CLI entrypoint for model retraining.

Orchestrates the full source-by-source pipeline:
  1. Load data from database
  2. Compute Glicko-2 ratings
  3. Build feature cache
  4. Build stage targets
  5. Build stage features
  6. Build classification history features
  7. Train all sub-models (source-by-source)

Called via: make retrain  (which runs: cd ml && python -m src.retrain)

Detached runs (e.g. `docker exec -d`) lose stdout/stderr, so this script
also writes a tee'd log to `<cache>/retrain.log` and a `retrain_status.json`
with exit code, duration, and any error so callers can verify the run.
"""

import json
import os
import sys
import time
import traceback
from datetime import datetime, timezone

import pandas as pd

from ..data.loader import load_data


class _Tee:
    """Mirror writes to multiple streams (stdout + log file)."""

    def __init__(self, *streams):
        self._streams = streams

    def write(self, data):
        for s in self._streams:
            s.write(data)
            s.flush()

    def flush(self):
        for s in self._streams:
            s.flush()


def _write_status(cache_dir: str, payload: dict) -> None:
    path = os.path.join(cache_dir, 'retrain_status.json')
    try:
        with open(path, 'w') as f:
            json.dump(payload, f, indent=2, sort_keys=True)
    except Exception as exc:
        print(f"  WARNING: failed to write {path}: {exc}")


def _synthesize_startlists(results_df: pd.DataFrame) -> pd.DataFrame:
    """Derive startlists from race_results when startlist_entries is empty."""
    sl = results_df[['race_slug', 'year', 'rider_id']].drop_duplicates()
    sl = sl.copy()
    sl['team_name'] = (
        results_df.groupby('rider_id')['rider_team']
        .first()
        .reindex(sl['rider_id'])
        .values
    )
    sl['team_name'] = sl['team_name'].fillna('unknown')
    return sl


def _run_pipeline(db_url: str, model_dir: str, cache_dir: str) -> dict:
    t0 = time.time()
    print("=" * 60)
    print("  Source-by-Source Retraining Pipeline")
    print("=" * 60)

    # Step 1: Load data
    print("\n[1/7] Loading data from database...")
    results_df, startlists_df = load_data(db_url)
    if len(startlists_df) == 0:
        print("  WARNING: startlist_entries is empty — synthesizing from race results")
        startlists_df = _synthesize_startlists(results_df)
        print(f"  Synthesized {len(startlists_df):,} startlist entries")

    # Step 2: Compute Glicko-2 ratings
    print("\n[2/7] Computing Glicko-2 ratings...")
    from ..domain.glicko import main as glicko_main
    glicko_main()

    # Step 3: Build feature cache (skip if valid)
    print("\n[3/7] Building feature cache...")
    from ..features.cache_stage import main as cache_main, validate_cache, is_cached
    if is_cached():
        ok, msg = validate_cache()
        if ok:
            print(f"  Cache valid, skipping rebuild ({msg})")
        else:
            print(f"  Cache stale: {msg}")
            cache_main()
    else:
        cache_main()

    # Step 4: Build stage targets
    print("\n[4/7] Building stage targets...")
    from ..domain.stage_targets import save_stage_targets
    save_stage_targets(db_url)

    # Step 5: Build stage features
    print("\n[5/7] Building stage features...")
    from ..features.stage_type import save_stage_features
    save_stage_features(db_url)

    # Step 6: Build classification history features
    print("\n[6/7] Building classification history features...")
    from ..features.classification import save_classification_features
    save_classification_features(db_url)

    # Step 7: Train all sub-models (stage races)
    print("\n[7/8] Training source-by-source models (stage races)...")
    from .train_sources import train_all
    metadata = train_all(model_dir=model_dir, cache_dir=cache_dir)

    # Step 8: Train classic model
    print("\n[8/8] Training classic model...")
    try:
        from ..features.cache_classics import cache_all_years, load_cached_classics
        from .train_classics import get_feature_cols, save_model, train_classic_model
        cache_all_years(results_df)
        train_dfs = []
        for yr in range(2019, 2026):
            try:
                train_dfs.append(load_cached_classics(yr))
            except FileNotFoundError:
                pass
        if train_dfs:
            classic_train = pd.concat(train_dfs, ignore_index=True)
            feature_cols = get_feature_cols("all_tier3")
            available = [c for c in feature_cols if c in classic_train.columns]
            if available:
                model, meta = train_classic_model(classic_train, available, "lgbm", "sqrt")
                meta["version"] = metadata.get("model_version", "unknown")
                save_model(model, meta)
                print(f"  Classic model trained: {len(classic_train)} rows, {len(available)} features")
            else:
                print("  WARNING: No classic features available, skipping")
        else:
            print("  WARNING: No classic training data, skipping")
    except Exception as e:
        print(f"  WARNING: Classic model training failed: {e}")

    elapsed = time.time() - t0
    print(f"\n{'=' * 60}")
    print(f"  Retraining complete in {elapsed:.0f}s")
    print(f"  Model version: {metadata['model_version']}")
    print(f"  Artifacts: {model_dir}")
    print(f"{'=' * 60}")

    return {
        'model_version': metadata.get('model_version'),
        'duration_seconds': round(elapsed, 1),
        'model_dir': os.path.abspath(model_dir),
    }


def main() -> int:
    db_url = os.environ.get(
        'DATABASE_URL',
        'postgresql://cycling:cycling@localhost:5432/cycling_analyzer',
    )
    model_dir = os.path.join(os.path.dirname(__file__), '..', '..', 'models')
    cache_dir = os.path.join(os.path.dirname(__file__), '..', '..', 'cache')
    os.makedirs(model_dir, exist_ok=True)
    os.makedirs(cache_dir, exist_ok=True)

    started_at = datetime.now(timezone.utc).isoformat()
    started_monotonic = time.time()
    log_path = os.path.join(cache_dir, 'retrain.log')

    # Tee stdout/stderr to retrain.log so detached runs leave a trace.
    log_file = open(log_path, 'a', buffering=1)
    log_file.write(f"\n\n===== retrain started at {started_at} =====\n")
    original_stdout = sys.stdout
    original_stderr = sys.stderr
    sys.stdout = _Tee(original_stdout, log_file)
    sys.stderr = _Tee(original_stderr, log_file)

    status: dict = {
        'started_at': started_at,
        'log_path': os.path.abspath(log_path),
    }

    try:
        result = _run_pipeline(db_url, model_dir, cache_dir)
        status.update({
            'status': 'success',
            'exit_code': 0,
            'completed_at': datetime.now(timezone.utc).isoformat(),
            'duration_seconds': round(time.time() - started_monotonic, 1),
            **result,
        })
        _write_status(cache_dir, status)
        return 0
    except Exception as exc:
        tb = traceback.format_exc()
        print(tb)
        status.update({
            'status': 'failed',
            'exit_code': 1,
            'completed_at': datetime.now(timezone.utc).isoformat(),
            'duration_seconds': round(time.time() - started_monotonic, 1),
            'error': f"{type(exc).__name__}: {exc}",
            'traceback': tb,
        })
        _write_status(cache_dir, status)
        return 1
    finally:
        sys.stdout = original_stdout
        sys.stderr = original_stderr
        log_file.close()


if __name__ == '__main__':
    sys.exit(main())
