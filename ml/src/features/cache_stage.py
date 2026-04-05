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

from .stage_race import (
    FEATURE_COLS, E01_MISSINGNESS_COLS, E02_INTENSITY_COLS,
    E03_REST_BUCKET_COLS, E04_PRESTIGE_COLS, SR_GC_COLS,
    _compute_rider_features, _compute_team_info, compute_race_profile,
)
from .startlist import STARTLIST_FEATURE_COLS, build_rating_lookup, compute_all_startlist_features
from ..data.loader import load_data as load_data_fast, load_glicko_ratings
FOLDS = {1: {"train_end": 2022, "test_year": 2023}, 2: {"train_end": 2023, "test_year": 2024}, 3: {"train_end": 2024, "test_year": 2025}}  # inline from benchmark

CACHE_DIR = os.path.join(os.path.dirname(__file__), '..', '..', 'cache')
CACHE_META_PATH = os.path.join(CACHE_DIR, 'cache_meta.json')
GLICKO_FEATURES = [
    'gc_mu', 'gc_rd', 'stage_mu', 'stage_rd', 'gc_mu_delta_12m',
    'stage_flat_mu', 'stage_flat_rd',
    'stage_hilly_mu', 'stage_hilly_rd',
    'stage_mountain_mu', 'stage_mountain_rd',
    'stage_itt_mu', 'stage_itt_rd',
]

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


def _build_full_glicko_lookup(
    ratings_df: pd.DataFrame, race_date,
) -> dict:
    """Build a lookup of all 13 Glicko features per rider before race_date.

    Vectorized: filters once, groups once. Called once per race.

    Returns:
        dict mapping rider_id -> {gc_mu, gc_rd, ..., gc_mu_delta_12m}.
    """
    if ratings_df is None or len(ratings_df) == 0:
        return {}

    before = ratings_df[ratings_df['race_date'] < race_date]
    if len(before) == 0:
        return {}

    latest = before.groupby('rider_id').last()

    cutoff_12m = race_date - pd.Timedelta(days=365)
    before_12m = before[before['race_date'] <= cutoff_12m]
    older = before_12m.groupby('rider_id').last() if len(before_12m) > 0 else pd.DataFrame()

    lookup = {}
    for rider_id, row in latest.iterrows():
        entry = {}
        for col in GLICKO_FEATURES:
            if col == 'gc_mu_delta_12m':
                gc_mu_now = row.get('gc_mu', 1500.0)
                gc_mu_12m = older.loc[rider_id, 'gc_mu'] if rider_id in older.index else 1500.0
                entry[col] = gc_mu_now - gc_mu_12m
            elif col in row.index:
                entry[col] = row[col]
            else:
                entry[col] = 1500.0 if 'mu' in col else 350.0
        lookup[rider_id] = entry

    return lookup


def _default_glicko() -> dict:
    """Return default Glicko features for riders with no rating history."""
    return {col: (1500.0 if 'mu' in col else (350.0 if 'rd' in col else 0.0))
            for col in GLICKO_FEATURES}


def extract_features_with_startlist(
    results_df: pd.DataFrame,
    startlists_df: pd.DataFrame,
    ratings_df: pd.DataFrame,
    year: int,
    include_glicko_direct: bool = True,
) -> pd.DataFrame:
    """Extract features for all races in a given year with startlist + Glicko enrichment.

    Produces the full ~125-column cache DataFrame including base features,
    startlist features, Glicko ratings, ordinal targets, and supply columns.
    """
    year_startlists = startlists_df[startlists_df['year'] == year]
    races = year_startlists.drop_duplicates(subset=['race_slug', 'year']).merge(
        results_df[['race_slug', 'year', 'race_type', 'race_date']]
            .drop_duplicates(subset=['race_slug', 'year']),
        on=['race_slug', 'year'],
        how='inner',
    )

    if len(races) == 0:
        return pd.DataFrame()

    all_rows = []
    processed = 0

    for _, race in races.iterrows():
        race_slug = race['race_slug']
        race_year = race['year']
        race_type = race['race_type']
        race_date = race['race_date']
        if pd.isna(race_date):
            continue
        race_date_py = race_date.date() if hasattr(race_date, 'date') else race_date

        sl = startlists_df[
            (startlists_df['race_slug'] == race_slug) &
            (startlists_df['year'] == race_year)
        ]
        sl_riders = sl['rider_id'].values

        hist = results_df[
            (results_df['rider_id'].isin(sl_riders)) &
            (results_df['race_date'] < race_date)
        ]

        actual = results_df[
            (results_df['race_slug'] == race_slug) &
            (results_df['year'] == race_year)
        ]

        d365 = race_date - pd.Timedelta(days=365)
        d180 = race_date - pd.Timedelta(days=180)
        d90 = race_date - pd.Timedelta(days=90)
        d30 = race_date - pd.Timedelta(days=30)
        d14 = race_date - pd.Timedelta(days=14)

        rider_team_info = _compute_team_info(sl, sl_riders, hist, d365)
        rp = compute_race_profile(results_df, race_slug, race_year)

        # Startlist features (7 cols)
        rating_lookup = build_rating_lookup(ratings_df, race_date)
        sl_features = compute_all_startlist_features(sl, rating_lookup)

        # Glicko lookup (13 cols, vectorized per race)
        glicko_lookup = _build_full_glicko_lookup(ratings_df, race_date) if include_glicko_direct else {}
        default_glicko = _default_glicko()

        # Supply columns (race-level)
        mtn_pass_supply = actual[actual['category'] == 'mountain_pass']['pts'].sum()
        spr_inter_supply = actual[actual['category'] == 'sprint_intermediate']['pts'].sum()

        for rider_id in sl_riders:
            feats = _compute_rider_features(
                rider_id=rider_id,
                hist=hist,
                results_df=results_df,
                race_slug=race_slug,
                race_type=race_type,
                race_date=race_date,
                race_date_py=race_date_py,
                d365=d365, d180=d180, d90=d90, d30=d30, d14=d14,
                rider_team_info=rider_team_info,
            )
            feats['target_flat_pct'] = rp.get('target_flat_pct', 0.0)
            feats['target_mountain_pct'] = rp.get('target_mountain_pct', 0.0)
            feats['target_itt_pct'] = rp.get('target_itt_pct', 0.0)

            rider_actual = actual[actual['rider_id'] == rider_id]
            feats['actual_pts'] = rider_actual['pts'].sum()

            # Startlist features
            rider_sl = sl_features.get(rider_id, {})
            for col in STARTLIST_FEATURE_COLS:
                feats[col] = rider_sl.get(col, 0.0)

            # Glicko features
            if include_glicko_direct:
                rider_glicko = glicko_lookup.get(rider_id, default_glicko)
                feats.update(rider_glicko)

            # Ordinal targets (positions)
            for cat, pos_col in [
                ('gc', 'gc_final_position'),
                ('mountain', 'mountain_final_position'),
                ('sprint', 'sprint_final_position'),
            ]:
                cat_rows = rider_actual[rider_actual['category'] == cat]
                feats[pos_col] = cat_rows['position'].iloc[0] if len(cat_rows) > 0 else float('nan')

            # Ordinal targets (category pts)
            feats['actual_gc_only_pts'] = rider_actual[rider_actual['category'] == 'gc']['pts'].sum()
            feats['actual_gc_daily_pts'] = rider_actual[rider_actual['category'] == 'gc_daily']['pts'].sum()
            feats['actual_mountain_final_pts'] = rider_actual[rider_actual['category'] == 'mountain']['pts'].sum()
            feats['actual_mountain_pass_pts'] = rider_actual[rider_actual['category'] == 'mountain_pass']['pts'].sum()
            feats['actual_sprint_final_pts'] = rider_actual[rider_actual['category'] == 'sprint']['pts'].sum()
            feats['actual_sprint_inter_pts'] = rider_actual[rider_actual['category'] == 'sprint_intermediate']['pts'].sum()

            # Category-level aggregates
            feats['actual_gc_pts'] = feats['actual_gc_only_pts'] + feats['actual_gc_daily_pts']
            feats['actual_stage_pts'] = rider_actual[rider_actual['category'] == 'stage']['pts'].sum()
            feats['actual_mountain_pts'] = feats['actual_mountain_final_pts'] + feats['actual_mountain_pass_pts']
            feats['actual_sprint_pts'] = feats['actual_sprint_final_pts'] + feats['actual_sprint_inter_pts']

            # Supply columns
            feats['target_mtn_pass_supply'] = mtn_pass_supply
            feats['target_spr_inter_supply'] = spr_inter_supply

            # Capture ratios
            feats['mtn_pass_capture'] = (
                feats['actual_mountain_pass_pts'] / mtn_pass_supply if mtn_pass_supply > 0 else 0.0
            )
            feats['spr_inter_capture'] = (
                feats['actual_sprint_inter_pts'] / spr_inter_supply if spr_inter_supply > 0 else 0.0
            )

            # Metadata
            feats['rider_id'] = rider_id
            feats['race_slug'] = race_slug
            feats['race_year'] = race_year
            feats['race_type'] = race_type
            feats['race_date'] = race_date_py

            all_rows.append(feats)

        processed += 1
        if processed % 20 == 0:
            print(f"    [{processed}/{len(races)}] races...")

    return pd.DataFrame(all_rows) if all_rows else pd.DataFrame()


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
