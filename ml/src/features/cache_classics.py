"""
Feature caching for classics — parquet per year.

Extracts and caches Tier 1 classic features to avoid recomputing
for every benchmark run. Similar to cache_features.py but decoupled.

Usage:
    cd ml
    python -m src.cache_features_classics                  # cache all years
    python -m src.cache_features_classics --year 2025      # single year
    python -m src.cache_features_classics --rebuild        # force rebuild all
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import time

import pandas as pd

from .data import load_data
from .features_classics import TIER1_FEATURE_COLS, extract_all_classic_features

CACHE_DIR = os.path.join(os.path.dirname(__file__), "..", "cache")
CACHE_PREFIX = "classics_features"
META_FILE = os.path.join(CACHE_DIR, "classics_cache_meta.json")
DB_URL_DEFAULT = "postgresql://cycling:cycling@localhost:5432/cycling_analyzer"

# Schema hash: changes when feature columns change → invalidates cache
_SCHEMA_SIG = "|".join(sorted(TIER1_FEATURE_COLS))
SCHEMA_HASH = hashlib.md5(_SCHEMA_SIG.encode()).hexdigest()[:12]


def _cache_path(year: int) -> str:
    return os.path.join(CACHE_DIR, f"{CACHE_PREFIX}_{year}.parquet")


def cache_classic_features(year: int, results_df: pd.DataFrame) -> str:
    """Extract and cache features for all classic races in a given year.

    Returns path to the saved parquet file.
    """
    print(f"\n  Caching classic features for {year}...")
    t0 = time.time()

    df = extract_all_classic_features(results_df, year)

    if len(df) == 0:
        print(f"    No classic races found for {year}")
        return ""

    os.makedirs(CACHE_DIR, exist_ok=True)
    path = _cache_path(year)
    df.to_parquet(path, index=False)

    elapsed = time.time() - t0
    print(f"    Saved {len(df)} rows to {path} ({elapsed:.1f}s)")

    return path


def load_cached_classics(year: int) -> pd.DataFrame:
    """Load cached classic features for a year."""
    path = _cache_path(year)
    if not os.path.exists(path):
        raise FileNotFoundError(f"Cache not found: {path}")
    return pd.read_parquet(path)


def cache_all_years(results_df: pd.DataFrame, years: list[int] | None = None) -> None:
    """Cache features for multiple years."""
    if years is None:
        years = list(range(2019, 2027))

    for year in years:
        cache_classic_features(year, results_df)

    # Save metadata
    meta = {
        "schema_hash": SCHEMA_HASH,
        "feature_cols": TIER1_FEATURE_COLS,
        "years_cached": years,
    }
    os.makedirs(CACHE_DIR, exist_ok=True)
    with open(META_FILE, "w") as f:
        json.dump(meta, f, indent=2)
    print(f"\n  Cache metadata saved to {META_FILE}")


def validate_cache() -> bool:
    """Check if cache is valid (schema hash matches)."""
    if not os.path.exists(META_FILE):
        return False
    with open(META_FILE) as f:
        meta = json.load(f)
    return meta.get("schema_hash") == SCHEMA_HASH


def main():
    parser = argparse.ArgumentParser(description="Cache classic features")
    parser.add_argument("--year", type=int, help="Cache a single year")
    parser.add_argument("--rebuild", action="store_true", help="Force rebuild all")
    args = parser.parse_args()

    db_url = os.environ.get("DATABASE_URL", DB_URL_DEFAULT)

    if not args.rebuild and validate_cache() and not args.year:
        print("Cache is valid (schema hash matches). Use --rebuild to force.")
        return

    print("Loading all race data...")
    results_df, _ = load_data(db_url)

    if args.year:
        cache_classic_features(args.year, results_df)
    else:
        cache_all_years(results_df)


if __name__ == "__main__":
    main()
