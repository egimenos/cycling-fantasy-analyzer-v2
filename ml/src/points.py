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


def get_points(category: str, position, race_type: str) -> float:
    """Return points for a given (category, position, race_type) combination.

    Args:
        category: One of 'stage', 'gc', 'mountain', 'sprint'.
        position: Finishing position (int or float). None/NaN/< 1 returns 0.
        race_type: One of 'classic', 'mini_tour', 'grand_tour'.

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

    return 0.0
