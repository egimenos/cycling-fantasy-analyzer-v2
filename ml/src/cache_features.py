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
import hashlib
import json
import os
import subprocess
from datetime import datetime

import pandas as pd
import psycopg2

from .features import (
    FEATURE_COLS, E01_MISSINGNESS_COLS, E02_INTENSITY_COLS,
    E03_REST_BUCKET_COLS, E04_PRESTIGE_COLS, SR_GC_COLS,
)
from .startlist_features import STARTLIST_FEATURE_COLS
from .research_v6 import load_data_fast
from .benchmark_v8 import FOLDS
from .benchmark_v8_glicko import load_glicko_ratings
from .benchmark_v8_startlist import extract_features_with_startlist

CACHE_DIR = os.path.join(os.path.dirname(__file__), '..', 'cache')
CACHE_META_PATH = os.path.join(CACHE_DIR, 'cache_meta.json')
GLICKO_FEATURES = ['gc_mu', 'gc_rd', 'stage_mu', 'stage_rd']

# Years 2019-2021 have no startlist data and never produce cache files
MIN_CACHE_YEAR = 2022


def cache_path(year: int) -> str:
    return os.path.join(CACHE_DIR, f'features_{year}.parquet')


def _needed_years() -> set[int]:
    """All years referenced by the fold configuration."""
    needed = set()
    for fold in FOLDS.values():
        needed.add(fold['test_year'])
        for yr in range(2019, fold['train_end'] + 1):
            needed.add(yr)
    return needed


def _cacheable_years() -> set[int]:
    """Years that should have parquet files (have startlist data)."""
    return {yr for yr in _needed_years() if yr >= MIN_CACHE_YEAR}


ORDINAL_TARGET_COLS = [
    'gc_final_position', 'mountain_final_position', 'sprint_final_position',
    'actual_gc_only_pts', 'actual_gc_daily_pts',
    'actual_mountain_final_pts', 'actual_mountain_pass_pts',
    'actual_sprint_final_pts', 'actual_sprint_inter_pts',
]


def compute_schema_hash() -> str:
    """Deterministic hash of the cached feature column superset."""
    all_cols = sorted(
        set(FEATURE_COLS) | set(STARTLIST_FEATURE_COLS) | set(GLICKO_FEATURES)
        | set(E01_MISSINGNESS_COLS) | set(E02_INTENSITY_COLS)
        | set(E03_REST_BUCKET_COLS) | set(E04_PRESTIGE_COLS) | set(SR_GC_COLS)
        | set(ORDINAL_TARGET_COLS)
    )
    return hashlib.sha256('\n'.join(all_cols).encode()).hexdigest()[:16]


def _get_git_sha() -> str:
    try:
        return subprocess.check_output(
            ['git', 'rev-parse', '--short', 'HEAD'],
            stderr=subprocess.DEVNULL,
        ).decode().strip()
    except Exception:
        return 'unknown'


def save_cache_metadata(year_rows: dict[int, int]) -> None:
    """Write cache_meta.json after building the cache."""
    meta = {
        'git_sha': _get_git_sha(),
        'schema_hash': compute_schema_hash(),
        'created_at': datetime.utcnow().isoformat() + 'Z',
        'years': {
            str(yr): {'rows': rows, 'file': f'features_{yr}.parquet'}
            for yr, rows in sorted(year_rows.items())
        },
    }
    with open(CACHE_META_PATH, 'w') as f:
        json.dump(meta, f, indent=2)


def validate_cache() -> tuple[bool, str]:
    """Check cache completeness and schema integrity.

    Returns (ok, message).  When ok is False the message explains why.
    """
    expected = _cacheable_years()
    missing = sorted(yr for yr in expected if not os.path.isfile(cache_path(yr)))
    if missing:
        return False, f"Missing parquet files for years: {missing}"

    if not os.path.isfile(CACHE_META_PATH):
        return False, (
            "cache_meta.json not found — rebuild cache with: "
            "python -m src.cache_features"
        )

    with open(CACHE_META_PATH) as f:
        meta = json.load(f)

    current_hash = compute_schema_hash()
    if meta.get('schema_hash') != current_hash:
        return False, (
            f"Schema hash mismatch: cache was built with {meta.get('schema_hash')}, "
            f"current code has {current_hash}. Rebuild cache."
        )

    return True, (
        f"Cache valid — schema {current_hash}, "
        f"built at {meta.get('created_at', '?')} (git {meta.get('git_sha', '?')})"
    )


def is_cached() -> bool:
    """Check if all needed years with data are cached."""
    expected = _cacheable_years()
    return all(os.path.isfile(cache_path(yr)) for yr in expected)


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
    parser.add_argument('--check', action='store_true', help='Check if cache is valid')
    args = parser.parse_args()

    if args.check:
        ok, msg = validate_cache()
        print(msg)
        if ok:
            with open(CACHE_META_PATH) as f:
                meta = json.load(f)
            for yr_str, info in meta.get('years', {}).items():
                print(f"  {yr_str}: {info['rows']:,} rows")
        else:
            expected = _cacheable_years()
            for yr in sorted(expected):
                status = "OK" if os.path.isfile(cache_path(yr)) else "MISSING"
                print(f"  {yr}: {status}")
        return

    db_url = os.environ.get(
        'DATABASE_URL',
        'postgresql://cycling:cycling@localhost:5432/cycling_analyzer',
    )

    print("=" * 60)
    print("  Feature Cache Builder")
    print(f"  Schema hash: {compute_schema_hash()}")
    print("=" * 60)

    print("\nLoading data...")
    results_df, startlists_df = load_data_fast(db_url)
    ratings_df = load_glicko_ratings(db_url)

    os.makedirs(CACHE_DIR, exist_ok=True)

    needed_years = _needed_years()
    print(f"\nExtracting features for years: {sorted(needed_years)}")

    year_rows: dict[int, int] = {}

    for yr in sorted(needed_years):
        print(f"\n  Year {yr}...")
        df = extract_features_with_startlist(
            results_df, startlists_df, ratings_df, yr,
            include_glicko_direct=True,
        )
        if len(df) > 0:
            path = cache_path(yr)
            df.to_parquet(path, index=False)
            year_rows[yr] = len(df)
            print(f"    Saved {len(df):,} rows to {path}")
        else:
            print(f"    No data for {yr}")

    save_cache_metadata(year_rows)
    print(f"\nCache complete. Metadata saved to {CACHE_META_PATH}")


if __name__ == '__main__':
    main()
