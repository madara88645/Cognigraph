# AGENTS.md

## Agent Memory (Notion)

This project uses Notion-based shared memory. Read before starting, write when finishing.

**On session start — READ:**
- Fetch Agent Live State: https://www.notion.so/373e0ffe8d2281888adef713bda70112
- Understand: current status, open tasks, last decision context, handoff note from previous agent.

**During session — WRITE (when relevant):**
- Key architectural decisions → add a row to Agent Log (type: decision)
- Leaving for another agent → add a row (type: handoff, required on incomplete work)
- Technical findings worth preserving → add a row (type: research)

**On session end — WRITE:**
- Update the "For next agent" section in Agent Live State
- If using Claude Code: Stop hook handles this automatically.
- Other tools: run `python "C:\Users\User\.claude\notion-memory-hook.py"`

NOTION_PROJECT_ID=325e0ffe8d228087aea7c2d88834c586
NOTION_LIVE_STATE_ID=373e0ffe8d2281888adef713bda70112
NOTION_LOG_DB_ID=88468cbb722348858ef8eb45a61cdf9b
NOTION_MEMO_ID=373e0ffe8d22817ab715f3a9ebfdd1e3

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
- Requests **without** `X-OpenRouter-Api-Key` use **`OPENROUTER_DEMO_MODEL`** (default `deepseek/deepseek-v4-flash`) and a neuroscientist-educator system prompt; BYOK requests use **`OPENROUTER_MODEL`**.
- When starting the dev server in a background shell, pass the key explicitly: `OPENROUTER_API_KEY="$OPENROUTER_API_KEY" python3 -m uvicorn ...` — background shells may not inherit env vars. Alternatively, write a `.env` file (the app loads it via a custom `_load_dotenv_file()` at startup, but only sets vars **not** already in `os.environ`).
- Brian2 SNN uses NumPy codegen (`b2.prefs.codegen.target = "numpy"`), so no C compiler is needed.
- The frontend is static `frontend/index.html` with ES modules in `frontend/js/` (no bundler), served via FastAPI `/` and `/static`.
- Simulation requests (`POST /simulate`) take ~15-20 seconds due to the LLM call + Brian2 SNN run.

## Proje Özel Subagent'ları (Subagents)

Bu projede işlerin kalitesini artırmak ve paralel/odaklanmış geliştirme yapmak için 3 adet özel subagent tanımlanmıştır. Bu ajanlar `docs/subagents/` dizini altında belgelenmiştir:

1. **`backend_engineer`**: FastAPI backend, Python kodları, Brian2 SNN simülasyon mantığı ve pytest birim testlerinden sorumludur.
2. **`frontend_developer`**: HTML, CSS ve Three.js (ES modülleri) kullanan premium 3D beyin görselleştirme ve modern web arayüzlerinden sorumludur.
3. **`qa_engineer`**: Kod kalitesi, test kapsama alanı, entegrasyon testleri ve API uç noktası doğrulamalarından sorumludur.
