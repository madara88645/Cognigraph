from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

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
