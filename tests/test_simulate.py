import asyncio
from unittest.mock import AsyncMock, patch

import httpx
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
    main._classification_cache.clear()
    main._classification_inflight.clear()
    yield
    main._classification_cache.clear()
    main._classification_inflight.clear()


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


@patch("backend.main.run_snn", return_value=_CANNED_SPIKES)
@patch("backend.main.classify_scenario", new_callable=AsyncMock)
def test_simulate_502_when_classification_fails(mock_classify, _mock_run_snn):
    mock_classify.side_effect = RuntimeError(
        "OpenRouter returned invalid JSON payload: Expecting value"
    )
    with TestClient(app) as client:
        response = client.post("/simulate", json={"prompt": "focus"})
    assert response.status_code == 502
    assert "invalid JSON" in response.json()["detail"]
    mock_classify.assert_awaited_once()


@patch("backend.main.run_snn", return_value=_CANNED_SPIKES)
@patch("backend.main.classify_scenario", new_callable=AsyncMock)
def test_simulate_200_when_classification_succeeds_after_internal_retry(
    mock_classify, mock_run_snn
):
    """Route succeeds when classify_scenario returns (including after its internal retry)."""
    mock_classify.return_value = _CANNED_CLASSIFICATION
    with TestClient(app) as client:
        response = client.post("/simulate", json={"prompt": "morning cortisol"})
    assert response.status_code == 200
    assert response.json()["dominant_neuromodulator"] == "dopamine"
    mock_classify.assert_awaited_once()
    mock_run_snn.assert_called_once()


def test_simulate_deduplicates_inflight_classifications():
    """Concurrent /simulate calls with the same prompt share one LLM call."""

    call_count = 0

    async def slow_classify(prompt, **_kwargs):
        nonlocal call_count
        call_count += 1
        await asyncio.sleep(0.1)
        return _CANNED_CLASSIFICATION

    async def run() -> tuple[httpx.Response, httpx.Response]:
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as ac:
            return await asyncio.gather(
                ac.post("/simulate", json={"prompt": "thundering herd"}),
                ac.post("/simulate", json={"prompt": "thundering herd"}),
            )

    with (
        patch("backend.main.run_snn", return_value=_CANNED_SPIKES),
        patch("backend.main.classify_scenario", side_effect=slow_classify),
    ):
        r1, r2 = asyncio.run(run())

    assert r1.status_code == 200
    assert r2.status_code == 200
    # The whole point: one LLM call serves both concurrent requests.
    assert call_count == 1


def test_simulate_leader_cancellation_releases_inflight_slot_and_wakes_peers():
    """If the leader's classify is cancelled mid-flight (client disconnect),
    the inflight registry must be cleared and concurrent peers must wake up
    with a retriable 503 instead of hanging forever."""

    leader_started = asyncio.Event()
    release_classify = asyncio.Event()
    call_log: list[str] = []

    async def leader_classify(prompt, **_kwargs):
        call_log.append("leader_started")
        leader_started.set()
        # Wait until the test signals; this lets the peer attach as a waiter
        # before we trigger cancellation.
        await release_classify.wait()
        raise asyncio.CancelledError()

    async def run() -> tuple[int, int]:
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(
            transport=transport, base_url="http://testserver", timeout=10.0
        ) as ac:
            leader_task = asyncio.create_task(
                ac.post("/simulate", json={"prompt": "cancelled scenario"})
            )
            await leader_started.wait()
            peer_task = asyncio.create_task(
                ac.post("/simulate", json={"prompt": "cancelled scenario"})
            )
            # Give the peer a moment to attach to the inflight future.
            await asyncio.sleep(0.05)
            release_classify.set()
            leader_status: int
            try:
                leader_response = await leader_task
                leader_status = leader_response.status_code
            except asyncio.CancelledError:
                leader_status = -1  # leader bubbled cancellation, which is fine
            peer_response = await peer_task
            return leader_status, peer_response.status_code

    with (
        patch("backend.main.run_snn", return_value=_CANNED_SPIKES),
        patch("backend.main.classify_scenario", side_effect=leader_classify),
    ):
        leader_status, peer_status = asyncio.run(run())

    # The peer gets a retriable 503 (not a hang and not an opaque 500).
    assert peer_status == 503
    # Leader either propagated CancelledError or returned 5xx — either way is
    # acceptable; what matters is the inflight registry is clean.
    assert leader_status in (-1, 500, 503)
    assert not main._classification_inflight
    # Both calls were the leader's same single LLM attempt.
    assert call_log == ["leader_started"]


def test_simulate_inflight_failure_does_not_poison_cache():
    """When the leader's classify fails, the next request retries (cache stays empty)."""

    attempts = 0

    async def flaky_classify(prompt, **_kwargs):
        nonlocal attempts
        attempts += 1
        if attempts == 1:
            raise RuntimeError("OpenRouter request failed with status 502: bad gateway")
        return _CANNED_CLASSIFICATION

    with (
        patch("backend.main.run_snn", return_value=_CANNED_SPIKES),
        patch("backend.main.classify_scenario", side_effect=flaky_classify),
        TestClient(app) as client,
    ):
        first = client.post("/simulate", json={"prompt": "transient"})
        second = client.post("/simulate", json={"prompt": "transient"})

    assert first.status_code == 502
    assert second.status_code == 200
    assert attempts == 2
    # Inflight registry must be clean so the second request can become leader.
    assert not main._classification_inflight
