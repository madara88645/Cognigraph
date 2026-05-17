from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

import backend.main as main
from backend.main import LobeSpikes, _adaptive_sim_duration_ms, app
from backend.neuromodulation import LOBE_NAMES

_CANNED_CLASSIFICATION = {
    "active_lobe": "frontal",
    "dominant_neuromodulator": "dopamine",
    "neuromodulator_intensity": 0.7,
    "explanation": "Test explanation.",
    "neuromodulator_rationale": "Test rationale.",
}

_CANNED_SPIKES = {lobe: LobeSpikes(indices=[], times_ms=[]) for lobe in LOBE_NAMES}


@pytest.fixture(autouse=True)
def clear_classification_cache():
    with main._classification_cache_lock:
        main._classification_cache.clear()
    yield
    with main._classification_cache_lock:
        main._classification_cache.clear()


@patch("backend.main.run_snn", return_value=_CANNED_SPIKES)
@patch("backend.main.classify_scenario", new_callable=AsyncMock)
def test_short_prompt_uses_short_duration(mock_classify, mock_run_snn):
    mock_classify.return_value = _CANNED_CLASSIFICATION
    with TestClient(app) as client:
        response = client.post("/simulate", json={"prompt": "focus"})
    assert response.status_code == 200
    assert response.json()["duration_ms"] == 500
    assert mock_run_snn.call_args.kwargs["duration_ms"] == 500


@patch("backend.main.run_snn", return_value=_CANNED_SPIKES)
@patch("backend.main.classify_scenario", new_callable=AsyncMock)
def test_long_prompt_uses_default_duration(mock_classify, mock_run_snn):
    mock_classify.return_value = _CANNED_CLASSIFICATION
    with TestClient(app) as client:
        response = client.post("/simulate", json={"prompt": "a" * 80})
    assert response.status_code == 200
    assert response.json()["duration_ms"] == 1000
    assert mock_run_snn.call_args.kwargs["duration_ms"] == 1000


def test_adaptive_duration_helper_unit():
    assert _adaptive_sim_duration_ms("hi") == 500
    assert _adaptive_sim_duration_ms("a" * 60) == 500  # boundary inclusive
    assert _adaptive_sim_duration_ms("a" * 61) == 1000


@patch("backend.main.run_snn", return_value=_CANNED_SPIKES)
@patch("backend.main.classify_scenario", new_callable=AsyncMock)
def test_cache_hit_skips_llm(mock_classify, _mock_run_snn):
    mock_classify.return_value = _CANNED_CLASSIFICATION
    with TestClient(app) as client:
        first = client.post("/simulate", json={"prompt": "focus"})
        second = client.post("/simulate", json={"prompt": "focus"})
    assert first.status_code == 200
    assert second.status_code == 200
    assert mock_classify.call_count == 1


@patch("backend.main.run_snn", return_value=_CANNED_SPIKES)
@patch("backend.main.classify_scenario", new_callable=AsyncMock)
def test_cache_miss_on_different_prompt(mock_classify, _mock_run_snn):
    mock_classify.return_value = _CANNED_CLASSIFICATION
    with TestClient(app) as client:
        first = client.post("/simulate", json={"prompt": "focus"})
        second = client.post("/simulate", json={"prompt": "sleep"})
    assert first.status_code == 200
    assert second.status_code == 200
    assert mock_classify.call_count == 2


@patch("backend.main.run_snn", return_value=_CANNED_SPIKES)
@patch("backend.main.classify_scenario", new_callable=AsyncMock)
def test_cache_normalizes_whitespace(mock_classify, _mock_run_snn):
    mock_classify.return_value = _CANNED_CLASSIFICATION
    with TestClient(app) as client:
        first = client.post("/simulate", json={"prompt": "focus"})
        second = client.post("/simulate", json={"prompt": "  Focus  "})
    assert first.status_code == 200
    assert second.status_code == 200
    assert mock_classify.call_count == 1


@patch("backend.main.run_snn", return_value=_CANNED_SPIKES)
@patch("backend.main.classify_scenario", new_callable=AsyncMock)
def test_demo_byok_persona_isolated(mock_classify, _mock_run_snn):
    mock_classify.return_value = _CANNED_CLASSIFICATION
    with TestClient(app) as client:
        demo_resp = client.post("/simulate", json={"prompt": "focus"})
        byok_resp = client.post(
            "/simulate",
            json={"prompt": "focus"},
            headers={"X-OpenRouter-Api-Key": "sk-test"},
        )
    assert demo_resp.status_code == 200
    assert byok_resp.status_code == 200
    assert mock_classify.call_count == 2
