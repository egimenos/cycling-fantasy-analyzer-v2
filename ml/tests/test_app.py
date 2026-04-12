"""Tests for FastAPI endpoints (/health, /predict)."""

from unittest.mock import MagicMock, patch

import pandas as pd
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

    def test_predict_refreshes_startlist_when_missing_from_cache(self, client_with_model):
        """Regression: the in-memory startlists_df is a snapshot taken at first
        request and never invalidated. When the API scrapes a new startlist
        (e.g. for an upcoming race like paris-roubaix/2026) and then calls the
        ML service, the cached DataFrame does not contain that race yet, so
        predictions used to silently fail with "No riders found".

        The fix queries the DB on-demand for the requested (race_slug, year)
        and merges the result into the cached DataFrame before running the
        prediction pipeline.
        """
        # Cached snapshot with no row for the requested race
        empty_startlists = pd.DataFrame(
            columns=['race_slug', 'year', 'rider_id', 'team_name']
        )
        app.state.data_cache = (
            pd.DataFrame(),  # results_df
            empty_startlists,
            {},  # supply_hist
            {},  # completion
            {},  # sprint_pedigree
        )

        # Freshly scraped startlist that lives only in the DB, not in the cache
        fresh_startlist = pd.DataFrame(
            [
                {
                    'race_slug': 'paris-roubaix',
                    'year': 2026,
                    'rider_id': 'rider-42',
                    'team_name': 'Team X',
                }
            ]
        )

        with patch(
            'src.api.app.load_startlist_for_race', return_value=fresh_startlist
        ) as mock_load_sl, patch(
            'src.api.app.get_race_info', return_value=None
        ):
            # get_race_info returns None and we don't pass race_type, so the
            # endpoint short-circuits to 404 after the refresh step. That's
            # enough to verify the refresh fired with the correct arguments
            # without needing to mock the full classics/stage-race pipeline.
            resp = client_with_model.post(
                '/predict',
                json={'race_slug': 'paris-roubaix', 'year': 2026},
            )

        mock_load_sl.assert_called_once()
        args, _ = mock_load_sl.call_args
        assert args[1] == 'paris-roubaix'
        assert args[2] == 2026

        # The cache must be updated in-place so later requests don't re-query.
        _, cached_startlists, *_ = app.state.data_cache
        merged = cached_startlists[
            (cached_startlists['race_slug'] == 'paris-roubaix')
            & (cached_startlists['year'] == 2026)
        ]
        assert len(merged) == 1
        assert merged.iloc[0]['rider_id'] == 'rider-42'

        # The request itself returns 404 because we short-circuited get_race_info;
        # the point of this test is the refresh side-effect, not the outcome.
        assert resp.status_code == 404

    def test_predict_does_not_refetch_startlist_when_already_in_cache(
        self, client_with_model
    ):
        """If the requested race is already present in the cached snapshot we
        must NOT hit the DB again — the refresh path is strictly for cache
        misses."""
        cached_startlists = pd.DataFrame(
            [
                {
                    'race_slug': 'tour-de-france',
                    'year': 2025,
                    'rider_id': 'rider-1',
                    'team_name': 'Team Y',
                }
            ]
        )
        app.state.data_cache = (
            pd.DataFrame(),
            cached_startlists,
            {},
            {},
            {},
        )

        with patch(
            'src.api.app.load_startlist_for_race'
        ) as mock_load_sl, patch(
            'src.api.app.get_race_info', return_value=None
        ):
            client_with_model.post(
                '/predict',
                json={'race_slug': 'tour-de-france', 'year': 2025},
            )

        mock_load_sl.assert_not_called()
