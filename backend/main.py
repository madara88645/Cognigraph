import json
import logging
import os
from pathlib import Path
from typing import Dict, List, Literal, Tuple
from urllib import error as urlerror
from urllib import request as urlrequest

import brian2 as b2
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field


logger = logging.getLogger("cognigraph")
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)

LOBE_NAMES: Tuple[str, ...] = (
    "frontal",
    "parietal",
    "occipital",
    "temporal",
    "cerebellum",
)
LobeName = Literal["frontal", "parietal", "occipital", "temporal", "cerebellum"]

PROJECT_ROOT = Path(__file__).resolve().parent.parent
FRONTEND_DIR = PROJECT_ROOT / "frontend"
FRONTEND_INDEX = FRONTEND_DIR / "index.html"
ENV_FILE = PROJECT_ROOT / ".env"
OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
OPENROUTER_MODEL = os.getenv("OPENROUTER_MODEL", "x-ai/grok-4.1-fast")


def _load_dotenv_file() -> None:
    if not ENV_FILE.exists():
        return
    for line in ENV_FILE.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, value = stripped.split("=", 1)
        k = key.strip()
        v = value.strip().strip("\"'")
        if k and k not in os.environ:
            os.environ[k] = v


_load_dotenv_file()


class SimulateRequest(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=1000)


class LobeSpikes(BaseModel):
    indices: List[int]
    times_ms: List[float]


class SimulateResponse(BaseModel):
    active_lobe: LobeName
    explanation: str
    duration_ms: int
    spikes: Dict[LobeName, LobeSpikes]


def _strip_markdown_fences(raw: str) -> str:
    text = raw.strip()
    if text.startswith("```"):
        lines = text.splitlines()
        if len(lines) >= 3:
            lines = lines[1:]
            if lines and lines[-1].strip() == "```":
                lines = lines[:-1]
            text = "\n".join(lines).strip()
    return text


def _parse_model_json(raw_text: str) -> Dict[str, str]:
    cleaned = _strip_markdown_fences(raw_text)
    parsed = json.loads(cleaned)
    if not isinstance(parsed, dict):
        raise ValueError("Model output is not a JSON object.")
    return parsed


def _validate_lobe_payload(payload: Dict[str, str]) -> Dict[str, str]:
    active_lobe = str(payload.get("active_lobe", "")).strip().lower()
    explanation = str(payload.get("explanation", "")).strip()
    if active_lobe not in LOBE_NAMES:
        raise ValueError(f"Invalid active_lobe from model output: {active_lobe!r}")
    if not explanation:
        raise ValueError("Model explanation is missing.")
    return {"active_lobe": active_lobe, "explanation": explanation}


def classify_active_lobe(prompt: str) -> Dict[str, str]:
    api_key = (
        os.getenv("OPENROUTER_API_KEY")
        or os.getenv("openrouter_api_key")
        or os.getenv("OPENAI_API_KEY")
        or os.getenv("openai_api_key")
    )
    if not api_key:
        raise RuntimeError(
            "OPENROUTER_API_KEY is not set. Configure the environment variable and retry."
        )

    instruction = (
        "You are a neuroscience classifier.\n"
        "Given a real-world scenario, choose the single primary active lobe from:\n"
        "frontal, parietal, occipital, temporal, cerebellum.\n"
        "Return STRICT JSON only with keys active_lobe and explanation.\n"
        'Example: {"active_lobe":"frontal","explanation":"..."}\n'
        "No markdown fences. No extra keys. No prose."
    )
    payload = {
        "model": OPENROUTER_MODEL,
        "messages": [
            {"role": "system", "content": instruction},
            {"role": "user", "content": f"Scenario: {prompt}"},
        ],
        "temperature": 0.2,
    }
    data = json.dumps(payload).encode("utf-8")
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost:8000",
        "X-Title": "CogniGraph",
    }
    req = urlrequest.Request(OPENROUTER_URL, data=data, headers=headers, method="POST")

    try:
        with urlrequest.urlopen(req, timeout=45) as response:
            raw = response.read().decode("utf-8")
    except urlerror.HTTPError as exc:
        error_body = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(
            f"OpenRouter request failed with status {exc.code}: {error_body}"
        ) from exc
    except Exception as exc:  # pragma: no cover - network/service dependency
        raise RuntimeError(f"OpenRouter request failed: {exc}") from exc

    try:
        parsed_response = json.loads(raw)
        response_text = (
            parsed_response.get("choices", [{}])[0]
            .get("message", {})
            .get("content", "")
            .strip()
        )
    except Exception as exc:
        raise RuntimeError(f"OpenRouter returned malformed response: {exc}") from exc
    if not response_text:
        raise RuntimeError("OpenRouter returned an empty response.")

    try:
        parsed = _parse_model_json(response_text)
        return _validate_lobe_payload(parsed)
    except Exception as exc:
        raise RuntimeError(f"OpenRouter returned invalid JSON payload: {exc}") from exc


def run_snn(
    active_lobe: LobeName,
    duration_ms: int = 1000,
    neurons_per_lobe: int = 100,
    active_rate_hz: float = 100.0,
    background_rate_hz: float = 10.0,
) -> Dict[LobeName, Dict[str, List[float]]]:
    if active_lobe not in LOBE_NAMES:
        raise ValueError(f"Unknown lobe: {active_lobe}")
    if duration_ms <= 0:
        raise ValueError("duration_ms must be > 0")
    if neurons_per_lobe <= 0:
        raise ValueError("neurons_per_lobe must be > 0")

    b2.prefs.codegen.target = "numpy"
    b2.start_scope()
    b2.defaultclock.dt = 1 * b2.ms

    eqs = """
    dv/dt = (-v) / tau : 1 (unless refractory)
    tau : second
    """

    monitors: Dict[LobeName, b2.SpikeMonitor] = {}
    groups: List[b2.NeuronGroup] = []
    poisson_inputs: List[b2.PoissonGroup] = []
    synapses: List[b2.Synapses] = []

    for lobe in LOBE_NAMES:
        group = b2.NeuronGroup(
            neurons_per_lobe,
            model=eqs,
            threshold="v > 0.8",
            reset="v = 0.0",
            refractory=5 * b2.ms,
            method="euler",
            name=f"{lobe}_group",
        )
        group.v = "0.45 + 0.1 * rand()"
        group.tau = 20 * b2.ms
        groups.append(group)

        rate = active_rate_hz if lobe == active_lobe else background_rate_hz
        poisson = b2.PoissonGroup(
            neurons_per_lobe,
            rates=rate * b2.Hz,
            name=f"{lobe}_poisson",
        )
        poisson_inputs.append(poisson)
        syn = b2.Synapses(poisson, group, on_pre="v += 0.4", name=f"{lobe}_syn")
        syn.connect(j="i")
        synapses.append(syn)

        monitors[lobe] = b2.SpikeMonitor(group, name=f"{lobe}_spikes")

    network = b2.Network()
    network.add(groups)
    network.add(poisson_inputs)
    network.add(synapses)
    network.add(list(monitors.values()))
    network.run(duration_ms * b2.ms)

    spikes: Dict[LobeName, Dict[str, List[float]]] = {}
    for lobe, monitor in monitors.items():
        indices = [int(i) for i in monitor.i[:]]
        times_ms = [float(t / b2.ms) for t in monitor.t[:]]
        spikes[lobe] = {"indices": indices, "times_ms": times_ms}

    return spikes


app = FastAPI(title="CogniGraph API", version="1.0.0")
app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR)), name="static")


@app.get("/")
def serve_index() -> FileResponse:
    if not FRONTEND_INDEX.exists():
        raise HTTPException(status_code=500, detail="Frontend index.html not found.")
    return FileResponse(FRONTEND_INDEX)


@app.post("/simulate", response_model=SimulateResponse)
def simulate(request: SimulateRequest) -> SimulateResponse:
    prompt = request.prompt.strip()
    if not prompt:
        raise HTTPException(status_code=400, detail="Prompt cannot be empty.")

    try:
        llm_result = classify_active_lobe(prompt)
    except RuntimeError as exc:
        message = str(exc)
        if "OPENROUTER_API_KEY is not set" in message:
            raise HTTPException(status_code=503, detail=message) from exc
        raise HTTPException(
            status_code=502,
            detail=f"Failed to classify active lobe with OpenRouter: {message}",
        ) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Unexpected LLM classification failure: {exc}",
        ) from exc

    active_lobe = llm_result["active_lobe"]
    explanation = llm_result["explanation"]

    try:
        spikes = run_snn(active_lobe=active_lobe)
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"SNN simulation failed: {exc}",
        ) from exc

    spike_counts = {lobe: len(spikes[lobe]["times_ms"]) for lobe in LOBE_NAMES}
    logger.info(
        "simulation_complete active_lobe=%s spike_counts=%s",
        active_lobe,
        spike_counts,
    )

    return SimulateResponse(
        active_lobe=active_lobe,  # type: ignore[arg-type]
        explanation=explanation,
        duration_ms=1000,
        spikes=spikes,  # type: ignore[arg-type]
    )


if __name__ == "__main__":
    import sys
    import uvicorn

    # Ensure the project root is on sys.path so uvicorn's reloader
    # can resolve "backend.main" as a dotted module import.
    project_root = str(Path(__file__).resolve().parent.parent)
    if project_root not in sys.path:
        sys.path.insert(0, project_root)

    uvicorn.run("backend.main:app", host="0.0.0.0", port=8000, reload=True)
