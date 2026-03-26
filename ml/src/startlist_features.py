"""
Startlist-aware team role features (FR-005d).

Computes features based on WHO ELSE is on the startlist from the same team.
This is the key missing signal: McNulty as UAE leader → 1st GC,
McNulty with Pogačar/Almeida → 50th GC.

Features:
- n_stronger_teammates: teammates on this startlist with higher Glicko gc_mu
- is_startlist_leader: 1 if rider has highest gc_mu on their team in this startlist
- strongest_teammate_gap: gc_mu difference between rider and strongest teammate
    (positive = I'm stronger, negative = teammate is stronger)
- team_gc_candidates: count of teammates with gc_mu > 2000 (competitive GC level)
- team_avg_gc_mu: average gc_mu of all teammates on this startlist

Usage:
    from src.startlist_features import compute_startlist_team_features

    # For each rider on a startlist:
    features = compute_startlist_team_features(
        rider_id, team_name, startlist_df, rating_lookup
    )
"""

import numpy as np
import pandas as pd

# Threshold for "GC candidate" — rider with gc_mu above this is a realistic
# contender for GC podium in a WT race. Based on Glicko-2 calibration:
# Top ~30 GC riders are above 2000.
GC_CANDIDATE_THRESHOLD = 2000.0

# Default rating for riders without Glicko-2 history
DEFAULT_GC_MU = 1500.0
DEFAULT_GC_RD = 350.0

STARTLIST_FEATURE_COLS = [
    'n_stronger_teammates',
    'is_startlist_leader',
    'strongest_teammate_gap',
    'team_gc_candidates',
    'team_avg_gc_mu',
]


def build_rating_lookup(
    ratings_df: pd.DataFrame,
    race_date,
) -> dict:
    """Build a rider_id → gc_mu lookup using most recent rating before race_date.

    Args:
        ratings_df: Full Glicko-2 snapshots (sorted by race_date).
        race_date: Only use ratings before this date.

    Returns:
        Dict mapping rider_id → {'gc_mu': float, 'gc_rd': float, 'stage_mu': float, 'stage_rd': float}
    """
    before = ratings_df[ratings_df['race_date'] < race_date]
    if len(before) == 0:
        return {}

    # Get latest rating per rider
    latest = before.groupby('rider_id').last()
    return {
        rid: {
            'gc_mu': row['gc_mu'],
            'gc_rd': row['gc_rd'],
            'stage_mu': row['stage_mu'],
            'stage_rd': row['stage_rd'],
        }
        for rid, row in latest.iterrows()
    }


def compute_startlist_team_features(
    rider_id: str,
    team_name: str,
    startlist: pd.DataFrame,
    rating_lookup: dict,
) -> dict:
    """Compute startlist-aware team features for a single rider.

    Args:
        rider_id: The rider to compute features for.
        team_name: This rider's team in this race.
        startlist: Full startlist DataFrame for this race (race_slug, year, rider_id, team_name).
        rating_lookup: Dict mapping rider_id → {'gc_mu', 'gc_rd', ...}.

    Returns:
        Dict with STARTLIST_FEATURE_COLS values.
    """
    # Get my rating
    my_rating = rating_lookup.get(rider_id, {'gc_mu': DEFAULT_GC_MU, 'gc_rd': DEFAULT_GC_RD})
    my_gc_mu = my_rating['gc_mu']

    # Get teammates on this startlist (same team, different rider)
    teammates = startlist[
        (startlist['team_name'] == team_name) &
        (startlist['rider_id'] != rider_id)
    ]['rider_id'].values

    if len(teammates) == 0:
        return {
            'n_stronger_teammates': 0,
            'is_startlist_leader': 1,
            'strongest_teammate_gap': 0.0,
            'team_gc_candidates': 1 if my_gc_mu >= GC_CANDIDATE_THRESHOLD else 0,
            'team_avg_gc_mu': my_gc_mu,
        }

    # Get teammate ratings
    teammate_mus = []
    for tid in teammates:
        t_rating = rating_lookup.get(tid, {'gc_mu': DEFAULT_GC_MU})
        teammate_mus.append(t_rating['gc_mu'])

    # Count teammates stronger than me
    n_stronger = sum(1 for mu in teammate_mus if mu > my_gc_mu)

    # Am I the leader?
    is_leader = 1 if n_stronger == 0 else 0

    # Gap to strongest teammate (positive = I'm stronger)
    strongest_teammate = max(teammate_mus)
    gap = my_gc_mu - strongest_teammate

    # GC candidates on the team (including me)
    all_team_mus = [my_gc_mu] + teammate_mus
    gc_candidates = sum(1 for mu in all_team_mus if mu >= GC_CANDIDATE_THRESHOLD)

    # Team average
    team_avg = np.mean(all_team_mus)

    return {
        'n_stronger_teammates': n_stronger,
        'is_startlist_leader': is_leader,
        'strongest_teammate_gap': gap,
        'team_gc_candidates': gc_candidates,
        'team_avg_gc_mu': team_avg,
    }


def compute_all_startlist_features(
    startlist: pd.DataFrame,
    rating_lookup: dict,
) -> dict:
    """Compute startlist-aware features for ALL riders on a startlist.

    Args:
        startlist: Startlist DataFrame with rider_id, team_name columns.
        rating_lookup: Dict mapping rider_id → {'gc_mu', ...}.

    Returns:
        Dict mapping rider_id → feature dict.
    """
    result = {}
    for _, row in startlist.iterrows():
        rider_id = row['rider_id']
        team_name = row.get('team_name', '') or 'unknown'
        result[rider_id] = compute_startlist_team_features(
            rider_id, team_name, startlist, rating_lookup,
        )
    return result
