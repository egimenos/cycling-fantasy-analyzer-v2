"""
CLI entrypoint for model retraining.

Orchestrates: load data -> extract features -> train models -> save version.
Called via: make retrain  (which runs: cd ml && python -m src.retrain)
"""

import os
from datetime import datetime, timezone

from .data import load_data
from .features import extract_all_training_features
from .train import train_models


def main():
    db_url = os.environ.get(
        'DATABASE_URL',
        'postgresql://cycling:cycling@localhost:5432/cycling_analyzer',
    )
    model_dir = os.path.join(os.path.dirname(__file__), '..', 'models')
    os.makedirs(model_dir, exist_ok=True)

    print("[1/4] Loading data...")
    results_df, startlists_df = load_data(db_url)

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
