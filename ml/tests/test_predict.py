"""Tests for model version utilities (predict.py)."""

from src.predict import get_model_version


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
