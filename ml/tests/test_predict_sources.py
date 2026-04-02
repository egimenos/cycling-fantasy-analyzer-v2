"""Tests for source-by-source prediction pipeline (predict_sources.py)."""

import logging

import numpy as np
import pandas as pd
import pytest

from src.prediction.stage_races import (
    _sharpen,
    _scale_to_supply,
    _validate_features,
)


class TestSharpen:
    """Test the _sharpen distribution sharpening function."""

    def test_all_zeros_returns_zeros(self):
        pred = np.zeros(10)
        result = _sharpen(pred)
        np.testing.assert_array_equal(result, np.zeros(10))

    def test_zeros_bottom_percentile(self):
        """Bottom 60% of non-zero values should be zeroed."""
        pred = np.array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10.0])
        result = _sharpen(pred, power=1.0, zero_percentile=60, cap_percentile=100)
        # 60th percentile of [1..10] = 6.4, so values <= 6.4 become 0
        assert result[0] == 0   # was already 0
        assert result[1] == 0   # 1 <= threshold
        assert result[6] == 0   # 6 <= threshold
        assert result[7] > 0    # 7 > threshold

    def test_power_amplifies_differences(self):
        """Power transform should amplify relative differences."""
        pred = np.array([0, 5.0, 8.0, 10.0])
        result = _sharpen(pred, power=2.0, zero_percentile=0, cap_percentile=100)
        # 8^2=64, 10^2=100 — ratio goes from 1.25x to 1.5625x
        assert result[3] / result[2] > 10.0 / 8.0

    def test_cap_percentile_limits_outliers(self):
        """Outlier should be capped at the cap_percentile."""
        pred = np.array([0, 0, 0, 1, 2, 3, 4, 5, 6, 100.0])
        result_capped = _sharpen(pred, power=2.0, zero_percentile=0, cap_percentile=95)
        result_uncapped = _sharpen(pred, power=2.0, zero_percentile=0, cap_percentile=100)
        # Capped result's max should be much smaller than uncapped
        assert result_capped.max() < result_uncapped.max()

    def test_preserves_zero_entries(self):
        """Original zero entries should stay zero."""
        pred = np.array([0, 0, 5.0, 10.0])
        result = _sharpen(pred, power=2.0, zero_percentile=0, cap_percentile=100)
        assert result[0] == 0
        assert result[1] == 0


class TestScaleToSupply:
    """Test the _scale_to_supply normalization function."""

    def test_scales_to_target_sum(self):
        pred = np.array([10.0, 20.0, 30.0])
        result = _scale_to_supply(pred, supply=120.0)
        np.testing.assert_almost_equal(result.sum(), 120.0)

    def test_preserves_relative_ranking(self):
        pred = np.array([10.0, 20.0, 30.0])
        result = _scale_to_supply(pred, supply=100.0)
        assert result[0] < result[1] < result[2]

    def test_all_zeros_returns_zeros(self):
        pred = np.zeros(5)
        result = _scale_to_supply(pred, supply=100.0)
        np.testing.assert_array_equal(result, np.zeros(5))

    def test_no_negative_values(self):
        pred = np.array([0, 0, 5.0, 10.0])
        result = _scale_to_supply(pred, supply=50.0)
        assert (result >= 0).all()

    def test_proportions_preserved(self):
        """Rider with 2x prediction should get 2x points after scaling."""
        pred = np.array([10.0, 20.0])
        result = _scale_to_supply(pred, supply=90.0)
        np.testing.assert_almost_equal(result[1] / result[0], 2.0)


class TestValidateFeatures:
    """Test feature alignment validation."""

    def test_no_warning_when_all_present(self, caplog):
        metadata = {"feature_lists": {"model_a": ["f1", "f2", "f3"]}}
        df = pd.DataFrame({"f1": [1], "f2": [2], "f3": [3]})
        with caplog.at_level(logging.WARNING):
            _validate_features(metadata, df)
        assert len(caplog.records) == 0

    def test_warns_on_missing_features(self, caplog):
        metadata = {"feature_lists": {"model_a": ["f1", "f2", "f_missing"]}}
        df = pd.DataFrame({"f1": [1], "f2": [2]})
        with caplog.at_level(logging.WARNING):
            _validate_features(metadata, df)
        assert len(caplog.records) == 1
        assert "f_missing" in caplog.records[0].message
        assert "model_a" in caplog.records[0].message

    def test_empty_metadata_no_crash(self):
        """Empty metadata should not raise."""
        _validate_features({}, pd.DataFrame({"f1": [1]}))

    def test_multiple_models_checked(self, caplog):
        """Each model's features are checked independently."""
        metadata = {
            "feature_lists": {
                "model_a": ["f1", "f_missing_a"],
                "model_b": ["f1", "f_missing_b"],
            }
        }
        df = pd.DataFrame({"f1": [1]})
        with caplog.at_level(logging.WARNING):
            _validate_features(metadata, df)
        assert len(caplog.records) == 2
