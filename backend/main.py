import asyncio
import json
import logging
import os
from pathlib import Path
from typing import Any, Dict, List, Tuple
from urllib import error as urlerror
from urllib import request as urlrequest

from contextlib import asynccontextmanager

import brian2 as b2
import httpx
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from backend.neuromodulation import (
    LOBE_NAMES,
    LobeName,
    NeuromodulatorName,
    ResolvedSnnParams,
    build_vfx_profile,
    resolve_snn_modulation,
    snn_params_to_dict,
    validate_classification_payload,
)

logger = logging.getLogger("cognigraph")
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)

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

# Global HTTPX Client
http_client: httpx.AsyncClient = None  # type: ignore


@asynccontextmanager
async def lifespan(app: FastAPI):
    global http_client
    http_client = httpx.AsyncClient(timeout=45.0)
    yield
    await http_client.aclose()


class SimulateRequest(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=1000)


class LobeSpikes(BaseModel):
    indices: List[int]
    times_ms: List[float]


class SnnModulationEcho(BaseModel):
    v_thresh: float
    tau_ms: float
    refractory_ms: float
    epsp: float
    v_center: float
    v_spread: float
    active_rate_hz: float
    background_rate_hz: float


class VfxProfileEcho(BaseModel):
    glow_hex: str
    bloom_mult: float
    bloom_activity_boost_mult: float
    tween_in_ms: float
    tween_out_ms: float
    idle_breath_speed_mult: float
    idle_breath_amp_mult: float
    vertex_wave_mult: float
    burst_threshold: float
    active_lobe_bloom_scale: float
    global_chaos_mult: float = 1.0
    desaturate: float = 0.0
    scatter_flash_prob: float = 0.0


class SimulateResponse(BaseModel):
    active_lobe: LobeName
    dominant_neuromodulator: NeuromodulatorName
    neuromodulator_intensity: float = Field(..., ge=0.0, le=1.0)
    neuromodulator_rationale: str = ""
    explanation: str
    duration_ms: int
    spikes: Dict[LobeName, LobeSpikes]
    snn_modulation: SnnModulationEcho
    vfx_profile: VfxProfileEcho


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


def _parse_model_json(raw_text: str) -> Dict[str, Any]:
    cleaned = _strip_markdown_fences(raw_text)
    parsed = json.loads(cleaned)
    if not isinstance(parsed, dict):
        raise ValueError("Model output is not a JSON object.")
    return parsed


def _extract_chat_message_text(message: Any) -> str:
    """Normalize OpenRouter/OpenAI-style message.content (str or list of parts) to plain text."""
    if message is None or not isinstance(message, dict):
        return ""
    content = message.get("content")
    if content is None:
        return ""
    if isinstance(content, str):
        return content.strip()
    if isinstance(content, list):
        parts: List[str] = []
        for part in content:
            if isinstance(part, str):
                parts.append(part)
            elif isinstance(part, dict):
                t = part.get("type")
                if t == "text" and isinstance(part.get("text"), str):
                    parts.append(part["text"])
                elif isinstance(part.get("content"), str):
                    parts.append(part["content"])
        return "".join(parts).strip()
    return str(content).strip()


async def classify_scenario(prompt: str) -> Dict[str, Any]:
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
        "Given a real-world scenario, choose:\n"
        "1) The single primary active brain lobe from: "
        "frontal, parietal, occipital, temporal, cerebellum.\n"
        "2) The single dominant neuromodulator tone from: "
        "adrenaline, noradrenaline, dopamine, serotonin, gaba, acetylcholine, cortisol, baseline.\n"
        "Return STRICT JSON only with keys:\n"
        "active_lobe, dominant_neuromodulator, neuromodulator_intensity (0.0-1.0), "
        "explanation, neuromodulator_rationale (one short sentence; may be empty string).\n"
        "If the scenario is emotionally neutral, use baseline with neuromodulator_intensity <= 0.3.\n"
        "Disambiguation — cortisol vs noradrenaline: If the scenario centers on HPA-axis cortisol "
        "(e.g. morning cortisol awakening response, CAR, diurnal cortisol pulse, glucocorticoid stress "
        "hormone, explicit 'cortisol' as the driver of the state), you MUST set "
        "dominant_neuromodulator to cortisol. Do not pick noradrenaline merely because the person "
        "feels alert or vigilant; noradrenaline is for LC-NE vigilance, surprise, or phasic attention "
        "when cortisol/HPA is not the stated focus. If the user names cortisol or CAR, cortisol wins.\n"
        "For cortisol, neuromodulator_intensity selects the regime: <=0.5 means optimal acute arousal "
        "(e.g. waking up, short manageable challenge); >0.5 means toxic/chronic load "
        "(e.g. chronic stress, exam panic, overtraining, burnout). Do not use cortisol for neutral scenes "
        "unless stress is clearly described; otherwise prefer baseline or a sharper modulator.\n"
        "Do not output concentrations or invented units. No markdown fences. No extra keys. No prose.\n"
        'Example: {"active_lobe":"frontal","dominant_neuromodulator":"dopamine",'
        '"neuromodulator_intensity":0.7,"explanation":"...","neuromodulator_rationale":"..."}'
    )
    payload = {
        "model": OPENROUTER_MODEL,
        "messages": [
            {"role": "system", "content": instruction},
            {"role": "user", "content": f"Scenario: {prompt}"},
        ],
        "temperature": 0.2,
    }
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost:8000",
        "X-Title": "CogniGraph",
    }

    try:
        if http_client is None:
            # Fallback for when run outside of the FastAPI app lifecycle (e.g., direct test calls)
            async with httpx.AsyncClient(timeout=45.0) as temp_client:
                response = await temp_client.post(OPENROUTER_URL, json=payload, headers=headers)
                response.raise_for_status()
                raw = response.text
        else:
            response = await http_client.post(OPENROUTER_URL, json=payload, headers=headers)
            response.raise_for_status()
            raw = response.text
    except httpx.HTTPStatusError as exc:
        error_body = exc.response.text
        raise RuntimeError(
            f"OpenRouter request failed with status {exc.response.status_code}: {error_body}"
        ) from exc
    except Exception as exc:  # pragma: no cover - network/service dependency
        raise RuntimeError(f"OpenRouter request failed: {exc}") from exc

    try:
        parsed_response = json.loads(raw)
        choice0 = parsed_response.get("choices", [{}])[0]
        msg = choice0.get("message", {})
        response_text = _extract_chat_message_text(msg)
        if not response_text and isinstance(choice0, dict):
            response_text = _extract_chat_message_text(
                {"content": choice0.get("text") or choice0.get("content")}
            )
    except Exception as exc:
        raise RuntimeError(f"OpenRouter returned malformed response: {exc}") from exc
    if not response_text:
        raise RuntimeError("OpenRouter returned an empty response.")

    try:
        parsed = _parse_model_json(response_text)
        return validate_classification_payload(parsed)
    except Exception as exc:
        raise RuntimeError(f"OpenRouter returned invalid JSON payload: {exc}") from exc


def run_snn(
    active_lobe: LobeName,
    resolved: ResolvedSnnParams,
    duration_ms: int = 1000,
    neurons_per_lobe: int = 100,
) -> Dict[str, Dict[str, List[float]]]:
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
    vt : 1
    """

    v_thresh = resolved.v_thresh
    tau_val = resolved.tau_ms * b2.ms
    ref_val = resolved.refractory_ms * b2.ms
    epsp = resolved.epsp
    v_init = f"{resolved.v_center} + {resolved.v_spread} * rand()"

    monitors: Dict[str, b2.SpikeMonitor] = {}
    groups: List[b2.NeuronGroup] = []
    poisson_inputs: List[b2.PoissonGroup] = []
    synapses: List[b2.Synapses] = []

    on_pre = f"v += {epsp}"

    if resolved.lobe_rates_hz is not None:
        rate_map = dict(resolved.lobe_rates_hz)
    else:
        rate_map = None

    for lobe in LOBE_NAMES:
        group = b2.NeuronGroup(
            neurons_per_lobe,
            model=eqs,
            threshold="v > vt",
            reset="v = 0.0",
            refractory=ref_val,
            method="euler",
            name=f"{lobe}_group",
        )
        group.v = v_init
        group.tau = tau_val
        group.vt = v_thresh
        groups.append(group)

        if rate_map is not None:
            rate_hz = rate_map.get(lobe, resolved.background_rate_hz)
        else:
            rate_hz = (
                resolved.active_rate_hz
                if lobe == active_lobe
                else resolved.background_rate_hz
            )
        poisson = b2.PoissonGroup(
            neurons_per_lobe,
            rates=rate_hz * b2.Hz,
            name=f"{lobe}_poisson",
        )
        poisson_inputs.append(poisson)
        syn = b2.Synapses(poisson, group, on_pre=on_pre, name=f"{lobe}_syn")
        syn.connect(j="i")
        synapses.append(syn)

        monitors[lobe] = b2.SpikeMonitor(group, name=f"{lobe}_spikes")

    network = b2.Network()
    network.add(groups)
    network.add(poisson_inputs)
    network.add(synapses)
    network.add(list(monitors.values()))
    network.run(duration_ms * b2.ms)

    spikes: Dict[str, Dict[str, List[float]]] = {}
    for lobe, monitor in monitors.items():
        indices = [int(i) for i in monitor.i[:]]
        times_ms = [float(t / b2.ms) for t in monitor.t[:]]
        spikes[lobe] = {"indices": indices, "times_ms": times_ms}

    return spikes


app = FastAPI(title="CogniGraph API", version="1.0.0", lifespan=lifespan)
app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR)), name="static")


@app.get("/")
def serve_index() -> FileResponse:
    if not FRONTEND_INDEX.exists():
        raise HTTPException(status_code=500, detail="Frontend index.html not found.")
    return FileResponse(FRONTEND_INDEX)


@app.post("/simulate", response_model=SimulateResponse)
async def simulate(request: SimulateRequest) -> SimulateResponse:
    prompt = request.prompt.strip()
    if not prompt:
        raise HTTPException(status_code=400, detail="Prompt cannot be empty.")

    try:
        llm_result = await classify_scenario(prompt)
    except RuntimeError as exc:
        message = str(exc)
        if "OPENROUTER_API_KEY is not set" in message:
            raise HTTPException(status_code=503, detail=message) from exc
        logger.exception("Failed to classify scenario with OpenRouter.")
        raise HTTPException(
            status_code=502,
            detail="Failed to classify scenario with OpenRouter.",
        ) from exc
    except Exception as exc:
        logger.exception("Unexpected LLM classification failure.")
        raise HTTPException(
            status_code=502,
            detail="Unexpected LLM classification failure.",
        ) from exc

    active_lobe = llm_result["active_lobe"]
    explanation = llm_result["explanation"]
    dominant_nm = llm_result["dominant_neuromodulator"]
    nm_intensity = llm_result["neuromodulator_intensity"]
    nm_rationale = llm_result["neuromodulator_rationale"]

    resolved = resolve_snn_modulation(
        dominant_nm, nm_intensity, active_lobe=active_lobe
    )
    vfx_raw = build_vfx_profile(dominant_nm, nm_intensity)

    try:
        spikes = await asyncio.to_thread(
            run_snn, active_lobe=active_lobe, resolved=resolved
        )
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"SNN simulation failed: {exc}",
        ) from exc

    spike_counts = {lobe: len(spikes[lobe]["times_ms"]) for lobe in LOBE_NAMES}
    logger.info(
        "simulation_complete active_lobe=%s neuromod=%s intensity=%s spike_counts=%s",
        active_lobe,
        dominant_nm,
        nm_intensity,
        spike_counts,
    )

    return SimulateResponse(
        active_lobe=active_lobe,  # type: ignore[arg-type]
        dominant_neuromodulator=dominant_nm,  # type: ignore[arg-type]
        neuromodulator_intensity=nm_intensity,
        neuromodulator_rationale=nm_rationale,
        explanation=explanation,
        duration_ms=1000,
        spikes=spikes,  # type: ignore[arg-type]
        snn_modulation=SnnModulationEcho(**snn_params_to_dict(resolved)),
        vfx_profile=VfxProfileEcho(**vfx_raw),
    )


if __name__ == "__main__":
    import sys
    import uvicorn

    project_root = str(Path(__file__).resolve().parent.parent)
    if project_root not in sys.path:
        sys.path.insert(0, project_root)

    uvicorn.run("backend.main:app", host="0.0.0.0", port=8000, reload=True)
