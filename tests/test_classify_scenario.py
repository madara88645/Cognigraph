"""Async integration tests for classify_scenario (moved from repo-root test_main_async.py)."""

import asyncio
import os
from unittest.mock import patch

import pytest

from backend.main import classify_scenario


@patch.dict(os.environ, {}, clear=True)
def test_classify_scenario_missing_key_raises():
    with pytest.raises(RuntimeError, match="OPENROUTER_API_KEY is not set"):
        asyncio.run(classify_scenario("test"))
