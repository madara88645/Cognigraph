> **Read first:** [instructions.md](./instructions.md). Append performance learnings here after a verified fix — do not bulk-optimize from this file alone.

## 2026-05-16 - Simulation path is inherently slow

**Learning:** `/simulate` combines an OpenRouter LLM call with a Brian2 SNN run; sub-second responses are not realistic without changing product behavior.
**Action:** Optimize only measured bottlenecks (duplicate work inside `backend/`, redundant frontend polling). Do not strip error handling or user-visible progress for marginal gains.
