# AGENTS.md

## Jules (Google Labs)

Before autonomous tasks, read [.jules/instructions.md](.jules/instructions.md). Files in `.jules/` named `bolt`, `palette`, and `sentinel` are learning journals only—not a refactor backlog.

## Cursor Cloud specific instructions

### Overview

CogniGraph is a single-app Python project (FastAPI backend + static HTML frontend). No Node.js, Docker, or build step required.

### Commands

| Task | Command |
|------|---------|
| Install deps | `pip install -r requirements.txt` |
| Run tests | `pytest` (see `pytest.ini`; tests are in `tests/`) |
| Start dev server | `python3 -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload` |
| Access UI | `http://localhost:8000` |

### Gotchas

- Use `python3` (not `python`) — the VM only has `python3` on PATH.
- `pip install` puts scripts in `~/.local/bin`; ensure it is on `PATH` (`export PATH="$HOME/.local/bin:$PATH"`). This is pre-configured in `~/.bashrc`.
- The `/simulate` endpoint requires `OPENROUTER_API_KEY`. Without it, the endpoint returns HTTP 503. Unit tests do **not** need the key.
- Requests **without** `X-OpenRouter-Api-Key` use **`OPENROUTER_DEMO_MODEL`** (default `qwen/qwen3.5-flash-02-23`) and a neuroscientist-educator system prompt; BYOK requests use **`OPENROUTER_MODEL`**.
- When starting the dev server in a background shell, pass the key explicitly: `OPENROUTER_API_KEY="$OPENROUTER_API_KEY" python3 -m uvicorn ...` — background shells may not inherit env vars. Alternatively, write a `.env` file (the app loads it via a custom `_load_dotenv_file()` at startup, but only sets vars **not** already in `os.environ`).
- Brian2 SNN uses NumPy codegen (`b2.prefs.codegen.target = "numpy"`), so no C compiler is needed.
- The frontend is static `frontend/index.html` with ES modules in `frontend/js/` (no bundler), served via FastAPI `/` and `/static`.
- Simulation requests (`POST /simulate`) take ~15-20 seconds due to the LLM call + Brian2 SNN run.
