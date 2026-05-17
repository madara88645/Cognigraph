> **Read first:** [instructions.md](./instructions.md). Append UX/a11y learnings here after a verified fix in `frontend/`.

## 2026-05-16 - Static ES modules, no React tree

**Learning:** CogniGraph uses vanilla JS modules (`frontend/js/*.js`) served as static assets — patterns from React repos (e.g. `React.memo`, `aria-live` on component libraries) must be translated to DOM APIs.
**Action:** Prefer native semantics (`button`, `label[for]`, `aria-live` on notification containers) and test with keyboard + screen reader when changing `ui.js`, `toast.js`, or `main.js`.
