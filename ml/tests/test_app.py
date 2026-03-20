"""Tests for FastAPI endpoints (/health, /predict)."""

from unittest.mock import MagicMock, patch

import pytest
from starlette.testclient import TestClient

from src.app import app


@pytest.fixture
def client_no_model():
    """TestClient where models dict is empty (simulates startup without trained models)."""
    with TestClient(app) as client:
        app.state.models = {}
        app.state.model_version = None
        app.state.model_dir = '/tmp/fake_models'
        app.state.data_cache = None
        yield client


@pytest.fixture
def client_with_model():
    """TestClient with a mock model loaded (simulates healthy state)."""
    with TestClient(app) as client:
        mock_model = MagicMock()
        app.state.models = {'mini_tour': mock_model, 'grand_tour': mock_model}
        app.state.model_version = '20260320T120000'
        app.state.model_dir = '/tmp/fake_models'
        app.state.data_cache = None
        yield client


class TestHealthEndpoint:
    """GET /health tests."""

    def test_health_no_model(self, client_no_model):
        """When no models are loaded, status should be 'no_model'."""
        resp = client_no_model.get('/health')
        assert resp.status_code == 200
        data = resp.json()
        assert data['status'] == 'no_model'
        assert data['models_loaded'] == []
        assert data['model_version'] is None

    def test_health_with_model(self, client_with_model):
        """When models are loaded, status should be 'healthy' with version and types."""
        resp = client_with_model.get('/health')
        assert resp.status_code == 200
        data = resp.json()
        assert data['status'] == 'healthy'
        assert data['model_version'] == '20260320T120000'
        assert 'mini_tour' in data['models_loaded']
        assert 'grand_tour' in data['models_loaded']


class TestPredictEndpoint:
    """POST /predict tests."""

    def test_predict_no_model(self, client_no_model):
        """POST /predict without loaded models should return 503."""
        resp = client_no_model.post(
            '/predict',
            json={'race_slug': 'tour-de-france', 'year': 2026},
        )
        assert resp.status_code == 503
        assert 'No models loaded' in resp.json()['detail']

    @patch('src.app.check_cache', return_value=None)
    @patch('src.app.write_cache')
    @patch('src.app.load_data')
    @patch('src.app.predict_race', return_value=[])
    @patch('src.app.get_model_version', return_value='20260320T120000')
    def test_predict_invalid_race(
        self, mock_version, mock_predict, mock_load_data, mock_write, mock_cache,
        client_with_model,
    ):
        """POST /predict for a race with no startlist should return 404."""
        mock_load_data.return_value = (MagicMock(), MagicMock())

        resp = client_with_model.post(
            '/predict',
            json={'race_slug': 'nonexistent-race', 'year': 2099},
        )
        assert resp.status_code == 404

    @patch('src.app.check_cache')
    @patch('src.app.get_model_version', return_value='20260320T120000')
    def test_predict_cache_hit(self, mock_version, mock_cache, client_with_model):
        """POST /predict with cached results should return cached=True without running prediction."""
        mock_cache.return_value = [
            {'rider_id': 'r1', 'predicted_score': 85.0},
            {'rider_id': 'r2', 'predicted_score': 72.5},
        ]

        resp = client_with_model.post(
            '/predict',
            json={'race_slug': 'tour-de-france', 'year': 2026},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data['cached'] is True
        assert len(data['predictions']) == 2
        assert data['model_version'] == '20260320T120000'
