"""Tests for ml/src/points.py — 100% coverage on scoring logic.

Covers all scoring tables, get_points() routing for every category,
backward compatibility, and edge cases (None, NaN, position < 1,
unknown category).
"""

import math

import numpy as np
import pandas as pd
import pytest

from src.points import (
    FINAL_CLASS_GT,
    FINAL_CLASS_MINI,
    GC_CLASSIC,
    GC_DAILY,
    GC_GRAND_TOUR,
    GC_MINI_TOUR,
    MOUNTAIN_PASS_CAT1,
    MOUNTAIN_PASS_CAT2,
    MOUNTAIN_PASS_CAT3,
    MOUNTAIN_PASS_CAT4,
    MOUNTAIN_PASS_HC,
    REGULARIDAD_DAILY,
    SPRINT_INTERMEDIATE_MULTI,
    SPRINT_INTERMEDIATE_SINGLE,
    STAGE_POINTS,
    get_points,
)
from src.data import get_sprint_count_per_stage


# ── T018: Table value sanity checks ─────────────────────────────────


class TestGcDaily:
    """GC_DAILY: positions 1-10 score, 11+ returns 0."""

    @pytest.mark.parametrize("pos, expected", [
        (1, 15), (2, 10), (3, 8), (4, 7), (5, 6),
        (6, 5), (7, 4), (8, 3), (9, 2), (10, 1),
    ])
    def test_scored_positions(self, pos, expected):
        assert GC_DAILY[pos] == expected

    def test_position_11_not_scored(self):
        assert GC_DAILY.get(11, 0) == 0


class TestMountainPassHC:
    """MOUNTAIN_PASS_HC: positions 1-8 score, 9+ returns 0."""

    @pytest.mark.parametrize("pos, expected", [
        (1, 12), (2, 8), (3, 6), (4, 5), (5, 4), (6, 3), (7, 2), (8, 1),
    ])
    def test_scored_positions(self, pos, expected):
        assert MOUNTAIN_PASS_HC[pos] == expected

    def test_position_9_not_scored(self):
        assert MOUNTAIN_PASS_HC.get(9, 0) == 0


class TestMountainPassCat1:
    """MOUNTAIN_PASS_CAT1: positions 1-5 score, 6+ returns 0."""

    @pytest.mark.parametrize("pos, expected", [
        (1, 8), (2, 6), (3, 4), (4, 2), (5, 1),
    ])
    def test_scored_positions(self, pos, expected):
        assert MOUNTAIN_PASS_CAT1[pos] == expected

    def test_position_6_not_scored(self):
        assert MOUNTAIN_PASS_CAT1.get(6, 0) == 0


class TestMountainPassCat2:
    """MOUNTAIN_PASS_CAT2: positions 1-3 score, 4+ returns 0."""

    @pytest.mark.parametrize("pos, expected", [
        (1, 5), (2, 3), (3, 1),
    ])
    def test_scored_positions(self, pos, expected):
        assert MOUNTAIN_PASS_CAT2[pos] == expected

    def test_position_4_not_scored(self):
        assert MOUNTAIN_PASS_CAT2.get(4, 0) == 0


class TestMountainPassCat3:
    """MOUNTAIN_PASS_CAT3: positions 1-2 score, 3+ returns 0."""

    @pytest.mark.parametrize("pos, expected", [
        (1, 3), (2, 2),
    ])
    def test_scored_positions(self, pos, expected):
        assert MOUNTAIN_PASS_CAT3[pos] == expected

    def test_position_3_not_scored(self):
        assert MOUNTAIN_PASS_CAT3.get(3, 0) == 0


class TestMountainPassCat4:
    """MOUNTAIN_PASS_CAT4: only position 1 scores, 2+ returns 0."""

    def test_position_1(self):
        assert MOUNTAIN_PASS_CAT4[1] == 1

    def test_position_2_not_scored(self):
        assert MOUNTAIN_PASS_CAT4.get(2, 0) == 0


class TestSprintIntermediateSingle:
    """SPRINT_INTERMEDIATE_SINGLE: positions 1-3 score, 4+ returns 0."""

    @pytest.mark.parametrize("pos, expected", [(1, 6), (2, 4), (3, 2)])
    def test_scored_positions(self, pos, expected):
        assert SPRINT_INTERMEDIATE_SINGLE[pos] == expected

    def test_position_4_not_scored(self):
        assert SPRINT_INTERMEDIATE_SINGLE.get(4, 0) == 0


class TestSprintIntermediateMulti:
    """SPRINT_INTERMEDIATE_MULTI: positions 1-3 score, 4+ returns 0."""

    @pytest.mark.parametrize("pos, expected", [(1, 3), (2, 2), (3, 1)])
    def test_scored_positions(self, pos, expected):
        assert SPRINT_INTERMEDIATE_MULTI[pos] == expected

    def test_position_4_not_scored(self):
        assert SPRINT_INTERMEDIATE_MULTI.get(4, 0) == 0


class TestRegularidadDaily:
    """REGULARIDAD_DAILY: positions 1-3 score, 4+ returns 0."""

    @pytest.mark.parametrize("pos, expected", [(1, 6), (2, 4), (3, 2)])
    def test_scored_positions(self, pos, expected):
        assert REGULARIDAD_DAILY[pos] == expected

    def test_position_4_not_scored(self):
        assert REGULARIDAD_DAILY.get(4, 0) == 0


# ── T018: get_points() routing ───────────────────────────────────────


class TestGetPointsGcDaily:
    """get_points routing for gc_daily category."""

    def test_position_1(self):
        assert get_points('gc_daily', 1, 'grand_tour') == 15.0

    def test_position_10(self):
        assert get_points('gc_daily', 10, 'mini_tour') == 1.0

    def test_position_11_zero(self):
        assert get_points('gc_daily', 11, 'grand_tour') == 0.0


class TestGetPointsMountainPass:
    """get_points routing for mountain_pass category."""

    @pytest.mark.parametrize("climb_cat, pos, expected", [
        ('HC', 1, 12.0),
        ('HC', 8, 1.0),
        ('HC', 9, 0.0),
        ('1', 1, 8.0),
        ('1', 5, 1.0),
        ('1', 6, 0.0),
        ('2', 1, 5.0),
        ('2', 3, 1.0),
        ('2', 4, 0.0),
        ('3', 1, 3.0),
        ('3', 2, 2.0),
        ('3', 3, 0.0),
        ('4', 1, 1.0),
        ('4', 2, 0.0),
    ])
    def test_all_categories_and_boundaries(self, climb_cat, pos, expected):
        assert get_points('mountain_pass', pos, 'grand_tour', climb_category=climb_cat) == expected

    def test_none_climb_category_returns_zero(self):
        assert get_points('mountain_pass', 1, 'grand_tour', climb_category=None) == 0.0

    def test_unknown_climb_category_returns_zero(self):
        assert get_points('mountain_pass', 1, 'grand_tour', climb_category='X') == 0.0


class TestGetPointsSprintIntermediate:
    """get_points routing for sprint_intermediate category."""

    def test_single_sprint_pos1(self):
        assert get_points('sprint_intermediate', 1, 'grand_tour', sprint_count=1) == 6.0

    def test_single_sprint_pos3(self):
        assert get_points('sprint_intermediate', 3, 'grand_tour', sprint_count=1) == 2.0

    def test_single_sprint_pos4_zero(self):
        assert get_points('sprint_intermediate', 4, 'grand_tour', sprint_count=1) == 0.0

    def test_multi_sprint_pos1(self):
        assert get_points('sprint_intermediate', 1, 'grand_tour', sprint_count=2) == 3.0

    def test_multi_sprint_pos3(self):
        assert get_points('sprint_intermediate', 3, 'grand_tour', sprint_count=2) == 1.0

    def test_multi_sprint_pos4_zero(self):
        assert get_points('sprint_intermediate', 4, 'grand_tour', sprint_count=2) == 0.0

    def test_default_sprint_count_uses_single(self):
        """When sprint_count is not passed, default=1 uses single table."""
        assert get_points('sprint_intermediate', 1, 'grand_tour') == 6.0

    def test_sprint_count_3_uses_multi(self):
        """sprint_count >= 2 always uses multi table."""
        assert get_points('sprint_intermediate', 1, 'grand_tour', sprint_count=3) == 3.0


class TestGetPointsRegularidadDaily:
    """get_points routing for regularidad_daily category."""

    def test_position_1(self):
        assert get_points('regularidad_daily', 1, 'grand_tour') == 6.0

    def test_position_3(self):
        assert get_points('regularidad_daily', 3, 'mini_tour') == 2.0

    def test_position_4_zero(self):
        assert get_points('regularidad_daily', 4, 'grand_tour') == 0.0


# ── T018: Backward compatibility ─────────────────────────────────────


class TestBackwardCompatibility:
    """Existing categories must return the same values after the changes."""

    def test_stage_pos1(self):
        assert get_points('stage', 1, 'grand_tour') == 40.0

    def test_stage_pos20(self):
        assert get_points('stage', 20, 'mini_tour') == 1.0

    def test_stage_pos21_zero(self):
        assert get_points('stage', 21, 'grand_tour') == 0.0

    def test_gc_classic(self):
        assert get_points('gc', 1, 'classic') == 200.0

    def test_gc_mini_tour(self):
        assert get_points('gc', 1, 'mini_tour') == 100.0

    def test_gc_grand_tour(self):
        assert get_points('gc', 1, 'grand_tour') == 150.0

    def test_gc_unknown_race_type(self):
        assert get_points('gc', 1, 'unknown') == 0.0

    def test_mountain_classic_zero(self):
        assert get_points('mountain', 1, 'classic') == 0.0

    def test_mountain_grand_tour(self):
        assert get_points('mountain', 1, 'grand_tour') == 50.0

    def test_mountain_mini_tour(self):
        assert get_points('mountain', 1, 'mini_tour') == 40.0

    def test_sprint_classic_zero(self):
        assert get_points('sprint', 1, 'classic') == 0.0

    def test_sprint_grand_tour(self):
        assert get_points('sprint', 1, 'grand_tour') == 50.0

    def test_sprint_mini_tour(self):
        assert get_points('sprint', 1, 'mini_tour') == 40.0


# ── T018: Edge cases ─────────────────────────────────────────────────


class TestEdgeCases:
    """Edge cases: None, NaN, position < 1, unknown category."""

    def test_none_position(self):
        assert get_points('stage', None, 'grand_tour') == 0.0

    def test_nan_position(self):
        assert get_points('stage', float('nan'), 'grand_tour') == 0.0

    def test_numpy_nan_position(self):
        assert get_points('stage', np.nan, 'grand_tour') == 0.0

    def test_position_zero(self):
        assert get_points('stage', 0, 'grand_tour') == 0.0

    def test_position_negative(self):
        assert get_points('stage', -1, 'grand_tour') == 0.0

    def test_unknown_category(self):
        assert get_points('nonexistent', 1, 'grand_tour') == 0.0

    def test_float_position_is_truncated(self):
        """A float position like 2.7 should be treated as int 2."""
        assert get_points('stage', 2.7, 'grand_tour') == 25.0

    def test_new_category_with_none_position(self):
        assert get_points('gc_daily', None, 'grand_tour') == 0.0

    def test_mountain_pass_with_nan(self):
        assert get_points('mountain_pass', np.nan, 'grand_tour', climb_category='HC') == 0.0

    def test_sprint_intermediate_with_negative(self):
        assert get_points('sprint_intermediate', -5, 'grand_tour', sprint_count=1) == 0.0

    def test_regularidad_daily_with_none(self):
        assert get_points('regularidad_daily', None, 'grand_tour') == 0.0


# ── T017: Sprint count helper ────────────────────────────────────────


class TestGetSprintCountPerStage:
    """Tests for the get_sprint_count_per_stage helper in data.py."""

    def test_single_sprint_stage(self):
        df = pd.DataFrame({
            'category': ['sprint_intermediate', 'sprint_intermediate', 'sprint_intermediate'],
            'race_slug': ['tdf', 'tdf', 'tdf'],
            'year': [2024, 2024, 2024],
            'stage_number': [5, 5, 5],
            'sprint_name': ['Sprint A', 'Sprint A', 'Sprint A'],
        })
        result = get_sprint_count_per_stage(df)
        assert result[('tdf', 2024, 5)] == 1

    def test_multi_sprint_stage(self):
        df = pd.DataFrame({
            'category': ['sprint_intermediate'] * 6,
            'race_slug': ['tdf'] * 6,
            'year': [2024] * 6,
            'stage_number': [5] * 6,
            'sprint_name': ['Sprint A', 'Sprint A', 'Sprint A',
                            'Sprint B', 'Sprint B', 'Sprint B'],
        })
        result = get_sprint_count_per_stage(df)
        assert result[('tdf', 2024, 5)] == 2

    def test_no_sprint_rows(self):
        df = pd.DataFrame({
            'category': ['stage', 'gc'],
            'race_slug': ['tdf', 'tdf'],
            'year': [2024, 2024],
            'stage_number': [1, 1],
            'sprint_name': [None, None],
        })
        result = get_sprint_count_per_stage(df)
        assert result == {}

    def test_mixed_stages(self):
        """Different stages with different sprint counts."""
        df = pd.DataFrame({
            'category': ['sprint_intermediate'] * 5 + ['stage'],
            'race_slug': ['tdf'] * 6,
            'year': [2024] * 6,
            'stage_number': [1, 1, 1, 2, 2, 3],
            'sprint_name': ['S1', 'S1', 'S2', 'S3', 'S3', None],
        })
        result = get_sprint_count_per_stage(df)
        assert result[('tdf', 2024, 1)] == 2  # S1 and S2
        assert result[('tdf', 2024, 2)] == 1  # only S3
        assert ('tdf', 2024, 3) not in result  # stage category, not sprint

    def test_empty_dataframe(self):
        df = pd.DataFrame({
            'category': pd.Series([], dtype=str),
            'race_slug': pd.Series([], dtype=str),
            'year': pd.Series([], dtype=int),
            'stage_number': pd.Series([], dtype=int),
            'sprint_name': pd.Series([], dtype=str),
        })
        result = get_sprint_count_per_stage(df)
        assert result == {}
