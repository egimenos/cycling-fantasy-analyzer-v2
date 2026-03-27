"""
Cache feature extraction to disk for fast benchmark iteration.

Extracts features ONCE for all folds (train + test) with all possible
feature columns (baseline + startlist + Glicko) and saves to parquet.
Subsequent benchmark runs load from cache instead of recomputing.

Usage:
    cd ml && python -m src.cache_features          # extract and cache
    cd ml && python -m src.cache_features --check  # verify cache exists
"""

import argparse
import os
from datetime import date

import pandas as pd
import psycopg2

from .features import FEATURE_COLS
from .startlist_features import STARTLIST_FEATURE_COLS
from .research_v6 import load_data_fast
from .benchmark_v8 import FOLDS
from .benchmark_v8_glicko import load_glicko_ratings
from .benchmark_v8_startlist import extract_features_with_startlist

CACHE_DIR = os.path.join(os.path.dirname(__file__), '..', 'cache')
GLICKO_FEATURES = ['gc_mu', 'gc_rd', 'stage_mu', 'stage_rd']


def cache_path(year: int) -> str:
    return os.path.join(CACHE_DIR, f'features_{year}.parquet')


def is_cached() -> bool:
    """Check if all needed years are cached."""
    needed = set()
    for fold in FOLDS.values():
        needed.add(fold['test_year'])
        for yr in range(2019, fold['train_end'] + 1):
            needed.add(yr)
    return all(os.path.isfile(cache_path(yr)) for yr in needed)


def load_cached(year: int) -> pd.DataFrame:
    """Load cached features for a year."""
    path = cache_path(year)
    if not os.path.isfile(path):
        raise FileNotFoundError(f"No cache for {year}: {path}")
    return pd.read_parquet(path)


def load_train_test(fold_num: int) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Load cached train and test DataFrames for a fold."""
    fold = FOLDS[fold_num]
    test_df = load_cached(fold['test_year'])

    train_dfs = []
    for yr in range(2019, fold['train_end'] + 1):
        try:
            df = load_cached(yr)
            if len(df) > 0:
                train_dfs.append(df)
        except FileNotFoundError:
            pass

    train_df = pd.concat(train_dfs, ignore_index=True) if train_dfs else pd.DataFrame()
    return train_df, test_df


def main():
    parser = argparse.ArgumentParser(description='Cache feature extraction')
    parser.add_argument('--check', action='store_true', help='Check if cache exists')
    args = parser.parse_args()

    if args.check:
        if is_cached():
            print("Cache is complete.")
        else:
            print("Cache is MISSING or incomplete.")
            needed = set()
            for fold in FOLDS.values():
                needed.add(fold['test_year'])
                for yr in range(2019, fold['train_end'] + 1):
                    needed.add(yr)
            for yr in sorted(needed):
                status = "OK" if os.path.isfile(cache_path(yr)) else "MISSING"
                print(f"  {yr}: {status}")
        return

    db_url = os.environ.get(
        'DATABASE_URL',
        'postgresql://cycling:cycling@localhost:5432/cycling_analyzer',
    )

    print("=" * 60)
    print("  Feature Cache Builder")
    print("=" * 60)

    print("\nLoading data...")
    results_df, startlists_df = load_data_fast(db_url)
    ratings_df = load_glicko_ratings(db_url)

    os.makedirs(CACHE_DIR, exist_ok=True)

    # Determine all years needed
    needed_years = set()
    for fold in FOLDS.values():
        needed_years.add(fold['test_year'])
        for yr in range(2019, fold['train_end'] + 1):
            needed_years.add(yr)

    print(f"\nExtracting features for years: {sorted(needed_years)}")

    for yr in sorted(needed_years):
        print(f"\n  Year {yr}...")
        # Extract with ALL features (superset: baseline + startlist + Glicko)
        df = extract_features_with_startlist(
            results_df, startlists_df, ratings_df, yr,
            include_glicko_direct=True,
        )
        if len(df) > 0:
            path = cache_path(yr)
            df.to_parquet(path, index=False)
            print(f"    Saved {len(df):,} rows to {path}")
        else:
            print(f"    No data for {yr}")

    print(f"\nCache complete. Use load_cached(year) or load_train_test(fold) to load.")


if __name__ == '__main__':
    main()
