"""
Data loading module.

Loads race_results, riders, and startlist_entries from the database
into pandas DataFrames. Pre-computes the `pts` column via get_points().
SQL queries match research_v3.py lines 57-87.
"""

from __future__ import annotations

from typing import Optional, Tuple

import pandas as pd
import psycopg2

from .points import get_points


def get_sprint_count_per_stage(df: pd.DataFrame) -> dict[tuple[str, int, int], int]:
    """Return the number of distinct intermediate sprints per stage.

    Counts unique ``sprint_name`` values among ``sprint_intermediate`` rows
    grouped by (race_slug, year, stage_number).  Stages without sprints are
    simply absent from the returned dict, so callers should default to 1.

    Args:
        df: DataFrame with at least columns ``category``, ``race_slug``,
            ``year``, ``stage_number``, and ``sprint_name``.

    Returns:
        Mapping from ``(race_slug, year, stage_number)`` to the number of
        distinct sprints on that stage.
    """
    sprint_rows = df[df['category'] == 'sprint_intermediate']
    if sprint_rows.empty:
        return {}
    counts = sprint_rows.groupby(
        ['race_slug', 'year', 'stage_number']
    )['sprint_name'].nunique()
    return counts.to_dict()


def load_data(db_url: str) -> Tuple[pd.DataFrame, pd.DataFrame]:
    """Load race results and startlist entries from the database.

    Args:
        db_url: PostgreSQL connection string.

    Returns:
        Tuple of (results_df, startlists_df). results_df includes a
        pre-computed `pts` column.
    """
    conn = psycopg2.connect(db_url)

    results_df = pd.read_sql("""
        SELECT rr.rider_id, rr.race_slug, rr.race_name, rr.race_type, rr.race_class,
               rr.year, rr.category, rr.position, rr.stage_number, rr.dnf,
               rr.race_date, rr.parcours_type, rr.is_itt, rr.is_ttt, rr.profile_score,
               rr.climb_category, rr.sprint_name,
               r.full_name as rider_name, r.birth_date as rider_birth_date,
               r.current_team as rider_team
        FROM race_results rr
        JOIN riders r ON rr.rider_id = r.id
        WHERE rr.race_date IS NOT NULL
        ORDER BY rr.race_date
    """, conn)

    startlists_df = pd.read_sql("""
        SELECT se.race_slug, se.year, se.rider_id, se.team_name
        FROM startlist_entries se
    """, conn)

    conn.close()

    # Pre-compute sprint counts per stage (for multi-sprint reduced scoring)
    sprint_counts = get_sprint_count_per_stage(results_df)

    # Pre-compute points
    def _compute_pts(row):
        sc = sprint_counts.get(
            (row['race_slug'], row['year'], row['stage_number']), 1
        )
        return get_points(
            row['category'],
            row['position'],
            row['race_type'],
            climb_category=row.get('climb_category'),
            sprint_count=sc,
        )

    results_df['pts'] = results_df.apply(_compute_pts, axis=1)

    birth_dates = results_df[['rider_id', 'rider_birth_date']].drop_duplicates()
    n_with_bd = birth_dates['rider_birth_date'].notna().sum()
    print(f"Loaded {len(results_df):,} results, {len(startlists_df):,} startlist entries")
    print(f"Riders with birth_date: {n_with_bd}/{len(birth_dates)}")

    return results_df, startlists_df


def load_startlist_for_race(
    db_url: str, race_slug: str, year: int
) -> pd.DataFrame:
    """Load startlist entries for a specific race.

    Args:
        db_url: PostgreSQL connection string.
        race_slug: The race identifier (e.g. 'tour-de-france').
        year: Race year.

    Returns:
        DataFrame with columns: race_slug, year, rider_id, team_name.
    """
    conn = psycopg2.connect(db_url)

    startlist_df = pd.read_sql("""
        SELECT se.race_slug, se.year, se.rider_id, se.team_name
        FROM startlist_entries se
        WHERE se.race_slug = %(race_slug)s AND se.year = %(year)s
    """, conn, params={'race_slug': race_slug, 'year': year})

    conn.close()
    return startlist_df


def get_race_info(
    db_url: str, race_slug: str, year: int
) -> Optional[dict]:
    """Get race_type and race_date for a specific race.

    Args:
        db_url: PostgreSQL connection string.
        race_slug: The race identifier.
        year: Race year.

    Returns:
        Dict with 'race_type' and 'race_date', or None if not found.
    """
    conn = psycopg2.connect(db_url)

    df = pd.read_sql("""
        SELECT DISTINCT rr.race_type, rr.race_date
        FROM race_results rr
        WHERE rr.race_slug = %(race_slug)s
          AND rr.year = %(year)s
          AND rr.race_date IS NOT NULL
        ORDER BY rr.race_date
        LIMIT 1
    """, conn, params={'race_slug': race_slug, 'year': year})

    conn.close()

    if len(df) == 0:
        return None

    return {
        'race_type': df.iloc[0]['race_type'],
        'race_date': df.iloc[0]['race_date'],
    }
