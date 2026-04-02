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
"""

import os
import time

import pandas as pd

from ..data.loader import load_data
from ..features.stage_race import extract_all_training_features


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


def main():
    db_url = os.environ.get(
        'DATABASE_URL',
        'postgresql://cycling:cycling@localhost:5432/cycling_analyzer',
    )
    model_dir = os.path.join(os.path.dirname(__file__), '..', 'models')
    cache_dir = os.path.join(os.path.dirname(__file__), '..', 'cache')
    os.makedirs(model_dir, exist_ok=True)
    os.makedirs(cache_dir, exist_ok=True)

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

    # Step 3: Build feature cache
    print("\n[3/7] Building feature cache...")
    from ..features.cache_stage import main as cache_main
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


if __name__ == '__main__':
    main()
