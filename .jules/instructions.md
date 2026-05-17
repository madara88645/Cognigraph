# Jules — CogniGraph

**Read before any task:** [AGENTS.md](../AGENTS.md).

## What `.jules/` is

| File | Role |
|------|------|
| `instructions.md` | **Authoritative** rules for Jules |
| `bolt.md` | Performance learnings (SNN, simulation, API latency) |
| `palette.md` | Frontend accessibility / UX (`frontend/js/`, static HTML) |
| `sentinel.md` | Security learnings (API keys, input validation) |

This folder was added so Jules has the same guardrails as other desktop projects. Journal files start minimal — append only after a **verified** fix in this repo.

## Architecture

- **Single Python app:** FastAPI in `backend/`, static ES modules in `frontend/js/` (no bundler).
- **Dev server:** `python3 -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload`
- **Tests:** `pytest` (no OpenRouter key required for unit tests).
- **LLM:** `/simulate` needs `OPENROUTER_API_KEY` or client `X-OpenRouter-Api-Key` (BYOK). Demo mode uses `OPENROUTER_DEMO_MODEL`.

## Hard rules

1. Use **`python3`**, not `python`, on PATH-sensitive environments.
2. **Brian2:** NumPy codegen only — do not require a C compiler for SNN paths.
3. **Simulation latency:** ~15–20s per `/simulate` is expected (LLM + SNN) — do not “optimize” by removing safety checks or user-visible error handling.
4. **Secrets:** Never commit or log API keys; respect header vs server env split documented in AGENTS.md.
5. **Scope:** Edit only files required for the current task; no cross-repo copy-paste from NeurIQ/VibeGraph journals.

## Verification

- `pytest`
- Manual smoke: start uvicorn, open `http://localhost:8000` if UI changed

## Appending learnings

```markdown
## YYYY-MM-DD - Short title
**Learning:** ...
**Action:** ...
```
