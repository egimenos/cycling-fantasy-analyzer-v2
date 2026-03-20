"""Tests for prediction logic (predict.py)."""

import os
import tempfile
from unittest.mock import MagicMock, patch

import numpy as np
import pytest

from src.predict import get_model_version, load_models, predict_race


class TestLoadModels:
    """Verify model loading from disk."""

    def test_load_models_with_files(self, tmp_path):
        """When model files exist, load_models returns a dict keyed by race type."""
        with patch('src.predict.joblib') as mock_joblib:
            mock_model = MagicMock()
            mock_joblib.load.return_value = mock_model

            # Create fake model files
            (tmp_path / 'model_mini_tour.joblib').touch()
            (tmp_path / 'model_grand_tour.joblib').touch()

            models = load_models(str(tmp_path))

            assert 'mini_tour' in models
            assert 'grand_tour' in models
            assert mock_joblib.load.call_count == 2

    def test_load_models_missing_file(self, tmp_path):
        """When model files are missing, load_models returns empty or partial dict."""
        models = load_models(str(tmp_path))
        assert models == {}

    def test_load_models_partial(self, tmp_path):
        """When only one model file exists, returns partial dict."""
        with patch('src.predict.joblib') as mock_joblib:
            mock_joblib.load.return_value = MagicMock()
            (tmp_path / 'model_mini_tour.joblib').touch()

            models = load_models(str(tmp_path))

            assert 'mini_tour' in models
            assert 'grand_tour' not in models


class TestGetModelVersion:
    """Verify model version reading."""

    def test_get_model_version_exists(self, tmp_path):
        """Reads version string from model_version.txt."""
        version_file = tmp_path / 'model_version.txt'
        version_file.write_text('20260320T030000\n')

        version = get_model_version(str(tmp_path))
        assert version == '20260320T030000'

    def test_get_model_version_missing(self, tmp_path):
        """Returns None when model_version.txt does not exist."""
        version = get_model_version(str(tmp_path))
        assert version is None

    def test_get_model_version_empty(self, tmp_path):
        """Returns None when model_version.txt is empty."""
        version_file = tmp_path / 'model_version.txt'
        version_file.write_text('')

        version = get_model_version(str(tmp_path))
        assert version is None


class TestPredictRace:
    """Verify single-race prediction logic."""

    @patch('src.predict.get_race_info')
    def test_predict_race_classic_returns_empty(self, mock_race_info):
        """Classic races are not supported by ML — should return empty list."""
        mock_race_info.return_value = {
            'race_type': 'classic',
            'race_date': '2026-03-20',
        }

        result = predict_race(
            race_slug='milano-sanremo',
            year=2026,
            models={'mini_tour': MagicMock()},
            results_df=MagicMock(),
            startlists_df=MagicMock(),
            db_url='postgresql://fake',
        )

        assert result == []

    @patch('src.predict.get_race_info')
    def test_predict_race_not_found(self, mock_race_info):
        """Race not found in database should return empty list."""
        mock_race_info.return_value = None

        result = predict_race(
            race_slug='nonexistent',
            year=2099,
            models={'mini_tour': MagicMock()},
            results_df=MagicMock(),
            startlists_df=MagicMock(),
            db_url='postgresql://fake',
        )

        assert result == []

    @patch('src.predict.extract_features_for_race')
    @patch('src.predict.get_race_info')
    def test_predict_race_no_model_for_type(self, mock_race_info, mock_extract):
        """Race type without a loaded model should return empty list."""
        mock_race_info.return_value = {
            'race_type': 'mini_tour',
            'race_date': '2026-03-20',
        }

        # models dict has grand_tour but not mini_tour
        result = predict_race(
            race_slug='tirreno-adriatico',
            year=2026,
            models={'grand_tour': MagicMock()},
            results_df=MagicMock(),
            startlists_df=MagicMock(),
            db_url='postgresql://fake',
        )

        assert result == []

    @patch('src.predict.extract_features_for_race')
    @patch('src.predict.get_race_info')
    def test_predict_race_mini_tour_success(self, mock_race_info, mock_extract):
        """Mini tour with valid features should return predictions."""
        import pandas as pd
        from src.features import FEATURE_COLS

        mock_race_info.return_value = {
            'race_type': 'mini_tour',
            'race_date': pd.Timestamp('2026-03-15'),
        }

        # Create a mock features DataFrame with 3 riders
        data = {col: [0.0, 1.0, 2.0] for col in FEATURE_COLS}
        data['rider_id'] = ['r1', 'r2', 'r3']
        features_df = pd.DataFrame(data)
        mock_extract.return_value = features_df

        # Mock model
        mock_model = MagicMock()
        mock_model.predict.return_value = np.array([85.0, 72.5, 60.0])

        result = predict_race(
            race_slug='tirreno-adriatico',
            year=2026,
            models={'mini_tour': mock_model},
            results_df=MagicMock(),
            startlists_df=MagicMock(),
            db_url='postgresql://fake',
        )

        assert len(result) == 3
        assert result[0]['rider_id'] == 'r1'
        assert result[0]['predicted_score'] == 85.0
        assert result[1]['predicted_score'] == 72.5
        assert result[2]['predicted_score'] == 60.0
