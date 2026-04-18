# Contributing

## Setup

Same as the main [README](README.md): Python 3.10+, `pip install -r requirements.txt`, copy `.env.example` to `.env` if you use OpenRouter locally.

Run the API:

```bash
python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
```

Open [http://127.0.0.1:8000](http://127.0.0.1:8000).

## Layout

| Path | Role |
|------|------|
| [backend/main.py](backend/main.py) | FastAPI app, `/simulate`, `run_snn`, static mount |
| [backend/neuromodulation.py](backend/neuromodulation.py) | LLM payload validation, Brian2 params, VFX echo |
| [frontend/index.html](frontend/index.html) | Page shell, import map, Tailwind + Tween scripts |
| [frontend/styles.css](frontend/styles.css) | App-specific CSS |
| [frontend/js/main.js](frontend/js/main.js) | App entry: Three.js scene, UI wiring, playback |
| [frontend/js/constants.js](frontend/js/constants.js) | Lobe colors, glow constants, `REQUEST_TIMEOUT_MS` |
| [frontend/js/brain.js](frontend/js/brain.js) | Brain.glb loading |
| [frontend/js/simulation.js](frontend/js/simulation.js) | `POST /simulate`, validation, toasts on errors |
| [frontend/js/timeline.js](frontend/js/timeline.js) | Timeline frame label helper |
| [frontend/js/ui.js](frontend/js/ui.js) | VFX merge helpers, color utilities |
| [frontend/js/apiSettings.js](frontend/js/apiSettings.js) | localStorage for API key/model |
| [frontend/js/toast.js](frontend/js/toast.js) | Toast notifications |
| [tests/](tests/) | `pytest` |

New JS modules load from `/static/js/...` (see `StaticFiles` mount in `backend/main.py`). Add an `import` in `main.js` or another module; keep the import map in `index.html` for `three` and `three/addons/`.

## Tests and quality

```bash
pytest
ruff check .
black --check .
mypy backend tests
```

Ruff and Black run in CI and via [pre-commit](.pre-commit-config.yaml) (`pre-commit install`, then `pre-commit run --all-files`).

## Cursor Cloud

For agent-specific VM quirks (`python3`, PATH, background shells), see [AGENTS.md](AGENTS.md).
