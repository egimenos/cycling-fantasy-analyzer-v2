"""
Model version utilities.

Provides get_model_version() used by app.py for hot-reload detection.
"""

from __future__ import annotations

import os
from typing import Optional


def get_model_version(model_dir: str) -> Optional[str]:
    """Read model_version.txt and return its contents, or None if missing.

    Args:
        model_dir: Directory containing model_version.txt.

    Returns:
        Version string (e.g. '20260320T030000') or None.
    """
    path = os.path.join(model_dir, 'model_version.txt')
    try:
        with open(path) as f:
            return f.read().strip() or None
    except FileNotFoundError:
        return None
