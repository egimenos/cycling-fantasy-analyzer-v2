"""Tests for classics prediction — post-prediction normalization."""

import json
import os
from unittest.mock import MagicMock, patch

import numpy as np
import pandas as pd
import pytest

from src.domain.points import GC_CLASSIC


TOTAL_POOL = sum(GC_CLASSIC.values())  # 765


def _make_results_df(rider_ids, race_slug="strade-bianche", year=2026):
    """Minimal results dataframe for prediction."""
    rows = []
    for rid in rider_ids:
        rows.append({
            "rider_id": rid,
            "rider_name": rid,
            "race_slug": race_slug,
            "year": year,
            "position": None,
            "race_date": pd.Timestamp("2026-03-08"),
            "race_type": "classic",
            "category": "gc",
            "race_class": "UWT",
            "dnf": False,
            "pts": 0.0,
            "rider_birth_date": pd.Timestamp("1995-01-01"),
            "birth_date": pd.Timestamp("1995-01-01"),
        })
    return pd.DataFrame(rows)


def _fake_metadata(feature_cols):
    return {
        "model_type": "lgbm",
        "transform": "sqrt",
        "feature_cols": feature_cols,
        "version": "test",
    }


class TestNormalization:
    """Verify that predictions are normalized to sum(GC_CLASSIC) = 765."""

    @patch("src.prediction.classics._load_model")
    @patch("src.prediction.classics.compute_classic_features")
    def test_predictions_sum_to_pool(self, mock_features, mock_load):
        from src.prediction.classics import predict_classic_race

        riders = [f"r{i}" for i in range(5)]
        # Model returns different raw magnitudes in sqrt-space
        raw_sqrt_preds = np.array([10.0, 8.0, 5.0, 3.0, 1.0])

        mock_model = MagicMock()
        mock_model.predict.return_value = raw_sqrt_preds
        feature_cols = ["feat_a", "feat_b"]
        mock_load.return_value = (mock_model, _fake_metadata(feature_cols))

        mock_features.side_effect = lambda **kw: {"feat_a": 1.0, "feat_b": 2.0}

        results_df = _make_results_df(riders)
        preds = predict_classic_race(
            race_slug="strade-bianche",
            year=2026,
            race_date=pd.Timestamp("2026-03-08"),
            results_df=results_df,
        )

        total = sum(p["predicted_score"] for p in preds)
        assert abs(total - TOTAL_POOL) < 1.0, f"Expected sum ~{TOTAL_POOL}, got {total}"

    @patch("src.prediction.classics._load_model")
    @patch("src.prediction.classics.compute_classic_features")
    def test_ordering_preserved(self, mock_features, mock_load):
        from src.prediction.classics import predict_classic_race

        riders = [f"r{i}" for i in range(4)]
        raw_sqrt_preds = np.array([12.0, 7.0, 4.0, 1.0])

        mock_model = MagicMock()
        mock_model.predict.return_value = raw_sqrt_preds
        feature_cols = ["feat_a"]
        mock_load.return_value = (mock_model, _fake_metadata(feature_cols))
        mock_features.side_effect = lambda **kw: {"feat_a": 1.0}

        results_df = _make_results_df(riders)
        preds = predict_classic_race(
            race_slug="kuurne",
            year=2026,
            race_date=pd.Timestamp("2026-03-02"),
            results_df=results_df,
        )

        scores = [p["predicted_score"] for p in preds]
        assert scores == sorted(scores, reverse=True), "Order not preserved"

    @patch("src.prediction.classics._load_model")
    @patch("src.prediction.classics.compute_classic_features")
    def test_proportions_preserved(self, mock_features, mock_load):
        """Relative gaps between riders should stay the same after normalization."""
        from src.prediction.classics import predict_classic_race

        riders = [f"r{i}" for i in range(3)]
        # sqrt-space preds → raw: [100, 25, 4]  ratio 1:2 should be 4:1
        raw_sqrt_preds = np.array([10.0, 5.0, 2.0])

        mock_model = MagicMock()
        mock_model.predict.return_value = raw_sqrt_preds
        feature_cols = ["feat_a"]
        mock_load.return_value = (mock_model, _fake_metadata(feature_cols))
        mock_features.side_effect = lambda **kw: {"feat_a": 1.0}

        results_df = _make_results_df(riders, race_slug="test-race")
        preds = predict_classic_race(
            race_slug="test-race",
            year=2026,
            race_date=pd.Timestamp("2026-03-01"),
            results_df=results_df,
        )

        scores = [p["predicted_score"] for p in preds]
        # Ratio between 1st and 2nd should be 100/25 = 4.0
        assert abs(scores[0] / scores[1] - 4.0) < 0.1

    @patch("src.prediction.classics._load_model")
    @patch("src.prediction.classics.compute_classic_features")
    def test_all_zero_predictions_stay_zero(self, mock_features, mock_load):
        from src.prediction.classics import predict_classic_race

        riders = [f"r{i}" for i in range(3)]
        raw_sqrt_preds = np.array([0.0, 0.0, 0.0])

        mock_model = MagicMock()
        mock_model.predict.return_value = raw_sqrt_preds
        feature_cols = ["feat_a"]
        mock_load.return_value = (mock_model, _fake_metadata(feature_cols))
        mock_features.side_effect = lambda **kw: {"feat_a": 0.0}

        results_df = _make_results_df(riders, race_slug="test-race")
        preds = predict_classic_race(
            race_slug="test-race",
            year=2026,
            race_date=pd.Timestamp("2026-03-01"),
            results_df=results_df,
        )

        assert all(p["predicted_score"] == 0.0 for p in preds)

    @patch("src.prediction.classics._load_model")
    @patch("src.prediction.classics.compute_classic_features")
    def test_breakdown_gc_matches_score(self, mock_features, mock_load):
        """The breakdown.gc field must equal predicted_score for classics."""
        from src.prediction.classics import predict_classic_race

        riders = [f"r{i}" for i in range(2)]
        raw_sqrt_preds = np.array([8.0, 3.0])

        mock_model = MagicMock()
        mock_model.predict.return_value = raw_sqrt_preds
        feature_cols = ["feat_a"]
        mock_load.return_value = (mock_model, _fake_metadata(feature_cols))
        mock_features.side_effect = lambda **kw: {"feat_a": 1.0}

        results_df = _make_results_df(riders, race_slug="test-race")
        preds = predict_classic_race(
            race_slug="test-race",
            year=2026,
            race_date=pd.Timestamp("2026-03-01"),
            results_df=results_df,
        )

        for p in preds:
            assert p["breakdown"]["gc"] == p["predicted_score"]
