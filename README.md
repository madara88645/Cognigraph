# CogniGraph

<p align="center">
  <img src="docs/readme/banner.png" alt="CogniGraph — neural network and brain visualization banner" width="100%" />
</p>

**CogniGraph** (repository folder: `Cognigraph`) is a small educational demo: you describe a real-world scenario, an LLM classifies brain lobe and neuromodulator tone, a [Brian2](https://brian2.readthedocs.io/) spiking neural network (SNN) is simulated, and a web UI visualizes activity on a 3D brain model.

**This is not medical software.** Outputs are for visualization and learning only, not diagnosis or treatment. The UI includes context for modeled stress-hormone axes (for example HPA / cortisol) as simulation metaphors, not clinical measurements.

## Screenshots

**Neural Activation Viewer** — scenario input, playback controls, and cognitive analysis (example: *Doing a heavy deadlift*).

<p align="center">
  <img src="docs/readme/screenshot-ui.png" alt="CogniGraph UI: scenario field, Simulate Activation, active lobe and neuromodulator readout" width="92%" />
</p>

**Simulation view** — colored lobe mesh, spike counters, HPA context, and event log after playback completes.

<p align="center">
  <img src="docs/readme/screenshot-simulation.png" alt="CogniGraph full window: 3D brain with lobe colors, sidebar with spike counts and log" width="92%" />
</p>

## Requirements

- Python 3.10+ recommended (3.x required)
- pip

Brian2 may need a C compiler on some platforms for full performance; see the [Brian2 installation docs](https://brian2.readthedocs.io/en/stable/introduction/install.html).

## Setup

```bash
cd Cognigraph
python -m venv .venv
# Windows: .venv\Scripts\activate
# Unix: source .venv/bin/activate
pip install -r requirements.txt
```

## Configuration

1. Copy `.env.example` to `.env` in the project root.
2. Set `OPENROUTER_API_KEY` from [OpenRouter](https://openrouter.ai/).
3. Optionally set `OPENROUTER_MODEL` (default in code: `x-ai/grok-4.1-fast`).

Never commit `.env`; it is listed in `.gitignore`.

## Run

From the repository root (with dependencies installed):

```bash
python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
```

Then open [http://127.0.0.1:8000](http://127.0.0.1:8000).

**Windows:** double-click `start-cognigraph.bat`, or use `Baslat-Cognigraph.bat` for Turkish messages.

## Tests

```bash
pytest
```

Configuration: [`pytest.ini`](pytest.ini), tests under [`tests/`](tests/).

## API

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/` | Serves the web UI (`frontend/index.html`). |
| `POST` | `/simulate` | Runs classification + SNN + returns spikes and VFX echo. |

**`POST /simulate`** JSON body:

| Field | Type | Description |
|-------|------|-------------|
| `prompt` | string | Scenario text (1–1000 characters). |

**Response** (simplified): `active_lobe`, `dominant_neuromodulator`, `neuromodulator_intensity`, `neuromodulator_rationale`, `explanation`, `duration_ms`, `spikes` (per-lobe spike indices and times), `snn_modulation`, `vfx_profile`.

If `OPENROUTER_API_KEY` is missing, the API returns **503** with a clear message.

Static files are mounted at `/static` from the `frontend/` directory.

## License

This project is licensed under the MIT License — see [`LICENSE`](LICENSE).
