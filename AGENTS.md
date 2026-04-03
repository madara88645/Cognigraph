# AGENTS.md

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
- The `/simulate` endpoint requires an `OPENROUTER_API_KEY` env var (or `.env` file). Without it, the endpoint returns HTTP 503. Unit tests do **not** need the key.
- Brian2 SNN uses NumPy codegen (`b2.prefs.codegen.target = "numpy"`), so no C compiler is needed.
- The frontend is a single static HTML file (`frontend/index.html`) served by FastAPI; no JS build toolchain.
