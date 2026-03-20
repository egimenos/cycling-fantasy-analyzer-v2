"""Tests for feature extraction module."""

import numpy as np
import pandas as pd
import pytest

from src.features import FEATURE_COLS, _compute_rider_features
from src.points import get_points


class TestFeatureCols:
    """Verify the canonical feature column list."""

    def test_feature_cols_count(self):
        """FEATURE_COLS must have exactly 40 features (25 V2 + 6 micro-form + 4 age + 5 team)."""
        assert len(FEATURE_COLS) == 40

    def test_feature_cols_names(self):
        """All expected feature names must be present."""
        expected_v2 = [
            'pts_gc_12m', 'pts_stage_12m', 'pts_mountain_12m', 'pts_sprint_12m',
            'pts_total_12m', 'pts_total_6m', 'pts_total_3m',
            'pts_same_type_12m', 'race_count_12m', 'race_count_6m',
            'top10_rate', 'top5_rate', 'win_rate', 'podium_rate',
            'best_race_pts_12m', 'median_race_pts_12m',
            'days_since_last', 'same_race_best', 'same_race_mean', 'same_race_editions',
            'pts_total_alltime', 'race_type_enc', 'pts_trend_3m',
            'stage_pts_12m', 'gc_pts_same_type',
        ]
        expected_micro = [
            'pts_30d', 'pts_14d', 'race_count_30d',
            'last_race_pts', 'last_3_mean_pts', 'last_3_max_pts',
        ]
        expected_age = ['age', 'is_young', 'is_veteran', 'pts_per_career_year']
        expected_team = ['team_rank', 'is_leader', 'team_size', 'pct_of_team', 'team_total_pts']

        all_expected = expected_v2 + expected_micro + expected_age + expected_team
        for name in all_expected:
            assert name in FEATURE_COLS, f"Missing feature: {name}"

    def test_no_duplicates(self):
        """Feature names must be unique."""
        assert len(FEATURE_COLS) == len(set(FEATURE_COLS))


class TestGetPoints:
    """Verify position-to-points mapping for each category."""

    def test_stage_win(self):
        assert get_points('stage', 1, 'grand_tour') == 40.0

    def test_stage_20th(self):
        assert get_points('stage', 20, 'grand_tour') == 1.0

    def test_stage_outside_range(self):
        assert get_points('stage', 21, 'grand_tour') == 0.0

    def test_gc_classic_win(self):
        assert get_points('gc', 1, 'classic') == 200.0

    def test_gc_grand_tour_win(self):
        assert get_points('gc', 1, 'grand_tour') == 150.0

    def test_gc_mini_tour_win(self):
        assert get_points('gc', 1, 'mini_tour') == 100.0

    def test_mountain_grand_tour_win(self):
        assert get_points('mountain', 1, 'grand_tour') == 50.0

    def test_mountain_classic_zero(self):
        assert get_points('mountain', 1, 'classic') == 0.0

    def test_sprint_mini_tour_win(self):
        assert get_points('sprint', 1, 'mini_tour') == 40.0

    def test_none_position(self):
        assert get_points('gc', None, 'grand_tour') == 0.0

    def test_nan_position(self):
        assert get_points('gc', float('nan'), 'grand_tour') == 0.0

    def test_negative_position(self):
        assert get_points('gc', -1, 'grand_tour') == 0.0


class TestZeroHistoryRider:
    """A rider with no historical results should get a valid feature vector with defaults."""

    def test_zero_history_produces_valid_features(self):
        race_date = pd.Timestamp('2026-03-15')
        race_date_py = race_date.date()

        # Empty history DataFrame with expected columns
        hist = pd.DataFrame(columns=[
            'rider_id', 'race_date', 'category', 'pts',
            'race_slug', 'year', 'race_type', 'position',
            'rider_birth_date',
        ])
        # Empty results_df (rider not found -> defaults for age)
        results_df = pd.DataFrame(columns=[
            'rider_id', 'rider_birth_date',
        ])

        d365 = race_date - pd.Timedelta(days=365)
        d180 = race_date - pd.Timedelta(days=180)
        d90 = race_date - pd.Timedelta(days=90)
        d30 = race_date - pd.Timedelta(days=30)
        d14 = race_date - pd.Timedelta(days=14)

        feats = _compute_rider_features(
            rider_id='rider-new',
            hist=hist,
            results_df=results_df,
            race_slug='tour-de-france',
            race_type='grand_tour',
            race_date=race_date,
            race_date_py=race_date_py,
            d365=d365, d180=d180, d90=d90, d30=d30, d14=d14,
            rider_team_info={},
        )

        # All FEATURE_COLS must be present
        for col in FEATURE_COLS:
            assert col in feats, f"Missing feature key: {col}"

        # Points features should be zero
        assert feats['pts_total_12m'] == 0.0
        assert feats['pts_gc_12m'] == 0.0
        assert feats['race_count_12m'] == 0

        # Days since last should default to 365
        assert feats['days_since_last'] == 365

        # Age should default to 28.0 (median)
        assert feats['age'] == 28.0
        assert feats['is_young'] == 0
        assert feats['is_veteran'] == 0

        # Team defaults
        assert feats['team_rank'] == 4
        assert feats['is_leader'] == 0
