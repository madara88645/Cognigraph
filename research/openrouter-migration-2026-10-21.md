# OpenRouter retirement migration — 21 October 2026

## Verified scope

Base inspected: `593fc0f9c17f41bbd4ea2b2069eb5aa5776dab89` (`master`). No existing open PR covered this migration.

| Reference | Role | Action |
| --- | --- | --- |
| `src/llm/openrouter.js` default and `LLM_MODELS` | Runtime Scenario request and Settings catalog | Replace GPT-4o mini with `openai/gpt-6-luna` |
| `llmStoredModel()` / `llmSetStoredModel()` | Browser preference persistence | Migrate only the eight exact notified ids; preserve all other choices and the key |
| `classifyWithOpenRouter()` | Actual optional OpenRouter call | Resolve stale explicit ids too; JSON object mode and 1,500-token ceiling retained |
| `src/llm/ask.js` | Actual optional OpenRouter call, shared selection/default | Same migration and Luna sampling policy; prose output and 400-token ceiling retained |
| `dist/index.html` | Deployed bundle (`vercel.json` serves `dist/`) | Rebuild from source |
| `tests/openrouter.test.mjs`, `tests/ask.test.mjs` | Mock request fixtures | Use a supported explicit alternative and pin the new default |
| `legacy/tests/` | Tests of archived pre-v2 backend | Left unchanged; not the deployed client-side request path |
| Root AGENTS / contributing instructions describing FastAPI | Historical architecture guidance | Actual README, build script, source and deployment config establish v2 behavior |

Both current network paths are optional and use the user's OpenRouter key. Neither calls the direct OpenAI API. The existence of a source dependency does not establish active users, traffic, or production deployment state.

## Exact retirement set

OpenRouter's service notice dated 19 October 2026 specifies 14 January 2027, including OpenRouter BYOK requests:

- `openai/gpt-4o`
- `openai/gpt-4o-2024-05-13`
- `openai/gpt-4o-2024-08-06`
- `openai/gpt-4o-2024-11-20`
- `openai/gpt-4o-mini`
- `openai/gpt-4o-mini-2024-07-18`
- `openai/gpt-4.1`
- `openai/gpt-4.1-mini`

No prefix matching and no extension to unannounced model ids. Existing other choices, including custom ids, keep their request model and sampling parameters. Migrated storage writes are best-effort; if reads work but writes are denied, the current request still uses Luna. Settings explains the change. Direct caller overrides receive the same model resolution, and results report the model actually requested.

## Alternatives checked

Prices are USD per million text tokens, input / output, from the Models API snapshot retrieved on 21 October 2026. They are not a quality benchmark or a provider bill.

| Model | Input / output | Format and behavior | Assessment |
| --- | --- | --- | --- |
| `openai/gpt-6-luna` | $0.10 / $0.50 | Text output; `response_format`, structured outputs, `max_tokens`; optional reasoning, supports `none`; no `temperature` | Selected. Same OpenAI family, below GPT-4o mini's $0.15 / $0.60 base rates. Omit temperature and request `reasoning.effort: none` for both short-budget calls. |
| `openai/gpt-5.6-luna` | $0.20 / $1.20 | Text/JSON support; optional reasoning; no temperature | Viable candidate with the same parameter adaptation, but more expensive than GPT-6 Luna. Not added to Settings. |
| `google/gemini-2.5-flash-lite` | $0.10 / $0.40 | Text/JSON/structured outputs; temperature supported; optional reasoning | Lower-output-price alternative. Different provider/model behavior; not automatically substituted. |
| `openai/gpt-5-mini` | $0.25 / $2.00 | JSON support; mandatory reasoning; no temperature | Poor fit for this narrowly scoped short-output migration without output-budget evaluation. |

Luna prices increase for prompts over the catalog's 272,000-token threshold. CogniGraph caps user input, context and output and does not submit prompts close to that size. Provider routing, cached input and service tiers can change billed prices. Do not infer latency or neuroscience/grounding quality from API metadata.

Sources:

- [Models API](https://openrouter.ai/api/v1/models)
- [GPT-6 Luna endpoints and supported parameters](https://openrouter.ai/api/v1/models/openai/gpt-6-luna/endpoints)
- [GPT-6 Luna](https://openrouter.ai/openai/gpt-6-luna)
- [GPT-5.6 Luna](https://openrouter.ai/openai/gpt-5.6-luna)
- [Gemini 2.5 Flash Lite](https://openrouter.ai/google/gemini-2.5-flash-lite)
- [Reasoning parameter](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens)

## Validation and remaining evidence

- `python3 build.py`: passed; regenerated the committed bundle.
- `node --test tests/*.test.mjs`: **235 passed, 0 failed**. Includes migration of all eight ids, idempotence, valid/custom choice preservation, key preservation, storage denial/quota behavior, both real request construction paths, existing output validation, and bundle syntax/shared-scope invariants.
- `node tests/smoke/smoke.mjs`: could not run the browser checks; the script requires macOS Google Chrome at `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`, unavailable in this Linux environment. No browser-rendering success claimed.
- No `OPENROUTER_API_KEY` was available. No paid completion or live output-quality/latency test was run. The PR remains draft pending an authenticated Scenario + grounded Ask smoke check.
- The AGENTS-linked Notion Agent Live State returned 404 through the available connection. This repository note is the handoff record; no Notion update is claimed.

For the next reviewer: use an OpenRouter key to check one six-step Scenario, one grounded Ask answer and the refusal case; verify complete JSON, finish reason, citation behavior, latency and actual usage. Review the diff and merge only after this evidence is satisfactory. No deployment or merge is part of this change.
