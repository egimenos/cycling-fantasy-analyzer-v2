"""Tests for features_classics.py — feature extraction with synthetic data."""

import numpy as np
import pandas as pd
import pytest

from src.features.classics import TIER1_FEATURE_COLS, compute_classic_features
from src.domain.points import GC_CLASSIC


def _make_result(rider_id, slug, year, position, race_date, race_type="classic",
                 category="gc", race_class="UWT", birth_date=None, rider_name="Test"):
    pts = float(GC_CLASSIC.get(position, 0)) if race_type == "classic" and category == "gc" else 0.0
    return {
        "rider_id": rider_id, "race_slug": slug, "year": year,
        "position": position, "race_date": pd.Timestamp(race_date),
        "race_type": race_type, "category": category, "race_class": race_class,
        "dnf": False, "pts": pts, "rider_birth_date": birth_date,
        "rider_name": rider_name, "birth_date": birth_date,
    }


class TestSameRaceHistory:
    def test_rider_with_3_editions(self):
        results = pd.DataFrame([
            _make_result("r1", "ronde-van-vlaanderen", 2021, 3, "2021-04-04"),
            _make_result("r1", "ronde-van-vlaanderen", 2022, 1, "2022-04-03"),
            _make_result("r1", "ronde-van-vlaanderen", 2023, 5, "2023-04-02"),
        ])
        feats = compute_classic_features(
            rider_id="r1", race_slug="ronde-van-vlaanderen",
            race_date=pd.Timestamp("2024-04-07"),
            rider_history=results, all_classic_results=results,
        )
        assert feats["same_race_count"] == 3
        assert feats["same_race_best"] == 200.0  # Position 1 = 200 pts
        assert feats["has_same_race"] == 1
        assert feats["same_race_best_pos"] == 1.0

    def test_rider_with_no_history(self):
        feats = compute_classic_features(
            rider_id="r2", race_slug="paris-roubaix",
            race_date=pd.Timestamp("2024-04-14"),
            rider_history=pd.DataFrame(), all_classic_results=pd.DataFrame(),
        )
        assert feats["same_race_count"] == 0
        assert feats["has_same_race"] == 0
        assert feats["same_race_best"] == 0.0
        assert feats["pts_classic_12m"] == 0.0


class TestNoFutureLeakage:
    def test_future_results_excluded(self):
        results = pd.DataFrame([
            _make_result("r1", "ronde-van-vlaanderen", 2023, 1, "2023-04-02"),
            _make_result("r1", "ronde-van-vlaanderen", 2024, 2, "2024-04-07"),
        ])
        # race_date = 2024-04-07 means we should only see 2023 edition
        feats = compute_classic_features(
            rider_id="r1", race_slug="ronde-van-vlaanderen",
            race_date=pd.Timestamp("2024-04-07"),
            rider_history=results[results["race_date"] < pd.Timestamp("2024-04-07")],
            all_classic_results=results[results["race_date"] < pd.Timestamp("2024-04-07")],
        )
        assert feats["same_race_count"] == 1


class TestClassicPointsAggregation:
    def test_points_windows(self):
        results = pd.DataFrame([
            _make_result("r1", "strade-bianche", 2023, 2, "2023-03-04"),
            _make_result("r1", "ronde-van-vlaanderen", 2023, 5, "2023-04-02"),
            _make_result("r1", "liege-bastogne-liege", 2023, 10, "2023-04-23"),
        ])
        feats = compute_classic_features(
            rider_id="r1", race_slug="il-lombardia",
            race_date=pd.Timestamp("2023-10-07"),
            rider_history=results, all_classic_results=results,
        )
        # All 3 results within 12m
        expected_12m = 125.0 + 60.0 + 30.0  # pos 2 + pos 5 + pos 10
        assert feats["pts_classic_12m"] == expected_12m
        assert feats["classic_top10_rate"] > 0

    def test_zero_points_when_no_classics(self):
        # Rider with only stage race results
        results = pd.DataFrame([
            _make_result("r1", "tour-de-france", 2023, 1, "2023-07-01",
                         race_type="grand_tour", category="stage"),
        ])
        feats = compute_classic_features(
            rider_id="r1", race_slug="il-lombardia",
            race_date=pd.Timestamp("2023-10-07"),
            rider_history=results, all_classic_results=pd.DataFrame(),
        )
        assert feats["pts_classic_12m"] == 0.0
        assert feats["classic_top10_rate"] == 0.0


class TestGeneralFeatures:
    def test_age_computed(self):
        results = pd.DataFrame([
            _make_result("r1", "strade-bianche", 2023, 1, "2023-03-04",
                         birth_date=pd.Timestamp("1995-01-15")),
        ])
        feats = compute_classic_features(
            rider_id="r1", race_slug="ronde-van-vlaanderen",
            race_date=pd.Timestamp("2024-04-07"),
            rider_history=results, all_classic_results=results,
        )
        assert 29 < feats["age"] < 30  # Born 1995, race 2024

    def test_missing_birth_date(self):
        results = pd.DataFrame([
            _make_result("r1", "strade-bianche", 2023, 1, "2023-03-04"),
        ])
        feats = compute_classic_features(
            rider_id="r1", race_slug="ronde-van-vlaanderen",
            race_date=pd.Timestamp("2024-04-07"),
            rider_history=results, all_classic_results=results,
        )
        assert np.isnan(feats["age"])

    def test_micro_form(self):
        results = pd.DataFrame([
            _make_result("r1", "e3-harelbeke", 2024, 3, "2024-03-22"),
            _make_result("r1", "gent-wevelgem", 2024, 1, "2024-03-27"),
        ])
        feats = compute_classic_features(
            rider_id="r1", race_slug="ronde-van-vlaanderen",
            race_date=pd.Timestamp("2024-04-07"),
            rider_history=results, all_classic_results=results,
        )
        assert feats["pts_30d"] > 0
        assert feats["pts_14d"] > 0


class TestFeatureColumnsPresent:
    def test_all_tier1_columns_present(self):
        results = pd.DataFrame([
            _make_result("r1", "ronde-van-vlaanderen", 2023, 1, "2023-04-02"),
        ])
        feats = compute_classic_features(
            rider_id="r1", race_slug="ronde-van-vlaanderen",
            race_date=pd.Timestamp("2024-04-07"),
            rider_history=results, all_classic_results=results,
        )
        for col in TIER1_FEATURE_COLS:
            assert col in feats, f"Missing feature column: {col}"
