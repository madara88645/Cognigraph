# CogniGraph v2 (codename NeuroScope) — module contracts & working rules

Read this before touching anything. The orchestrator owns the skeleton; two workers own disjoint files.
The deliverable is ONE file: `dist/index.html`, produced by `python3 build.py` from `src/`.

## Build model (why the code looks the way it does)
- `build.py` concatenates `src/head.html` → `<style>` (all `src/styles/*.css`, sorted) → `src/body.html`
  → one `<script type="module">` containing `lib/*.js, data/*.js, brain/*.js, ui/*.js, modes/*.js, main.js` (sorted inside each dir).
- Source files are real ES modules (`export`, relative `import`) so `node --test` can import the pure ones.
  At build time local imports are dropped and `export ` is stripped: **everything shares one scope**.
  Consequences: (1) no two files may declare the same top-level name; prefix private helpers
  (e.g. `atlasRenderList`, `nsimStep`). (2) **No top-level side effects** anywhere except `main.js`
  (no DOM access, no `new THREE.*` at top level; do it inside functions). (3) Only `main.js` may
  `import` CDN modules for orchestration; feature files may `import * as THREE from 'three'` and
  `three/addons/...` — those imports are hoisted and de-duplicated.
- CDN allowlist (Artifact sandbox CSP): scripts only from `cdn.jsdelivr.net/npm/` (three@0.170.0 core+addons, already in the importmap)
  and `cdnjs.cloudflare.com`; fonts from Google Fonts. **No other hosts, no external images/GLB/JSON/fetch.** Inline everything else.
- `dist/index.html` is body-only (no doctype/html/head/body) because the Artifact host wraps it. It still opens from `file://`.

## File ownership (hard rule — edit only your files; ask the orchestrator for skeleton changes)
| Owner | Files |
|---|---|
| Orchestrator | `build.py`, `src/head.html`, `src/body.html`, `src/styles/00-base.css`, `src/main.js`, `src/ui/panels.js`, `tests/build.test.mjs`, `tests/data-counts.test.mjs`, `CONTRACTS.md`, `tools/` |
| Worker A — brain & atlas | `src/lib/noise.js`, `src/brain/geometry.js`, `src/brain/parcellation.js`, `src/brain/scene.js`, `src/modes/atlas.js`, `src/styles/10-brain.css`, `src/styles/11-atlas.css`, `tests/noise.test.mjs`, `tests/parcellation.test.mjs`, `tests/scene-contract.test.mjs` |
| Worker B — content, pathways, neurons, scenario | `src/data/*.js`, `src/ui/glossary.js`, `src/modes/pathways.js`, `src/modes/neurons-core.js`, `src/modes/neurons-ui.js`, `src/modes/scenario.js`, `src/llm/*.js`, `src/data/howitworks.js`, `src/styles/20-pathways.css`, `src/styles/30-neurons.css`, `src/styles/40-scenario.css`, `tests/glossary.test.mjs`, `tests/neurons-core.test.mjs`, `tests/pathways-data.test.mjs`, `tests/classify-local.test.mjs`, `tests/openrouter.test.mjs` |

Body DOM ids you may use (defined in `src/body.html`, do not add ids to the skeleton — create your own elements inside your containers):
`#stage` (WebGL canvas) · `#side-panel-body` (mode controls, via `setSidePanel`) · `#explain-*` (via `explain`) · `#timeline`, `#timeline-track`, `#timeline-readout`, `#tl-prev/#tl-play/#tl-next` (Pathways) · `#neuron-plots`, `#plot-raster/#plot-trace/#plot-rate/#plot-phase` (Neurons) · `#glossary-popover`, `#gp-term/#gp-def/#gp-more` (glossary) · `#hover-label` (via `hoverLabel`) · `#cortex-opacity`, `#reset-view`, `#quality-toggle` (wired by panels.js → scene API).

CSS: the base stylesheet already provides `.glass, .list, .list-item(.active), .dot, .search, .toggle-row, .slider-row, .badge(.ok/.mid/.low), .note, .muted, .kv, .text-btn(.primary/.active), .icon-btn, .mono, .term`. Mode accent is `var(--accent)` (switches with `#app[data-mode]`). Add only mode-specific rules in your own CSS file. Dark theme only; never use pure grey — tokens are in `:root`.

## Scene API — `createScene(canvas, {quality}) → Promise<scene>` (Worker A implements; a placeholder already satisfies it)
```
scene.THREE, scene.renderer, scene.camera, scene.scene, scene.controls   // escape hatches
scene.regionIds: string[]                       // every REGIONS id present in 3D (must be all 28)
scene.centroid(id) -> THREE.Vector3             // world-space centre (paired structures: midpoint or dominant side)
scene.highlight(id, weight=1, colorHex)         // set target glow (smoothed internally); weight 0 clears that id
scene.clearHighlights()
scene.setLesion(id, on) / scene.clearLesions()  // grey + dim the structure/patch
scene.flyTo(id | Vector3, {distance, duration}) // eased camera move; never snaps
scene.resetView()
scene.setCortexOpacity(0..1)                    // cortex shell; subcortical stays opaque
scene.setQuality('auto'|'high'|'low')           // bloom / transmission gating, DPR cap ≤ 1.5
scene.onPick(cb(id|null, {x,y}))                // click (not drag). id is a REGIONS id or null
scene.onHover(cb(id|null, {x,y}))               // pointermove; cheap (throttled raycast ok)
scene.pulse(fromId, toId, {color, duration}) -> Promise   // one traveling particle along a curve between centroids
scene.addOverlay(obj3d) / scene.removeOverlay(obj3d)      // modes may add custom objects (Neurons uses this)
scene.setIdleRotate(on)                          // slow camera drift when idle (default on); Pathways turns it off while playing
scene.update(dt) ; scene.render()               // called every frame by main.js
```
Cortical regions are patches on the hemisphere mesh (per-vertex regionId), not separate meshes; picking must still resolve to a REGIONS id. Regions that are not in the parcellation resolve to `null` (hover shows nothing).

## Mode API (each `modes/*.js` exports one object; `main.js` registers `AtlasMode`, `PathwaysMode`, `NeuronsMode`)
```
{ id, label, accent /*hex number*/,
  enter(app), exit(app),               // exit must remove overlays, stop timers, hide its chrome
  update(dt, app),                     // per frame
  onPick(id, app, pos), onHover(id, app, pos),
  onKey(e, app) -> bool }              // return true if handled (main calls preventDefault)
```
`app` = `{ scene, mode, modes, selection, lesions:Set, quality, time }`. Modes must not touch each other's state.

## UI helpers (`src/ui/panels.js`, orchestrator-owned)
`explain({title, html, badge, badgeClass})` · `setSidePanel(htmlOrElement) -> body element` · `showTimeline(bool)` · `showNeuronPlots(bool)`
· `toast(msg)` · `registerDrawerTab(id, label, html)` (add "How this works" tabs; Worker B registers Timing model / Neuron equations / Metaphor vs physiology / Glossary; Worker A registers Rendering) · `openDrawer(tabId)` · `hoverLabel(text|null, pos)`.
`explain()` and `openDrawer()` pass HTML through `linkTerms(html)` if it exists (Worker B).

## Glossary contract (`src/ui/glossary.js`, Worker B)
`linkTerms(html) -> html` wraps glossary terms in `<span class="term" data-term="...">` (longest-match-first, word-boundary,
case-insensitive, never inside tags/attributes or an existing `.term`, idempotent). `initGlossary(app)` delegates clicks on `.term`
to the popover `#glossary-popover` (position near the click, flip at viewport edges, close on outside click/Escape), and `#gp-more` opens the drawer glossary tab.

## Data (`src/data/*.js`, Worker B edits; shapes are fixed)
`REGIONS[28]` `{id,name,group,one_liner,functions[],key_connections[],lesion_effects,famous_case_or_evidence?,approx_location}`
`PATHWAYS[8]` `{id,title,scenario_sentence,steps[{region_ids[],approx_ms,what_happens,why_it_matters,evidence_or_method?}],accuracy_caveats?}`
`GLOSSARY[40+]` `{term,plain_definition}` · `NEUROMOD_DEFS[6]` `{modulator,parameter_effect,plain_explanation,confidence}` ·
`NEURON_PRESETS{RS,IB,CH,FS,LTS,TC}` `{name,a,b,c,d,note}` · `ACCURACY_PITFALLS[13+]` · `NEURON_MODEL{...}`.
Worker A may READ data files, never edit them. `tests/data-counts.test.mjs` asserts the counts.

## Phase 2 additions — Scenario mode (CogniGraph v2)
- 4th mode `scenario` (pill exists in body.html, key `4`, accent `--accent-scenario`). Bundle order now: lib, data, llm, brain, ui, modes, main.
- `src/llm/classify-local.js`: `classifyLocal(text) -> ScenarioResult` (pure, deterministic, no key).
- `src/llm/openrouter.js`: `classifyWithOpenRouter(text, {key, model, fetchImpl}) -> Promise<ScenarioResult>`; `validateScenarioResult(raw) -> ScenarioResult` (hardening: unknown region ids dropped, numbers clamped 0..1, missing fields defaulted, never throws on bad JSON — returns `{ok:false, reason}`). Key/model live ONLY in localStorage (`cg.openrouter.key`, `cg.openrouter.model`); never logged, never sent anywhere but `https://openrouter.ai/api/v1/chat/completions`.
- `ScenarioResult = { ok, source:'llm'|'local', title, steps:[{region_ids[], what_happens, why_it_matters, approx_ms|null}], neuromodulators:{dopamine,acetylcholine,noradrenaline,serotonin,gaba,cortisol}, intensity, rationale, confidence, model? }`.
- Pathways must export `pwPlayExternal(pathwayLike)` (plays a PATHWAYS-shaped object without adding it to the list); Neurons must export `nsApplyModulators(profile)` (sets the six sliders + params and refreshes the UI).
- Honesty: results carry `.badge.low` "LLM-generated, not evidence" (or "Local heuristic") in the Explain panel; rationale shown verbatim.
- In the Artifact sandbox `fetch` to OpenRouter is blocked by CSP: detect the failure and explain that Scenario needs the hosted version or the local file; local heuristic still works there.

## Phase 3 — one connected system (decided 2026-09-06; features chosen by Mehmet)
Bundle order now: lib, data, llm, lab, learn, brain, ui, modes, main. New pill `learn` (key 5, accent `--accent-learn`), containers `#ask-panel` (bottom-right, hidden) and `#lab-overlay` (full-stage overlay, hidden). `window.switchMode(id)` exists.
Shared state on `app`: `app.lesions:Set<regionId>` (Atlas writes) · `app.modulators` {dopamine, acetylcholine, noradrenaline, serotonin, gaba, cortisol} 0..1 (Neurons + Scenario write, Pathways reads; defaults in main.js) · `app.measure` (lab writes, e.g. `measure.stroop`).
| Owner | Files |
|---|---|
| Worker P — pathways system | `src/modes/pathways.js`, `src/data/pathways.js` (add `evidence_tier` per step: 'human_direct' \| 'animal_inferred' \| 'estimated', with a one-line `tier_reason`), `src/data/modulation.js` (new: which steps speed up/slow down under which modulator, direction + honesty), `src/lab/stroop.js` (new), `src/styles/20-pathways.css`, `src/styles/70-lab.css`, tests for these |
| Worker Q — scenario / neurons / learn / ask | `src/modes/scenario.js`, `src/modes/neurons-ui.js`, `src/llm/*.js` (incl. new `ask.js`), `src/learn/*.js` (new: `quiz.js` question generation, `leitner.js` pure scheduler), `src/modes/learn.js`, `src/ui/ask.js` (new), `src/styles/40-scenario.css`, `src/styles/30-neurons.css`, `src/styles/50-learn.css`, `src/styles/60-ask.css`, tests for these |
Features: (1) lesions break pathway steps with the region's real deficit text; (2) modulators scale step timing with a "direction only" badge; (3) Scenario respects lesions (local + LLM prompt); (4) hypothesis card in Neurons after Send-to-Neurons: predicted vs observed; (5) Stroop task → `app.measure.stroop` shown beside group-average ms; (6) Learn mode: quiz from data + Leitner boxes in localStorage; (7) evidence tier badges on timeline markers and step cards; (8) grounded LLM "Ask about this" (key-gated) citing record ids, ungrounded answers flagged.

## Verification rules (both workers)
- `python3 build.py && node --test 'tests/*.test.mjs'` must pass before you report.
- Browser: the dev server `neuroscope` (port 8765, serves `dist/`) is started with `preview_start {name:"neuroscope"}` (reused if running).
  **Create your own tab** (`tabs_create`) and pass its `tabId` on every browser call; never touch other tabs. The pane may be hidden:
  take a `screenshot` (any scale) before clicking so the viewport has a size. `window.NeuroScope` exposes `app` for checks
  (e.g. `NeuroScope.scene.centroid('ffa').project(NeuroScope.scene.camera)` to find a region on screen).
- Zero console errors is the bar. Report the exact console output if not.
- Do NOT `git commit`, do not run `preview_stop`, do not edit files outside your ownership, do not add CDN hosts.
- Report back: files touched, what works (with evidence), what does not, anything you need from the skeleton.
