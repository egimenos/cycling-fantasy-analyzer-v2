"""
Glicko-2 Rating System for cycling riders.

Computes per-rider ratings updated chronologically after each race.
Separate ratings for GC and Stage performance.

Glicko-2 advantages over basic Elo:
- Explicit rating deviation (RD) = uncertainty. New riders have high RD,
  veterans have low RD. The model can use this to weight predictions.
- Volatility parameter handles riders whose performance varies a lot.
- Better mathematical foundation for multi-player competitions.

Reference: Glickman, M.E. (2001) "Parameter estimation in large dynamic
paired comparison experiments"

Usage:
    cd ml && python -m src.glicko2                    # compute and save to DB
    cd ml && python -m src.glicko2 --dry-run          # compute without saving
    cd ml && python -m src.glicko2 --rider vingegaard # show one rider's history
"""

import math
import os
from collections import defaultdict

import numpy as np
import pandas as pd
import psycopg2
import psycopg2.extras

from .research_v6 import load_data_fast

# ── Glicko-2 Constants ──────────────────────────────────────────────

# Initial rating (like Elo 1500)
INITIAL_MU = 1500.0
# Initial rating deviation (high = uncertain)
INITIAL_RD = 350.0
# Initial volatility
INITIAL_SIGMA = 0.06
# System constant (constrains volatility change). Higher = more volatile.
TAU = 0.5
# Convergence tolerance for volatility iteration
EPSILON = 0.000001

# Race prestige multiplier for K-factor equivalent
# Higher prestige races have more impact on rating changes.
# Values aligned with UCI World Ranking points ratios (baseline: UWT mini = 1.0).
# Source: https://www.procyclingstats.com/info.php?s=point-scales
RACE_PRESTIGE = {
    ('mini_tour', 'UWT'): 1.0,    # Dauphiné, Suisse, Tirreno, etc. (baseline)
    ('mini_tour', 'Pro'): 0.4,    # Luxembourg, Burgos, etc.
    ('classic', 'UWT'): 0.8,      # Monuments (not used for GC/stage ratings)
    ('classic', 'Pro'): 0.3,      # Smaller classics (not used for GC/stage ratings)
}

# Grand Tours get slug-specific prestige (Tour > Giro/Vuelta per UCI points)
GT_PRESTIGE = {
    'tour-de-france': 2.6,        # 1300 UCI pts → 1300/500 = 2.6x
    'giro-d-italia': 2.2,         # 1100 UCI pts → 1100/500 = 2.2x
    'vuelta-a-espana': 2.2,       # 1100 UCI pts → 1100/500 = 2.2x
}
GT_PRESTIGE_DEFAULT = 2.2         # Fallback for any unknown GT

# How many pairwise comparisons to sample per rider per race
# (full pairwise on 150+ riders is O(n²), we sample for speed)
MAX_OPPONENTS = 30


# ── Glicko-2 Math ───────────────────────────────────────────────────

def _g(rd: float) -> float:
    """Glicko-2 g function: reduces impact of opponents with high RD."""
    return 1.0 / math.sqrt(1.0 + 3.0 * rd * rd / (math.pi * math.pi))


def _E(mu: float, mu_j: float, rd_j: float) -> float:
    """Expected score against opponent j."""
    exponent = -_g(rd_j) * (mu - mu_j)
    # Clamp to avoid overflow
    exponent = max(-500, min(500, exponent))
    return 1.0 / (1.0 + math.exp(exponent))


def _compute_v(mu: float, opponents: list) -> float:
    """Estimated variance of rating based on game outcomes."""
    total = 0.0
    for mu_j, rd_j, _score in opponents:
        g_j = _g(rd_j)
        e_j = _E(mu, mu_j, rd_j)
        total += g_j * g_j * e_j * (1.0 - e_j)
    return 1.0 / total if total > 0 else 1e6


def _compute_delta(mu: float, v: float, opponents: list) -> float:
    """Estimated improvement in rating."""
    total = 0.0
    for mu_j, rd_j, score in opponents:
        g_j = _g(rd_j)
        e_j = _E(mu, mu_j, rd_j)
        total += g_j * (score - e_j)
    return v * total


def _new_volatility(sigma: float, delta: float, rd: float, v: float, tau: float = TAU) -> float:
    """Compute new volatility using Illinois algorithm.

    Protected against numerical overflow with clamping and try/except.
    """
    try:
        a = math.log(max(sigma * sigma, 1e-20))
    except (ValueError, OverflowError):
        return INITIAL_SIGMA

    phi = rd

    def f(x):
        try:
            x_clamped = max(-20, min(20, x))
            ex = math.exp(x_clamped)
            d2 = delta * delta
            p2 = phi * phi
            inner = p2 + v + ex
            if inner <= 0 or inner > 1e150:
                return 0.0
            denom = 2.0 * inner * inner
            if denom <= 0 or math.isinf(denom):
                return 0.0
            return (ex * (d2 - p2 - v - ex)) / denom - (x - a) / (tau * tau)
        except (OverflowError, ValueError, ZeroDivisionError):
            return 0.0

    try:
        A = a
        if delta * delta > rd * rd + v:
            diff = delta * delta - rd * rd - v
            B = math.log(max(diff, 1e-20))
        else:
            k = 1
            while k < 20 and f(a - k * tau) < 0:
                k += 1
            B = a - k * tau

        fA = f(A)
        fB = f(B)

        iterations = 0
        while abs(B - A) > EPSILON and iterations < 100:
            if abs(fB - fA) < 1e-20:
                break
            C = A + (A - B) * fA / (fB - fA)
            fC = f(C)

            if fC * fB <= 0:
                A = B
                fA = fB
            else:
                fA /= 2.0

            B = C
            fB = fC
            iterations += 1

        result = math.exp(max(-10, min(10, B / 2.0)))
        return min(result, 0.5)  # Cap volatility
    except (OverflowError, ValueError, ZeroDivisionError):
        return sigma  # Return unchanged on any numerical issue


def update_rating(
    mu: float, rd: float, sigma: float,
    opponents: list[tuple[float, float, float]],
    prestige: float = 1.0,
) -> tuple[float, float, float]:
    """Update a player's Glicko-2 rating after a rating period.

    Args:
        mu: Current rating.
        rd: Current rating deviation.
        sigma: Current volatility.
        opponents: List of (opponent_mu, opponent_rd, score) tuples.
            score: 1.0 = win, 0.5 = draw, 0.0 = loss.
        prestige: Multiplier for this rating period's impact.

    Returns:
        (new_mu, new_rd, new_sigma)
    """
    if not opponents:
        # No games: RD increases (uncertainty grows)
        new_rd = min(math.sqrt(rd * rd + sigma * sigma), INITIAL_RD)
        return mu, new_rd, sigma

    # Scale to Glicko-2 internal scale
    scale = 173.7178
    mu_g2 = (mu - 1500) / scale
    rd_g2 = rd / scale
    opps_g2 = [(((o_mu - 1500) / scale), o_rd / scale, s) for o_mu, o_rd, s in opponents]

    # Step 3: Compute v
    v = _compute_v(mu_g2, opps_g2)

    # Step 4: Compute delta
    delta = _compute_delta(mu_g2, v, opps_g2)

    # Step 5: New volatility
    new_sigma = _new_volatility(sigma, delta * prestige, rd_g2, v)

    # Step 6: Update RD
    rd_star = math.sqrt(rd_g2 * rd_g2 + new_sigma * new_sigma)

    # Step 7: New RD and mu
    new_rd_g2 = 1.0 / math.sqrt(1.0 / (rd_star * rd_star) + 1.0 / v)
    new_mu_g2 = mu_g2 + new_rd_g2 * new_rd_g2 * sum(
        _g(o_rd) * (s - _E(mu_g2, o_mu, o_rd))
        for o_mu, o_rd, s in opps_g2
    ) * prestige

    # Scale back
    new_mu = new_mu_g2 * scale + 1500
    new_rd = new_rd_g2 * scale

    # Cap delta per update: prevents provisional riders (high RD) from
    # jumping +3000 in a single race.  A GT win might move +400 max,
    # a mini tour win +250.  Prestige already scales the update, so
    # the cap is on the final delta after prestige is applied.
    MAX_DELTA_MU = 400.0
    delta_mu = new_mu - mu
    if abs(delta_mu) > MAX_DELTA_MU:
        new_mu = mu + MAX_DELTA_MU * (1.0 if delta_mu > 0 else -1.0)

    # Clamp RD
    new_rd = min(new_rd, INITIAL_RD)
    new_rd = max(new_rd, 30.0)

    return new_mu, new_rd, new_sigma


# ── Race Processing ──────────────────────────────────────────────────

# Quality-weighted GC comparison pool.
# Use top-N finishers as the pool, then sample opponents weighted by gc_mu.
# This incorporates strength of schedule: competing in strong fields (GT)
# produces comparisons against strong opponents, while weak fields (Pologne)
# produce comparisons against weak opponents → less rating movement.
GC_POOL_MAX = 50          # Consider top-50 GC finishers as potential opponents
GC_SAMPLE_SIZE = 25       # Sample this many opponents per rider

def process_gc_race(
    gc_results: list[tuple[str, int]],
    ratings: dict,
    prestige: float,
    rng: np.random.RandomState,
) -> dict:
    """Update GC ratings based on final GC standings.

    Quality-weighted approach:
    1. Pool = top GC_POOL_MAX finishers (excludes deep gregarios)
    2. For each rider, sample GC_SAMPLE_SIZE opponents from pool,
       weighted by opponent gc_mu (stronger opponents more likely sampled)
    3. This means results in strong fields generate comparisons against
       strong riders → more informative. Weak fields → less movement.

    Args:
        gc_results: List of (rider_id, position) sorted by position.
        ratings: Dict of rider_id → {'mu', 'rd', 'sigma'}.
        prestige: Race prestige multiplier.
        rng: Random state for opponent sampling.

    Returns:
        Updated ratings dict.
    """
    gc_results = sorted(gc_results, key=lambda x: x[1])
    # Limit pool to top-N finishers
    pool = gc_results[:min(len(gc_results), GC_POOL_MAX)]
    riders = [r for r, _ in pool]
    positions = {r: p for r, p in gc_results}

    for rider_id in riders:
        if rider_id not in ratings:
            ratings[rider_id] = {'mu': INITIAL_MU, 'rd': INITIAL_RD, 'sigma': INITIAL_SIGMA}

        my_pos = positions[rider_id]
        my_rating = ratings[rider_id]

        # Candidate opponents: everyone in the pool except me
        candidates = [(r, p) for r, p in pool if r != rider_id]
        if len(candidates) == 0:
            continue

        # Weight by opponent gc_mu (higher mu → more likely to be sampled)
        # Shift to avoid negative weights: use (mu - min_mu + 100) as weight
        cand_mus = np.array([
            ratings.get(r, {'mu': INITIAL_MU})['mu'] for r, _ in candidates
        ])
        weights = cand_mus - cand_mus.min() + 100.0
        weights = weights / weights.sum()

        # Sample opponents
        n_sample = min(GC_SAMPLE_SIZE, len(candidates))
        sampled_idx = rng.choice(len(candidates), size=n_sample, replace=False, p=weights)

        opponents = []
        for idx in sampled_idx:
            opp_id, opp_pos = candidates[idx]
            opp_r = ratings.get(opp_id, {'mu': INITIAL_MU, 'rd': INITIAL_RD})
            score = 1.0 if my_pos < opp_pos else (0.5 if my_pos == opp_pos else 0.0)
            opponents.append((opp_r['mu'], opp_r['rd'], score))

        new_mu, new_rd, new_sigma = update_rating(
            my_rating['mu'], my_rating['rd'], my_rating['sigma'],
            opponents, prestige,
        )
        ratings[rider_id] = {'mu': new_mu, 'rd': new_rd, 'sigma': new_sigma}

    return ratings


def process_stage_race(
    stage_results: list[tuple[str, int]],
    ratings: dict,
    prestige: float,
    rng: np.random.RandomState,
) -> dict:
    """Update Stage ratings based on stage finish positions.
    Same logic as GC but applied to individual stage results."""
    return process_gc_race(stage_results, ratings, prestige, rng)


# ── Main computation ─────────────────────────────────────────────────

def compute_all_ratings(results_df: pd.DataFrame) -> pd.DataFrame:
    """Compute Glicko-2 ratings for all riders across all races chronologically.

    Returns DataFrame with columns:
        rider_id, race_slug, year, race_date,
        gc_mu, gc_rd, gc_sigma, stage_mu, stage_rd, stage_sigma
    """
    rng = np.random.RandomState(42)

    # Current ratings (updated as we process races)
    gc_ratings = {}
    stage_ratings = {}

    # Get distinct races in chronological order
    races = results_df[
        results_df['race_type'].isin(['mini_tour', 'grand_tour'])
    ].groupby(['race_slug', 'year', 'race_type', 'race_class']).agg(
        race_date=('race_date', 'min')
    ).reset_index().sort_values('race_date')

    print(f"  Processing {len(races)} races chronologically...")

    snapshots = []
    processed = 0

    for _, race in races.iterrows():
        slug = race['race_slug']
        year = race['year']
        race_type = race['race_type']
        race_class = race['race_class']
        race_date = race['race_date']

        if race_type == 'grand_tour':
            prestige = GT_PRESTIGE.get(slug, GT_PRESTIGE_DEFAULT)
        else:
            prestige = RACE_PRESTIGE.get((race_type, race_class), 0.5)

        race_results = results_df[
            (results_df['race_slug'] == slug) &
            (results_df['year'] == year)
        ]

        # GC results (final classification)
        gc = race_results[
            (race_results['category'] == 'gc') &
            (race_results['position'].notna()) &
            (race_results['position'] > 0)
        ].sort_values('position')

        if len(gc) >= 3:
            gc_list = list(zip(gc['rider_id'].values, gc['position'].astype(int).values))
            gc_ratings = process_gc_race(gc_list, gc_ratings, prestige, rng)

        # Stage results (aggregate stage finishes)
        stages = race_results[
            (race_results['category'] == 'stage') &
            (race_results['position'].notna()) &
            (race_results['position'] > 0)
        ]

        if len(stages) >= 3:
            # Use average stage position as the "result" for stage rating
            avg_pos = stages.groupby('rider_id')['position'].mean().reset_index()
            avg_pos = avg_pos.sort_values('position')
            # Convert to integer rank
            avg_pos['rank'] = range(1, len(avg_pos) + 1)
            stage_list = list(zip(avg_pos['rider_id'].values, avg_pos['rank'].values))
            stage_ratings = process_stage_race(stage_list, stage_ratings, prestige, rng)

        # Snapshot: save ratings BEFORE this race (for prediction features)
        # We want the rating at prediction time, not after the race
        all_rider_ids = set()
        if len(gc) >= 3:
            all_rider_ids.update(gc['rider_id'].values)
        if len(stages) >= 3:
            all_rider_ids.update(stages.groupby('rider_id').first().index)

        for rid in all_rider_ids:
            gc_r = gc_ratings.get(rid, {'mu': INITIAL_MU, 'rd': INITIAL_RD, 'sigma': INITIAL_SIGMA})
            st_r = stage_ratings.get(rid, {'mu': INITIAL_MU, 'rd': INITIAL_RD, 'sigma': INITIAL_SIGMA})
            snapshots.append({
                'rider_id': rid,
                'race_slug': slug,
                'year': year,
                'race_date': race_date,
                'gc_mu': gc_r['mu'],
                'gc_rd': gc_r['rd'],
                'gc_sigma': gc_r['sigma'],
                'stage_mu': st_r['mu'],
                'stage_rd': st_r['rd'],
                'stage_sigma': st_r['sigma'],
            })

        processed += 1
        if processed % 20 == 0:
            print(f"    [{processed}/{len(races)}] races...")

    df = pd.DataFrame(snapshots)
    print(f"  Rating snapshots: {len(df):,} rows")
    return df


def get_latest_ratings(snapshots_df: pd.DataFrame) -> pd.DataFrame:
    """Get the most recent rating for each rider."""
    latest = snapshots_df.sort_values('race_date').groupby('rider_id').last().reset_index()
    return latest


# ── Main ─────────────────────────────────────────────────────────────

def main():
    import argparse
    parser = argparse.ArgumentParser(description='Compute Glicko-2 ratings for cycling riders')
    parser.add_argument('--dry-run', action='store_true', help='Compute without saving to DB')
    parser.add_argument('--rider', type=str, help='Show rating history for a rider (name substring)')
    args = parser.parse_args()

    db_url = os.environ.get(
        'DATABASE_URL',
        'postgresql://cycling:cycling@localhost:5432/cycling_analyzer',
    )

    print("=" * 60)
    print("  Glicko-2 Rating System for Cycling")
    print("=" * 60)

    print("\n[1/3] Loading data...")
    results_df, _ = load_data_fast(db_url)

    print("\n[2/3] Computing ratings...")
    snapshots = compute_all_ratings(results_df)

    # Show top riders
    latest = get_latest_ratings(snapshots)

    # Merge rider names
    rider_names = results_df[['rider_id', 'rider_name']].drop_duplicates().set_index('rider_id')['rider_name']
    latest['name'] = latest['rider_id'].map(rider_names)

    print("\n  Top 20 GC ratings:")
    top_gc = latest.nlargest(20, 'gc_mu')
    for _, r in top_gc.iterrows():
        print(f"    {r['name']:30s}  mu={r['gc_mu']:.0f}  rd={r['gc_rd']:.0f}  (uncertainty: {'low' if r['gc_rd'] < 100 else 'med' if r['gc_rd'] < 200 else 'high'})")

    print("\n  Top 20 Stage ratings:")
    top_stage = latest.nlargest(20, 'stage_mu')
    for _, r in top_stage.iterrows():
        print(f"    {r['name']:30s}  mu={r['stage_mu']:.0f}  rd={r['stage_rd']:.0f}")

    if args.rider:
        rider_match = latest[latest['name'].str.contains(args.rider, case=False, na=False)]
        if len(rider_match) > 0:
            rid = rider_match.iloc[0]['rider_id']
            name = rider_match.iloc[0]['name']
            history = snapshots[snapshots['rider_id'] == rid].sort_values('race_date')
            print(f"\n  Rating history for {name}:")
            for _, h in history.iterrows():
                print(f"    {h['race_slug']:35s} {h['year']}  gc={h['gc_mu']:.0f}±{h['gc_rd']:.0f}  stage={h['stage_mu']:.0f}±{h['stage_rd']:.0f}")

    if not args.dry_run:
        print("\n[3/3] Saving to database...")
        conn = psycopg2.connect(db_url)
        cur = conn.cursor()

        # Create table if not exists
        cur.execute("""
            CREATE TABLE IF NOT EXISTS rider_ratings (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                rider_id UUID REFERENCES riders(id),
                race_slug VARCHAR(255) NOT NULL,
                year INTEGER NOT NULL,
                race_date DATE,
                gc_mu FLOAT NOT NULL DEFAULT 1500,
                gc_rd FLOAT NOT NULL DEFAULT 350,
                gc_sigma FLOAT NOT NULL DEFAULT 0.06,
                stage_mu FLOAT NOT NULL DEFAULT 1500,
                stage_rd FLOAT NOT NULL DEFAULT 350,
                stage_sigma FLOAT NOT NULL DEFAULT 0.06,
                UNIQUE(rider_id, race_slug, year)
            );
            CREATE INDEX IF NOT EXISTS idx_rider_ratings_rider ON rider_ratings(rider_id);
            CREATE INDEX IF NOT EXISTS idx_rider_ratings_race ON rider_ratings(race_slug, year);
        """)

        # Truncate and reinsert (full recompute)
        cur.execute("TRUNCATE rider_ratings")

        # Batch insert
        values = []
        for _, row in snapshots.iterrows():
            values.append((
                row['rider_id'], row['race_slug'], row['year'],
                row['race_date'],
                row['gc_mu'], row['gc_rd'], row['gc_sigma'],
                row['stage_mu'], row['stage_rd'], row['stage_sigma'],
            ))

        psycopg2.extras.execute_batch(cur, """
            INSERT INTO rider_ratings (rider_id, race_slug, year, race_date,
                gc_mu, gc_rd, gc_sigma, stage_mu, stage_rd, stage_sigma)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (rider_id, race_slug, year) DO UPDATE SET
                gc_mu = EXCLUDED.gc_mu, gc_rd = EXCLUDED.gc_rd, gc_sigma = EXCLUDED.gc_sigma,
                stage_mu = EXCLUDED.stage_mu, stage_rd = EXCLUDED.stage_rd, stage_sigma = EXCLUDED.stage_sigma
        """, values, page_size=1000)

        conn.commit()
        conn.close()
        print(f"  Saved {len(snapshots):,} rating snapshots")
    else:
        print("\n[3/3] Dry run — not saving to DB")

    print("\nDone.")


if __name__ == '__main__':
    main()
