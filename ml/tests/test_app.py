"""Tests for FastAPI endpoints (/health, /predict)."""

from unittest.mock import MagicMock, patch

import pytest
from starlette.testclient import TestClient

from src.api.app import app


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
        assert 'No source models loaded' in resp.json()['detail']
