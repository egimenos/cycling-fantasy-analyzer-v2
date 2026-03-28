"""
Position-points mapping tables.

Maps (category, position, race_type) -> points.
Ported from research_v3.py lines 24-51.
"""

import numpy as np

# ── Position points tables ───────────────────────────────────────────

STAGE_POINTS = {
    1: 40, 2: 25, 3: 22, 4: 19, 5: 17, 6: 15, 7: 14, 8: 13, 9: 12, 10: 11,
    11: 10, 12: 9, 13: 8, 14: 7, 15: 6, 16: 5, 17: 4, 18: 3, 19: 2, 20: 1,
}

GC_CLASSIC = {1: 200, 2: 125, 3: 100, 4: 80, 5: 60, 6: 50, 7: 45, 8: 40, 9: 35, 10: 30}

GC_MINI_TOUR = {
    1: 100, 2: 80, 3: 65, 4: 55, 5: 45, 6: 40, 7: 35, 8: 30, 9: 25, 10: 20,
    11: 18, 12: 16, 13: 14, 14: 12, 15: 10,
}

GC_GRAND_TOUR = {
    1: 150, 2: 125, 3: 100, 4: 80, 5: 60, 6: 50, 7: 45, 8: 40, 9: 35, 10: 30,
    11: 28, 12: 26, 13: 24, 14: 22, 15: 20, 16: 18, 17: 16, 18: 14, 19: 12, 20: 10,
}

FINAL_CLASS_MINI = {1: 40, 2: 25, 3: 15}
FINAL_CLASS_GT = {1: 50, 2: 35, 3: 25, 4: 15, 5: 10}

GC_DAILY = {
    1: 15, 2: 10, 3: 8, 4: 7, 5: 6,
    6: 5, 7: 4, 8: 3, 9: 2, 10: 1,
}

MOUNTAIN_PASS_HC = {1: 12, 2: 8, 3: 6, 4: 5, 5: 4, 6: 3, 7: 2, 8: 1}
MOUNTAIN_PASS_CAT1 = {1: 8, 2: 6, 3: 4, 4: 2, 5: 1}
MOUNTAIN_PASS_CAT2 = {1: 5, 2: 3, 3: 1}
MOUNTAIN_PASS_CAT3 = {1: 3, 2: 2}
MOUNTAIN_PASS_CAT4 = {1: 1}

SPRINT_INTERMEDIATE_SINGLE = {1: 6, 2: 4, 3: 2}
SPRINT_INTERMEDIATE_MULTI = {1: 3, 2: 2, 3: 1}

REGULARIDAD_DAILY = {1: 6, 2: 4, 3: 2}


def get_points(
    category: str,
    position,
    race_type: str,
    climb_category: str | None = None,
    sprint_count: int = 1,
) -> float:
    """Return points for a given (category, position, race_type) combination.

    Args:
        category: One of 'stage', 'gc', 'mountain', 'sprint', 'gc_daily',
            'mountain_pass', 'sprint_intermediate', 'regularidad_daily'.
        position: Finishing position (int or float). None/NaN/< 1 returns 0.
        race_type: One of 'classic', 'mini_tour', 'grand_tour'.
        climb_category: For mountain_pass, one of 'HC', '1', '2', '3', '4'.
        sprint_count: Number of intermediate sprints in the stage (>=2 uses
            reduced multi-sprint table).

    Returns:
        Points as a float.
    """
    if position is None or (isinstance(position, float) and np.isnan(position)) or position < 1:
        return 0.0
    position = int(position)

    if category == 'stage':
        return float(STAGE_POINTS.get(position, 0))

    if category == 'gc':
        tbl = {'classic': GC_CLASSIC, 'mini_tour': GC_MINI_TOUR, 'grand_tour': GC_GRAND_TOUR}
        return float(tbl.get(race_type, {}).get(position, 0))

    if category in ('mountain', 'sprint'):
        if race_type == 'classic':
            return 0.0
        tbl = FINAL_CLASS_GT if race_type == 'grand_tour' else FINAL_CLASS_MINI
        return float(tbl.get(position, 0))

    if category == 'gc_daily':
        return float(GC_DAILY.get(position, 0))

    if category == 'mountain_pass':
        tbl = {
            'HC': MOUNTAIN_PASS_HC,
            '1': MOUNTAIN_PASS_CAT1,
            '2': MOUNTAIN_PASS_CAT2,
            '3': MOUNTAIN_PASS_CAT3,
            '4': MOUNTAIN_PASS_CAT4,
        }
        return float(tbl.get(climb_category or '', {}).get(position, 0))

    if category == 'sprint_intermediate':
        tbl = SPRINT_INTERMEDIATE_SINGLE if sprint_count <= 1 else SPRINT_INTERMEDIATE_MULTI
        return float(tbl.get(position, 0))

    if category == 'regularidad_daily':
        return float(REGULARIDAD_DAILY.get(position, 0))

    return 0.0


# ── Ordinal bucket definitions (E07) ─────────────────────────────────
# Predict position buckets via classification, then convert to expected
# fantasy points using the scoring tables above.

def gc_position_to_bucket(position) -> int:
    """Map a GC final position to a bucket index (0-5).

    Buckets are designed around the scoring table breakpoints.
    NaN/None/DNF → bucket 5 (0 points).
    """
    if position is None or (isinstance(position, float) and np.isnan(position)):
        return 5
    p = int(position)
    if p == 1:
        return 0
    if p <= 3:
        return 1
    if p <= 5:
        return 2
    if p <= 10:
        return 3
    if p <= 20:
        return 4
    return 5


GC_BUCKET_LABELS = ['1st', '2nd-3rd', '4th-5th', '6th-10th', '11th-20th', '21st+']
N_GC_BUCKETS = 6

_GC_BUCKET_EXPECTED = {
    'grand_tour': [
        150.0,                                              # bucket 0: pos 1
        (125 + 100) / 2,                                    # bucket 1: pos 2-3
        (80 + 60) / 2,                                      # bucket 2: pos 4-5
        sum(GC_GRAND_TOUR[p] for p in range(6, 11)) / 5,   # bucket 3: pos 6-10
        sum(GC_GRAND_TOUR[p] for p in range(11, 21)) / 10, # bucket 4: pos 11-20
        0.0,                                                # bucket 5: pos 21+
    ],
    'mini_tour': [
        100.0,
        (80 + 65) / 2,
        (55 + 45) / 2,
        sum(GC_MINI_TOUR[p] for p in range(6, 11)) / 5,
        sum(GC_MINI_TOUR[p] for p in range(11, 16)) / 5,
        0.0,
    ],
}


def gc_bucket_expected_pts(race_type: str) -> list[float]:
    """Expected fantasy points per GC bucket for a race type."""
    return _GC_BUCKET_EXPECTED.get(race_type, _GC_BUCKET_EXPECTED['mini_tour'])


def classification_position_to_bucket(position, race_type: str) -> int:
    """Map a mountain/sprint final classification position to a bucket.

    GT: 4 buckets (1, 2-3, 4-5, 6+)
    Mini: 3 buckets (1, 2-3, 4+)
    """
    if position is None or (isinstance(position, float) and np.isnan(position)):
        return 3 if race_type == 'grand_tour' else 2
    p = int(position)
    if p == 1:
        return 0
    if p <= 3:
        return 1
    if race_type == 'grand_tour' and p <= 5:
        return 2
    return 3 if race_type == 'grand_tour' else 2


_CLASS_BUCKET_EXPECTED = {
    'grand_tour': [
        50.0,                   # bucket 0: pos 1
        (35 + 25) / 2,         # bucket 1: pos 2-3
        (15 + 10) / 2,         # bucket 2: pos 4-5
        0.0,                   # bucket 3: pos 6+
    ],
    'mini_tour': [
        40.0,                  # bucket 0: pos 1
        (25 + 15) / 2,        # bucket 1: pos 2-3
        0.0,                  # bucket 2: pos 4+
    ],
}


def classification_bucket_expected_pts(race_type: str) -> list[float]:
    """Expected pts per mountain/sprint classification bucket."""
    return _CLASS_BUCKET_EXPECTED.get(race_type, _CLASS_BUCKET_EXPECTED['mini_tour'])


def n_classification_buckets(race_type: str) -> int:
    """Number of buckets for mountain/sprint classification."""
    return 4 if race_type == 'grand_tour' else 3


def compute_expected_pts(probabilities, expected_per_bucket: list[float]) -> float:
    """Dot product of bucket probabilities × expected points per bucket."""
    return float(np.dot(probabilities[:len(expected_per_bucket)], expected_per_bucket))
