// Scenario mode (Worker B): describe a moment in plain English, get a region-by-region replay and a
// neuromodulator profile back.
//
// Two engines behind one button. With no key it is `classifyLocal()` — a keyword heuristic that is
// honest about being one. With the user's own OpenRouter key it asks a model, hardens whatever comes
// back, and falls back to the heuristic out loud on any failure. Playback borrows the Pathways
// sequencer via pwPlayExternal(); "Send to Neurons" hands the profile to nsApplyModulators().
//
// The key never leaves localStorage except in the Authorization header of the one POST to
// openrouter.ai, and that POST is the only network call this app ever makes.
import { REGIONS } from '../data/regions.js';
import { registerHowTabs } from '../data/howitworks.js';
import { classifyLocal, llmDetectSensitive, LLM_MODULATORS, LLM_BASELINE } from '../llm/classify-local.js';
import { askScenarioRecord } from '../llm/ask.js';
import { askSetContext, askMount, askRefresh } from '../ui/ask.js';
import { classifyWithOpenRouter, llmStoredKey, llmSetStoredKey, llmStoredModel, llmSetStoredModel, llmMaskKey, LLM_MODELS } from '../llm/openrouter.js';
import { PathwaysMode, pwPlayExternal, pwStopExternal } from './pathways.js';
import { nsApplyModulators, nsSetHypothesis } from './neurons-ui.js';
import { explain, setSidePanel, registerDrawerTab, openDrawer, toast, showTimeline, hoverLabel } from '../ui/panels.js';

const SC_ACCENT = 0xf28b74;
const SC_TIMEOUT_MS = 20000;
const SC_MAX_INPUT = 1200;
const SC_SETTINGS_TAB = 'scenario-settings';
const SC_SETTINGS_LABEL = 'Settings';   // the drawer has 8 tabs; a two-word label wraps them to 3 rows
const SC_MAX_STEPS = 6;                 // mirrors LLM_MAX_STEPS in openrouter.js, for the copy only

/** The six preset moments the first CogniGraph shipped with, brought back as one-click examples. */
const SC_PRESETS = [
  { id: 'exam', emoji: '🎓', label: 'Academic Exam Stress', text: 'Struggling to remember answers during a high-stakes final exam under extreme time pressure.' },
  { id: 'focus', emoji: '💻', label: 'Deep Focus Study Session', text: 'Engrossed in writing a complex software algorithm, completely in the zone and ignoring distractions.' },
  { id: 'creative', emoji: '🎨', label: 'Creative Brainstorming', text: 'Generating a flood of novel ideas for a new sci-fi story, jumping from concept to concept.' },
  { id: 'speaking', emoji: '🎤', label: 'Public Speaking Anxiety', text: 'Stepping onto a stage in front of a thousand people, feeling a sudden surge of stage fright.' },
  { id: 'gaming', emoji: '🎮', label: 'Competitive Gaming Focus', text: 'Playing a fast-paced multiplayer match, tracking multiple opponents and making split-second tactical decisions.' },
  { id: 'campfire', emoji: '🔥', label: 'Social Campfire', text: 'Engaging in warm, relaxed storytelling with close friends around a campfire.' },
];

const SC_MOD_LABELS = {
  dopamine: 'Dopamine', acetylcholine: 'Acetylcholine', noradrenaline: 'Noradrenaline',
  serotonin: 'Serotonin', gaba: 'GABA tone', cortisol: 'Cortisol / stress',
};

const SC_CAVEATS = 'Assembled for one typed sentence, not measured. Treat the order as a sketch and any '
  + 'millisecond value as borrowed from lab group averages.';

const sc = {
  app: null,
  result: null,       // last ScenarioResult shown
  lastText: '',
  note: '',           // the line under the result explaining how it was produced
  status: null,       // {kind, model, reason}
  ctl: null,          // AbortController of the in-flight request
  timer: 0,
  replaying: false,
  listeners: [],
  wired: false,       // settings delegation is installed once and left in place
};

/* ---------- small helpers ---------- */

function scEl(id) { return document.getElementById(id); }

/** Quotes are escaped too: LLM text lands in `title="…"` attributes, where a bare " would break out. */
function scEsc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function scOn(el, type, fn) {
  if (!el) return;
  el.addEventListener(type, fn);
  sc.listeners.push({ el, type, fn });
}

function scOffAll() {
  for (const l of sc.listeners) l.el.removeEventListener(l.type, l.fn);
  sc.listeners.length = 0;
}

function scRegionName(id) {
  const r = REGIONS.find((x) => x.id === id);
  return r ? r.name : id;
}

function scShortName(id) {
  const r = REGIONS.find((x) => x.id === id);
  if (!r) return id;
  const paren = r.name.match(/\(([^()]{1,12})\)\s*$/);
  if (paren) return paren[1];
  return r.name.replace(/\s*\([^()]*\)\s*$/, '').replace(/ Cortex$/, '');
}

/** True when the page is running inside a sandbox we already know blocks outbound fetch. */
function scSandboxed() {
  try {
    if (typeof location === 'undefined' || !location) return false;
    const h = String(location.hostname || '');
    return h === 'claude.ai' || h.endsWith('.claude.ai') || h.endsWith('claudeusercontent.com');
  } catch (err) { return false; }
}

/* ---------- side panel ---------- */

function scRenderPanel() {
  const chips = SC_PRESETS.map((p) => `
    <button class="sc-chip" type="button" data-preset="${scEsc(p.id)}" title="${scEsc(p.text)}">
      <span class="sc-chip-emoji" aria-hidden="true">${p.emoji}</span>${scEsc(p.label)}
    </button>`).join('');

  const body = setSidePanel(`
    <div class="panel-title">Scenario</div>
    <div class="panel-sub">Describe a moment. The brain replays a plausible version of it.</div>
    <textarea id="sc-input" class="search sc-input" rows="3" maxlength="${SC_MAX_INPUT}"
      placeholder="e.g. I walked into the exam hall and my mind went blank."></textarea>
    <div class="sc-runrow">
      <button class="text-btn primary" id="sc-run" type="button">Run</button>
      <span class="sc-hint mono">⌘/Ctrl + ↵</span>
    </div>
    <div class="sc-status" id="sc-status"></div>

    <h3>Examples</h3>
    <div class="sc-chips">${chips}</div>

    <h3>Language model</h3>
    <div class="sc-settings-row">
      <button class="text-btn" id="sc-settings" type="button">Settings</button>
      <span class="muted" id="sc-keystate"></span>
    </div>`);

  const input = scEl('sc-input');
  if (input) {
    input.value = sc.lastText || '';
    scOn(input, 'keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'Enter' || e.key === 'NumpadEnter')) {
        e.preventDefault();
        scRun(input.value);
      }
      e.stopPropagation();   // 1-4 and space belong to the textarea while it has focus
    });
  }
  scOn(scEl('sc-run'), 'click', () => scRun(scEl('sc-input') ? scEl('sc-input').value : ''));
  scOn(scEl('sc-settings'), 'click', () => scOpenSettings());
  body.querySelectorAll('.sc-chip').forEach((el) => {
    scOn(el, 'click', () => {
      const p = SC_PRESETS.find((x) => x.id === el.dataset.preset);
      if (!p) return;
      const box = scEl('sc-input');
      if (box) box.value = p.text;
      sc.lastText = p.text;
      scRun(p.text);
    });
  });

  scPaintStatus();
}

/** The one line under the Run button that always says which engine produced (or will produce) a result. */
function scPaintStatus() {
  const el = scEl('sc-status');
  const keyEl = scEl('sc-keystate');
  const key = llmStoredKey();
  const model = llmStoredModel();
  if (keyEl) keyEl.textContent = key ? 'key ' + llmMaskKey(key) : 'no key stored';
  if (!el) return;

  const st = sc.status || { kind: key ? 'ready-llm' : 'ready-local' };
  const model_ = st.model || model;
  if (st.kind === 'running') {
    el.className = 'sc-status sc-running';
    el.innerHTML = `<span class="sc-spinner" aria-hidden="true"></span>Asking <span class="mono">${scEsc(model_)}</span>… <span class="muted">up to 20 s</span>`;
    return;
  }
  if (st.kind === 'llm') {
    el.className = 'sc-status sc-ok';
    el.innerHTML = `<span class="sc-dot"></span>OpenRouter · <span class="mono">${scEsc(model_)}</span>`;
    return;
  }
  if (st.kind === 'fallback') {
    el.className = 'sc-status sc-warn';
    el.innerHTML = `<span class="sc-dot"></span>Local heuristic — the LLM call did not go through. <span class="muted">${scEsc(st.reason || '')}</span>`;
    return;
  }
  if (st.kind === 'not-run') {
    el.className = 'sc-status sc-warn';
    el.innerHTML = `<span class="sc-dot"></span>Not run. <span class="muted">Nothing was sent anywhere.</span>`;
    return;
  }
  if (st.kind === 'local') {
    el.className = 'sc-status';
    el.innerHTML = `<span class="sc-dot"></span>Local heuristic · no key needed`;
    return;
  }
  if (st.kind === 'ready-llm') {
    el.className = 'sc-status';
    el.innerHTML = `<span class="sc-dot"></span>Ready · OpenRouter · <span class="mono">${scEsc(model_)}</span>`;
    return;
  }
  el.className = 'sc-status';
  el.innerHTML = `<span class="sc-dot"></span>Local heuristic. <span class="muted">An OpenRouter key in Settings unlocks the LLM path.</span>`;
}

function scSetStatus(kind, extra) {
  sc.status = Object.assign({ kind }, extra || {});
  scPaintStatus();
}

/* ---------- result card ---------- */

/** One closed disclosure, so the detail is reachable without being on screen by default. */
function scFold(summary, inner) {
  return `<details class="sc-fold"><summary>${scEsc(summary)}</summary>${inner}</details>`;
}

function scBars(profile) {
  return `<div class="sc-bars">` + LLM_MODULATORS.map((k) => {
    const v = typeof profile[k] === 'number' ? profile[k] : LLM_BASELINE[k];
    const base = LLM_BASELINE[k];
    const above = v >= base;
    return `<div class="sc-bar${above ? '' : ' sc-bar-down'}">
      <span class="sc-bar-name">${scEsc(SC_MOD_LABELS[k] || k)}</span>
      <span class="sc-bar-track"><i style="width:${Math.round(v * 100)}%"></i><b style="left:${Math.round(base * 100)}%"></b></span>
      <span class="sc-bar-val mono">${v.toFixed(2)}</span>
    </div>`;
  }).join('') + `</div>`;
}

/** First sentence only. The rest of a long step stays on the element as a tooltip, not on screen. */
function scFirstSentence(text) {
  const t = String(text || '').trim();
  const m = t.match(/^[\s\S]*?[.!?](?=\s|$)/);
  const first = m ? m[0].trim() : t;
  return (first.length >= 20 || !t) ? first : t;
}

/**
 * One line per broken step, in the step's own row. The step is kept, not removed: a sequence with a
 * hole in it is the honest picture of what a lesion does to a story, and deleting the step would show
 * a chain that still works.
 */
function scBrokenHtml(s) {
  const ids = Array.isArray(s.broken_ids) ? s.broken_ids : [];
  if (!s.broken || !ids.length) return '';
  const names = ids.map(scShortName).join(' and ');
  const verb = ids.length === 1 ? 'is' : 'are';
  return `<span class="sc-step-broken">Broken: ${scEsc(names)} ${verb} lesioned in Atlas</span>`;
}

function scStepsHtml(result) {
  return `<ol class="sc-steps" id="sc-steps">` + result.steps.map((s, i) => {
    const names = s.region_ids.map(scShortName).join(' + ');
    const ms = (typeof s.approx_ms === 'number') ? '~' + s.approx_ms + ' ms' : 'order only';
    const what = scFirstSentence(s.what_happens);
    const full = [s.what_happens, s.why_it_matters].filter(Boolean).join('\n\n');
    return `<li data-i="${i}"${i === 0 ? ' class="active"' : ''}${s.broken ? ' data-broken="1"' : ''} title="${scEsc(full)}" role="button" tabindex="0">
      <span class="sc-step-head">
        <span class="sc-step-n mono">${i + 1}</span>
        <span class="sc-step-regions">${scEsc(names)}</span>
        <span class="sc-step-ms mono">${scEsc(ms)}</span>
      </span>
      ${scBrokenHtml(s)}
      <span class="sc-step-what">${scEsc(what)}</span>
    </li>`;
  }).join('') + `</ol>`;
}

/** The one-line summary above the list when the Atlas has regions switched off. */
function scLesionNoteHtml(result) {
  const ids = Array.isArray(result.lesioned) ? result.lesioned : [];
  if (!ids.length) return '';
  const n = result.steps.filter((s) => s.broken).length;
  return `<div class="note sc-lesion-note">${n === 1 ? 'One step runs' : n + ' steps run'} through
    ${scEsc(ids.map(scShortName).join(', '))}, which ${ids.length === 1 ? 'is' : 'are'} lesioned in Atlas.
    The steps are kept and marked; the neuromodulator profile is not adjusted, because nothing here models that.</div>`;
}

/**
 * A replay owns the timeline, the highlights and the onPick routing, and all three point at the
 * pathway that was playing. Anything that replaces the result must stop it first, or the timeline
 * keeps scrubbing the previous scenario while the card shows a new one.
 */
function scStopReplay() {
  if (!sc.replaying) return;
  pwStopExternal();
  sc.replaying = false;
}

/**
 * What the hardening layer changed, said precisely. Hitting the six-step cap is this app's rule and
 * nothing is wrong with the reply; a malformed step is the model's fault. The old copy called both
 * "unusable", which read as if the model had failed whenever a long answer came back.
 */
function scDroppedHtml(d) {
  if (!d) return '';
  const parts = [];
  if (d.region_ids) parts.push('removed ' + d.region_ids + ' unrecognised region id' + (d.region_ids === 1 ? '' : 's'));
  if (d.capped) parts.push('kept the first ' + SC_MAX_STEPS + ' steps');
  if (d.malformed) parts.push('removed ' + d.malformed + ' malformed step' + (d.malformed === 1 ? '' : 's'));
  if (!parts.length) return '';
  const list = parts.length === 1 ? parts[0]
    : parts.slice(0, -1).join(', ') + ' and ' + parts[parts.length - 1];
  return `<p class="muted">Hardening ${scEsc(list)} from the model's reply.</p>`;
}

function scShowResult(result, note) {
  scStopReplay();
  sc.result = result;
  if (typeof note === 'string') sc.note = note;
  const llm = result.source === 'llm';
  const conf = typeof result.confidence === 'number' ? result.confidence.toFixed(2) : '—';
  const intensity = typeof result.intensity === 'number' ? result.intensity.toFixed(2) : '—';
  const meta = [
    llm ? 'OpenRouter' : 'Local heuristic',
    result.model ? result.model : null,
    'confidence ' + conf,
    'intensity ' + intensity,
  ].filter(Boolean).map(scEsc).join(' · ');
  const dropped = scDroppedHtml(result.dropped);
  const screened = (result.screened && result.screened.flagged)
    ? `<div class="note">The wording drifted toward diagnosis or advice. Read it as a story about
       mechanisms only.</div>`
    : '';

  explain({
    title: result.title || 'Your scenario',
    badge: llm ? 'LLM-generated, not evidence' : 'Local heuristic, not evidence',
    badgeClass: 'low',
    html: `
      ${sc.lastText ? `<p class="sc-quote">${scEsc(sc.lastText)}</p>` : ''}
      <div class="sc-actions">
        <button class="text-btn primary" id="sc-replay" type="button">Replay on the brain</button>
        <button class="text-btn" id="sc-neurons" type="button">Send to Neurons</button>
      </div>
      ${scLesionNoteHtml(result)}
      ${scStepsHtml(result)}
      <h4 class="sc-h4">Neuromodulator profile</h4>
      ${scBars(result.neuromodulators)}
      <p class="muted sc-bar-legend">Past the tick = more in play than usual, not a dose.</p>
      <details class="sc-fold">
        <summary>Why these regions</summary>
        <p class="sc-rationale">${scEsc(result.rationale || '(no rationale returned)')}</p>
        ${sc.note ? `<p class="muted">${scEsc(sc.note)}</p>` : ''}
        ${dropped}
        <p class="muted sc-meta">${meta}</p>
      </details>
      ${screened}
      <div class="note">${llm
        ? 'A language model wrote this: a plausible narrative, not a reading of anyone\'s brain. Only the region ids were checked.'
        : 'Keyword matching, not understanding: it notices words and picks the nearest built-in pathway.'}</div>`,
  });

  if (typeof askSetContext === 'function') {
    askSetContext({ label: result.title || 'This scenario', records: [askScenarioRecord(result)].filter(Boolean) });
  }

  scOn(scEl('sc-replay'), 'click', scReplay);
  scOn(scEl('sc-neurons'), 'click', scToNeurons);
  // Only the open step shows its sentence, so the list stays a list; clicking another one opens it.
  const list = scEl('sc-steps');
  if (list) {
    const pick = (el) => { const i = parseInt(el.dataset.i, 10); if (isFinite(i)) scMarkStep(i); };
    scOn(list, 'click', (e) => { const li = e.target.closest ? e.target.closest('li[data-i]') : null; if (li) pick(li); });
    scOn(list, 'keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const li = e.target.closest ? e.target.closest('li[data-i]') : null;
      if (li) { e.preventDefault(); pick(li); }
    });
  }
}

function scIntro() {
  explain({
    title: 'Turn a moment into a sequence',
    badge: 'plausible narrative, not evidence',
    badgeClass: 'low',
    html: `
      <p>Type a moment on the left, or pick an example. You get an ordered list of regions and a
      neuromodulator profile, replayed on the brain.</p>
      ${scFold('Which engine runs', `
        <p>With no key it is a <strong>local keyword heuristic</strong>: it matches your words against the
        eight built-in pathways and a small lexicon, and tells you which words it matched.</p>
        <p>With your own OpenRouter key it asks a <strong>language model</strong>, then drops anything this
        app cannot verify: unknown region ids, out-of-range numbers, missing fields.</p>`)}
      <div class="note">Not evidence. One engine matches keywords, the other is a text model guessing.</div>`,
  });
}

/** Mark the step the replay is currently on, inside the result card. */
function scMarkStep(i) {
  const list = scEl('sc-steps');
  if (!list) return;
  list.querySelectorAll('li').forEach((el) => {
    el.classList.toggle('active', parseInt(el.dataset.i, 10) === i);
  });
}

/* ---------- actions ---------- */

function scReplay() {
  if (!sc.result || !sc.result.steps || !sc.result.steps.length) { toast('Nothing to replay yet.'); return; }
  const played = pwPlayExternal({
    id: 'scenario-run',
    title: sc.result.title,
    scenario_sentence: sc.lastText,
    steps: sc.result.steps,
    accuracy_caveats: SC_CAVEATS,
  }, { app: sc.app, onStep: scMarkStep, color: SC_ACCENT });
  if (!played) { toast('This result has no usable steps to replay.'); return; }
  sc.replaying = true;
  toast(played.timeline === 'ms' ? 'Replaying with the latencies as given.' : 'Replaying — order only, no timings claimed.');
}

function scToNeurons() {
  const profile = sc.result && sc.result.neuromodulators;
  if (!profile) { toast('Run a scenario first.'); return; }
  const pill = document.querySelector('.mode-pill[data-mode="neurons"]');
  if (!pill) { toast('Neurons mode is not available.'); return; }
  pill.click();
  setTimeout(() => {
    if (!nsApplyModulators(profile)) { toast('Neurons mode was not ready for the profile.'); return; }
    // The prediction has to be stated before the network is watched, or it is not a prediction.
    if (typeof nsSetHypothesis === 'function') {
      nsSetHypothesis({ title: sc.result.title || 'Your scenario', profile });
    }
  }, 0);
}

function scAbort() {
  if (sc.timer) { clearTimeout(sc.timer); sc.timer = 0; }
  if (sc.ctl) { try { sc.ctl.abort(); } catch (err) { /* already gone */ } sc.ctl = null; }
}

/**
 * Turn a failed LLM attempt into one sentence a reader can act on.
 *
 * A timeout is checked FIRST. On a claude.ai host the sandbox heuristic below would otherwise claim
 * every statusless failure was "blocked", so a request that left the page and then ran out of time
 * was reported as a CSP problem — and the reader would go looking for the wrong fix.
 */
function scFailureMessage(res) {
  if (res && res.aborted) return 'The LLM request timed out after 20 seconds, so the local heuristic ran instead.';
  if (res && res.blocked) {
    return 'The LLM path is blocked in this sandbox — open the hosted version or the local file. '
      + 'The heuristic still works.';
  }
  const reason = (res && res.reason) ? res.reason : 'The LLM call failed for an unknown reason.';
  return reason + ' The local heuristic ran instead.';
}

/* ---------- sensitive input ---------- */

const SC_REFUSALS = {
  crisis: {
    title: 'This isn’t something to simulate',
    body: 'This reads as being about your own wellbeing, and an educational simulation can’t help with '
      + 'that. If you’re struggling, please reach out to someone you trust or a local helpline.',
  },
  medical: {
    title: 'This isn’t something to simulate',
    body: 'CogniGraph does not diagnose or advise on health. Try describing an everyday moment instead.',
  },
};

/**
 * Stop before either engine runs and say why. No pathway, no bars, no badge, and — the point of it —
 * no network call: this returns before the key is ever read.
 */
function scRefuse(kind) {
  scStopReplay();
  sc.result = null;
  sc.note = '';
  scSetStatus('not-run');
  if (sc.app && sc.app.scene) sc.app.scene.clearHighlights();
  const copy = SC_REFUSALS[kind] || SC_REFUSALS.medical;
  explain({
    title: copy.title,
    html: `<p class="sc-refusal">${scEsc(copy.body)}</p>`,
  });
}

async function scRun(text) {
  const t = String(text == null ? '' : text).trim().slice(0, SC_MAX_INPUT);
  if (!t) { toast('Describe a moment first.'); return; }
  sc.lastText = t;

  // Before either engine, and before the key is read: some sentences should not be turned into an
  // animation at all. Both branches return, so nothing is sent anywhere.
  const sensitive = llmDetectSensitive(t);
  if (sensitive.crisis) { scAbort(); scRefuse('crisis'); return; }
  if (sensitive.medical) { scAbort(); scRefuse('medical'); return; }

  const key = llmStoredKey();
  const model = llmStoredModel();
  // Both engines see the same list, so a lesion changes the answer the same way whichever one runs.
  const lesions = Array.from((sc.app && sc.app.lesions) || []);

  if (!key) {
    scSetStatus('local');
    scShowResult(classifyLocal(t, { lesions }), 'Keyword heuristic — no key stored. Add one in Settings for the language model.');
    return;
  }

  scAbort();
  const ctl = (typeof AbortController === 'function') ? new AbortController() : null;
  sc.ctl = ctl;
  if (ctl) sc.timer = setTimeout(() => { try { ctl.abort(); } catch (err) { /* ignore */ } }, SC_TIMEOUT_MS);
  scSetStatus('running', { model });

  let res;
  try {
    res = await classifyWithOpenRouter(t, { key, model, lesions, signal: ctl ? ctl.signal : undefined });
  } catch (err) {
    res = { ok: false, reason: 'Unexpected error while calling OpenRouter.' };
  }
  if (sc.ctl !== ctl) return;          // superseded by a newer run, or the mode was left
  if (sc.timer) { clearTimeout(sc.timer); sc.timer = 0; }
  sc.ctl = null;

  if (res && res.ok) {
    scSetStatus('llm', { model: res.model || model });
    scShowResult(res, 'Written by ' + (res.model || model) + ' through OpenRouter, then filtered.');
    return;
  }

  const aborted = !!(res && res.aborted);
  const blocked = !aborted && (!!(res && res.blocked) || (scSandboxed() && res && !res.status));
  const message = scFailureMessage(blocked ? Object.assign({}, res, { blocked: true }) : res);
  scSetStatus('fallback', { model, reason: (res && res.reason) ? res.reason : 'unknown error' });
  scShowResult(classifyLocal(t, { lesions }), message);
  toast('LLM call failed — showing the local heuristic.');
}

/* ---------- settings drawer tab ---------- */

function scSettingsHtml() {
  const key = llmStoredKey();
  const model = llmStoredModel();
  const options = LLM_MODELS.map((m) => `<option value="${scEsc(m.id)}"${m.id === model ? ' selected' : ''}>${scEsc(m.label)}</option>`).join('');
  const custom = LLM_MODELS.some((m) => m.id === model) ? '' : `<option value="${scEsc(model)}" selected>${scEsc(model)} (stored)</option>`;
  return `
    <h3>OpenRouter key</h3>
    <p class="muted">Optional — without one, Scenario uses the built-in keyword heuristic.</p>
    <label class="sc-field">
      <span>API key</span>
      <input type="password" id="sc-key" class="search" autocomplete="off" spellcheck="false"
        placeholder="${key ? scEsc(llmMaskKey(key)) + ' — type a new key to replace it' : 'sk-or-v1-…'}">
    </label>
    <div class="sc-field-actions">
      <button class="text-btn primary" id="sc-key-save" type="button">Save key</button>
      <button class="text-btn" id="sc-key-clear" type="button">Clear key</button>
      <span class="muted" id="sc-key-status">${key ? 'Stored: ' + scEsc(llmMaskKey(key)) : 'No key stored.'}</span>
    </div>
    <ul class="sc-facts muted">
      <li>Stored only in this browser. No server of its own.</li>
      <li>Sent only to openrouter.ai, once per Run.</li>
      <li>Shared computer? Clear it when you are done.</li>
    </ul>

    <h3>Model</h3>
    <label class="sc-field">
      <span>Model id</span>
      <select id="sc-model">${custom}${options}</select>
    </label>
    <p class="muted">Ids pass through as-is; a retired id returns 404 and the heuristic takes over.</p>

    <h3>Ask about this</h3>
    <p class="muted">${key
      ? 'The Ask box is open at the bottom right. It answers only from the record you have selected, and cites it.'
      : 'Locked without a key: the Ask box answers questions about the selected record, and needs the same key as above.'}</p>`;
}

/**
 * Also the app's boot hook for the Ask panel: main.js calls this by name at startup (it is one of the
 * three registration functions in its list), and it is the only place in this worker's files that runs
 * before any mode is entered. Ask has to exist in Atlas and Pathways too, and neither is ours.
 */
function scRegisterSettings() {
  if (typeof registerDrawerTab === 'function') registerDrawerTab(SC_SETTINGS_TAB, SC_SETTINGS_LABEL, scSettingsHtml());
  try { if (typeof askMount === 'function') askMount(); } catch (err) { /* the panel is optional chrome */ }
}

function scOpenSettings() {
  scRegisterSettings();
  openDrawer(SC_SETTINGS_TAB);
}

/**
 * The drawer rewrites its body on every open, so the settings controls are wired by delegation on
 * document and installed exactly once. Nothing here runs unless one of the four scenario ids is hit.
 */
function scWireSettingsOnce() {
  if (sc.wired) return;
  sc.wired = true;
  document.addEventListener('click', (e) => {
    const t = e.target;
    if (!t || typeof t.closest !== 'function') return;
    if (t.closest('#sc-key-save')) {
      const input = scEl('sc-key');
      const v = input ? String(input.value || '').trim() : '';
      if (!v) { toast('Paste a key first, or press Clear key.'); return; }
      const ok = llmSetStoredKey(v);
      if (input) input.value = '';
      toast(ok ? 'Key saved in this browser only.' : 'This browser refused to store the key.');
      scRegisterSettings();
      openDrawer(SC_SETTINGS_TAB);
      scPaintStatus();
      if (typeof askRefresh === 'function') askRefresh();   // the Ask box appears with the key
      return;
    }
    if (t.closest('#sc-key-clear')) {
      llmSetStoredKey('');
      toast('Key cleared from this browser.');
      scRegisterSettings();
      openDrawer(SC_SETTINGS_TAB);
      scPaintStatus();
      if (typeof askRefresh === 'function') askRefresh();
    }
  });
  document.addEventListener('change', (e) => {
    if (!e.target || e.target.id !== 'sc-model') return;
    llmSetStoredModel(e.target.value);
    toast('Model set to ' + e.target.value + '.');
    scPaintStatus();
  });
}

/* ---------- mode ---------- */

export const ScenarioMode = {
  id: 'scenario',
  label: 'Scenario',
  accent: SC_ACCENT,

  enter(app) {
    sc.app = app;
    sc.replaying = false;
    registerHowTabs();
    scRegisterSettings();
    scWireSettingsOnce();
    scRenderPanel();
    if (typeof askMount === 'function') askMount(app);
    if (sc.result) scShowResult(sc.result);
    else { scIntro(); if (typeof askSetContext === 'function') askSetContext(null); }
  },

  exit(app) {
    scAbort();
    scStopReplay();
    sc.status = null;
    showTimeline(false);
    hoverLabel(null);
    scOffAll();
    if (app && app.scene) app.scene.clearHighlights();
  },

  update(dt, app) {
    if (sc.replaying) PathwaysMode.update(dt, app);
  },

  onPick(id, app, pos) {
    if (sc.replaying) { PathwaysMode.onPick(id, app, pos); return; }
    if (id) toast(scRegionName(id) + ' — run a scenario to see it in a sequence.');
  },

  onHover(id, app, pos) {
    hoverLabel(id ? scRegionName(id) : null, pos);
  },

  onKey(e, app) {
    if (sc.replaying && PathwaysMode.onKey) return PathwaysMode.onKey(e, app);
    return false;
  },
};
