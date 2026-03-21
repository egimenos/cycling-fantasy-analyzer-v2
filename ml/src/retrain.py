"""
CLI entrypoint for model retraining.

Orchestrates: load data -> extract features -> train models -> save version.
Called via: make retrain  (which runs: cd ml && python -m src.retrain)
"""

import os
from datetime import datetime, timezone

import pandas as pd

from .data import load_data
from .features import extract_all_training_features
from .train import train_models


def _synthesize_startlists(results_df: pd.DataFrame) -> pd.DataFrame:
    """Derive startlists from race_results when startlist_entries is empty.

    Creates one entry per distinct (rider_id, race_slug, year) from results.
    This fallback keeps the retrain pipeline working even when the
    startlist_entries table has not been populated yet.
    """
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
    os.makedirs(model_dir, exist_ok=True)

    print("[1/4] Loading data...")
    results_df, startlists_df = load_data(db_url)

    if len(startlists_df) == 0:
        print("  WARNING: startlist_entries is empty — synthesizing from race results")
        startlists_df = _synthesize_startlists(results_df)
        print(f"  Synthesized {len(startlists_df):,} startlist entries")

    print("[2/4] Extracting training features...")
    dataset = extract_all_training_features(results_df, startlists_df)

    print("[3/4] Training models...")
    metrics = train_models(dataset, model_dir)

    print("[4/4] Writing model version...")
    version = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S')
    version_path = os.path.join(model_dir, 'model_version.txt')
    with open(version_path, 'w') as f:
        f.write(version)

    print(f"Done. Model version: {version}")
    for key, val in metrics.items():
        print(f"  {key}: {val}")


if __name__ == '__main__':
    main()
