> **Read first:** [instructions.md](./instructions.md). Append security learnings here after a verified fix.

## 2026-05-16 - API key handling (server vs BYOK)

**Learning:** The backend accepts optional `X-OpenRouter-Api-Key` for bring-your-own-key while server env provides demo/production defaults — keys must never be logged or echoed in error JSON.
**Action:** When touching `backend/main.py` or settings UI, redact keys in logs, avoid returning key material in responses, and keep demo vs BYOK model selection aligned with AGENTS.md.
