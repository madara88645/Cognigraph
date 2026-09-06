// "Ask about this" panel (Worker Q). Lives in #ask-panel, bottom right, and is opened by the Ask
// button in the Explain panel's header. That button is visible in every mode, with or without a key:
// a feature nobody can find is a feature nobody knows they are missing, so without a key the panel
// still opens and says, in one line, what it needs and where to put it.
//
// The panel is deliberately narrow in what it can do: it asks about ONE selected record and shows the
// ids the answer cited as chips you can click back to. An answer with no usable citation is labelled
// as not grounded and is never dressed up as a result.
//
// Selection comes from whichever mode is active. The modes this worker owns push it with
// askSetContext(); Atlas belongs to another worker, so its selection is read off CogniGraph.selection
// at the moment the panel is used.
import { REGIONS } from '../data/regions.js';
import { PATHWAYS } from '../data/pathways.js';
import { askGrounded, askRegionRecord, askStepRecord } from '../llm/ask.js';
import { llmStoredKey, llmStoredModel } from '../llm/openrouter.js';
import { openDrawer, toast } from './panels.js';

const ASK_TIMEOUT_MS = 20000;
const ASK_UI_MAX_Q = 200;
/** The drawer tab scenario.js registers the key field under. */
const ASK_SETTINGS_TAB = 'scenario-settings';

const askState = {
  mounted: false,
  app: null,
  ctx: null,          // {label, records[]} pushed by a mode
  answer: null,       // last validated answer
  busy: false,
  ctl: null,
  timer: 0,
  question: '',
  pending: false,     // a repaint of the "About" line is already scheduled
  open: null,         // is the panel showing? null = not decided yet (a stored key decides it)
  keyed: null,        // whether the body currently rendered is the with-key one
  wired: false,       // panel + document delegation installed
  btnWired: false,    // the Explain header's Ask button
};

/* ---------- helpers ---------- */

function askEl(id) { return document.getElementById(id); }

function askEsc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function askRegion(id) { return REGIONS.find((r) => r.id === id) || null; }

function askShortName(id) {
  const r = askRegion(id);
  if (!r) return id;
  const paren = r.name.match(/\(([^()]{1,14})\)\s*$/);
  return paren ? paren[1] : r.name.replace(/\s*\([^()]*\)\s*$/, '');
}

/** 'recall_word#2' -> {pathway, index} (0-based), or null. */
function askParseStepId(id) {
  const m = String(id).match(/^([a-z0-9_]+)#(\d+)$/);
  if (!m) return null;
  const p = PATHWAYS.find((x) => x.id === m[1]);
  const i = parseInt(m[2], 10) - 1;
  if (!p || !(i >= 0) || i >= p.steps.length) return null;
  return { pathway: p, index: i };
}

/* ---------- context ---------- */

/**
 * Push the record(s) the reader is looking at. Called by Scenario, Neurons and Learn; pass null to say
 * "nothing is selected" so the panel stops offering to answer questions about a stale record.
 * @param {object|null} ctx {label, records:[{id, ...}]}
 */
export function askSetContext(ctx) {
  askState.ctx = ctx && ctx.records && ctx.records.length ? ctx : null;
  askPaintTarget();
}

/** Atlas is another worker's file, so its selection is read here rather than pushed from there. */
function askSelectionContext() {
  const app = askState.app || (typeof CogniGraph !== 'undefined' ? CogniGraph : null);
  const id = app && app.selection;
  if (!id) return null;
  const rec = askRegionRecord(id);
  if (!rec) return null;
  return { label: rec.name, records: [rec] };
}

/** Pathways is another worker's file too; its open step is read off the side panel it already renders. */
function askPathwayContext() {
  const item = document.querySelector('.pw-item.active[data-pw]');
  const step = document.querySelector('.pw-step.active[data-step]');
  if (!item || !step) return null;
  const rec = askStepRecord(item.dataset.pw, parseInt(step.dataset.step, 10));
  if (!rec) return null;
  return { label: rec.pathway + ' · step ' + rec.step, records: [rec] };
}

/** What a question would actually be asked about, right now. */
export function askResolveContext() {
  const app = askState.app || (typeof CogniGraph !== 'undefined' ? CogniGraph : null);
  const modeId = app && app.mode ? app.mode.id : '';
  if (modeId === 'atlas') return askSelectionContext() || askState.ctx;
  if (modeId === 'pathways') return askPathwayContext() || askSelectionContext() || askState.ctx;
  return askState.ctx || askSelectionContext();
}

/* ---------- rendering ---------- */

function askPaintTarget() {
  const el = askEl('ask-target');
  if (!el) return;
  const ctx = askResolveContext();
  if (!ctx) {
    el.innerHTML = '<span class="muted">Nothing selected — click a region, a pathway step or run a scenario first.</span>';
  } else {
    const ids = ctx.records.map((r) => r.id).join(', ');
    el.innerHTML = `<span class="muted">About</span> <strong>${askEsc(ctx.label || ids)}</strong>
      <span class="mono ask-ids">${askEsc(ids)}</span>`;
  }
  askMeasure();
}

function askChipHtml(id) {
  const step = askParseStepId(id);
  if (step) {
    return `<button class="ask-chip" type="button" data-cite="${askEsc(id)}"
      title="Open this step in Pathways">${askEsc(step.pathway.title)} · step ${step.index + 1}</button>`;
  }
  if (askRegion(id)) {
    return `<button class="ask-chip" type="button" data-cite="${askEsc(id)}"
      title="Open this region in Atlas">${askEsc(askShortName(id))}</button>`;
  }
  return `<button class="ask-chip" type="button" data-cite="${askEsc(id)}">${askEsc(id)}</button>`;
}

function askAnswerHtml(a) {
  if (!a) return '';
  if (!a.ok) {
    return `<div class="ask-answer-body ask-fail">${askEsc(a.reason || 'That did not work.')}</div>`;
  }
  const grounded = !a.ungrounded;
  const badge = grounded
    ? `<span class="badge low">From this app's data only</span>`
    : `<span class="badge danger ask-bad">Not grounded in the app's data</span>`;
  const chips = (a.citations || []).map(askChipHtml).join('');
  const unknown = (a.unknown && a.unknown.length)
    ? `<div class="ask-unknown">Cited ${askEsc(a.unknown.map((x) => '[' + x + ']').join(' '))}, which is not in this app's data.</div>`
    : '';
  return `
    <div class="ask-answer-head">${badge}</div>
    <div class="ask-answer-body">${askEsc(a.answer)}</div>
    ${chips ? `<div class="ask-chips">${chips}</div>` : ''}
    ${unknown}`;
}

function askPaintAnswer() {
  const box = askEl('ask-answer');
  if (!box) return;
  const a = askState.answer;
  if (askState.busy) {
    box.hidden = false;
    box.innerHTML = `<div class="ask-answer-body muted"><span class="ask-spinner" aria-hidden="true"></span>Asking the model…</div>`;
  } else if (!a) {
    box.hidden = true;
    box.innerHTML = '';
  } else {
    box.hidden = false;
    box.innerHTML = askAnswerHtml(a);
  }
  const app = askEl('app');
  if (app) app.classList.toggle('ask-open', !box.hidden);
  askMeasure();
}

/** Tell the layout how tall the panel is, so the Explain card can sit above it instead of under it. */
function askMeasure() {
  const panel = askEl('ask-panel');
  const app = askEl('app');
  if (!panel || !app) return;
  const h = panel.hidden ? 0 : Math.round(panel.getBoundingClientRect().height);
  app.style.setProperty('--ask-h', h + 'px');
}

/**
 * Draw the panel body for the state we are in. Called again whenever a key appears or is cleared, so
 * only listeners on the elements it just created may be attached here — everything that outlives a
 * repaint is in askWireOnce().
 */
function askRenderPanel() {
  const panel = askEl('ask-panel');
  if (!panel) return;
  const keyed = !!llmStoredKey();
  askState.keyed = keyed;
  panel.innerHTML = keyed ? `
    <div class="ask-row">
      <input id="ask-q" class="search ask-input" type="text" maxlength="${ASK_UI_MAX_Q}" autocomplete="off"
        placeholder="Ask about this record…" aria-label="Ask about the selected record">
      <button class="text-btn primary" id="ask-go" type="button">Ask</button>
    </div>
    <div class="ask-target" id="ask-target"></div>
    <div class="ask-answer" id="ask-answer" hidden></div>` : `
    <div class="ask-row">
      <input id="ask-q" class="search ask-input" type="text" disabled
        placeholder="Ask about this record…" aria-label="Ask about the selected record">
      <button class="text-btn primary" id="ask-go" type="button" disabled>Ask</button>
    </div>
    <p class="ask-locked">Add an OpenRouter key in Settings to ask about what is on screen.
      <button class="text-btn ask-settings" type="button">Open Settings</button></p>`;

  const input = askEl('ask-q');
  if (input && keyed) {
    input.value = askState.question || '';
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); askSubmit(); }
    });
    input.addEventListener('focus', askPaintTarget);
  }
  const go = askEl('ask-go');
  if (go && keyed) go.addEventListener('click', () => askSubmit());
  if (keyed) { askPaintTarget(); askPaintAnswer(); }
  askMeasure();
}

/** Listeners that survive a repaint: they sit on #ask-panel itself, on document, and on window. */
function askWireOnce() {
  const panel = askEl('ask-panel');
  if (!panel || askState.wired) return;
  askState.wired = true;
  panel.addEventListener('pointerenter', askPaintTarget);
  // Selection lives in five different modes, three of which are not ours. Rather than ask each one to
  // report in, repaint the "About" line after anything that could have changed it — one rAF, debounced.
  const repaint = () => {
    if (askState.pending) return;
    askState.pending = true;
    requestAnimationFrame(() => { askState.pending = false; askPaintTarget(); });
  };
  document.addEventListener('click', repaint);
  window.addEventListener('keyup', repaint);
  panel.addEventListener('click', (e) => {
    const t = e.target;
    if (!t || typeof t.closest !== 'function') return;
    if (t.closest('.ask-settings')) { askOpenSettings(); return; }
    const chip = t.closest('.ask-chip');
    if (chip) askOpenCitation(chip.dataset.cite);
  });
}

/** The key lives in Scenario's settings tab; scOpenSettings() re-renders it before opening. */
function askOpenSettings() {
  try {
    if (typeof scOpenSettings === 'function') { scOpenSettings(); return; }
  } catch (err) { /* fall through to the plain drawer call */ }
  if (typeof openDrawer === 'function') openDrawer(ASK_SETTINGS_TAB);
}

/** Show or hide the panel, and keep the Ask button and the layout offsets in step with it. */
function askApply() {
  const panel = askEl('ask-panel');
  if (!panel) return;
  const open = !!askState.open;
  panel.hidden = !open;
  const app = askEl('app');
  if (app) {
    app.classList.toggle('ask-on', open);
    if (!open) app.classList.remove('ask-open');
  }
  const btn = askEl('explain-ask');
  if (btn) {
    btn.hidden = false;
    btn.classList.toggle('active', open);
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    btn.title = askState.keyed
      ? 'Ask about the record on screen'
      : 'Ask about the record on screen (needs an OpenRouter key)';
  }
  if (open && askState.keyed) askPaintTarget();
  askMeasure();
}

/** Open/close the panel. Called by the Ask button; pass true/false to force a state. */
export function askTogglePanel(force) {
  askState.open = (typeof force === 'boolean') ? force : !askState.open;
  if (askState.open && !!llmStoredKey() !== askState.keyed) askRenderPanel();
  askApply();
  if (askState.open) {
    const input = askEl('ask-q');
    if (input && !input.disabled) input.focus();
  }
}

/** The Ask button is part of the skeleton's Explain header, so it is wired once and never re-created. */
function askWireButton() {
  const btn = askEl('explain-ask');
  if (!btn || askState.btnWired) return;
  askState.btnWired = true;
  btn.hidden = false;
  btn.addEventListener('click', (e) => { e.preventDefault(); askTogglePanel(); });
}

/* ---------- citation chips ---------- */

/** Take the reader to the record a citation names. Every hop is guarded: a chip never throws. */
function askOpenCitation(id) {
  if (!id) return;
  const switchTo = (typeof window !== 'undefined' && typeof window.switchMode === 'function') ? window.switchMode : null;
  const app = askState.app || (typeof CogniGraph !== 'undefined' ? CogniGraph : null);

  const step = askParseStepId(id);
  if (step) {
    if (switchTo) switchTo('pathways');
    setTimeout(() => {
      const item = document.querySelector('.pw-item[data-pw="' + step.pathway.id + '"]');
      if (item) item.click(); else { toast('Open ' + step.pathway.title + ' in Pathways.'); return; }
      setTimeout(() => {
        const row = document.querySelector('.pw-step[data-step="' + step.index + '"]');
        if (row) row.click();
      }, 0);
    }, 0);
    return;
  }

  if (askRegion(id)) {
    if (switchTo) switchTo('atlas');
    setTimeout(() => {
      if (app && app.mode && typeof app.mode.onPick === 'function') app.mode.onPick(id, app);
    }, 0);
    return;
  }

  if (id === 'scenario' && switchTo) { switchTo('scenario'); return; }
  toast('That citation does not point anywhere in this app.');
}

/* ---------- asking ---------- */

function askAbort() {
  if (askState.timer) { clearTimeout(askState.timer); askState.timer = 0; }
  if (askState.ctl) { try { askState.ctl.abort(); } catch (err) { /* already gone */ } askState.ctl = null; }
}

export async function askSubmit() {
  const input = askEl('ask-q');
  const q = input ? String(input.value || '').trim() : '';
  askState.question = q;
  if (!q) { toast('Type a question first.'); return; }

  const ctx = askResolveContext();
  if (!ctx) { toast('Select a region, a pathway step or run a scenario first.'); return; }

  const key = llmStoredKey();
  if (!key) { toast('Ask needs an OpenRouter key — add one in Settings.'); return; }

  askAbort();
  const ctl = (typeof AbortController === 'function') ? new AbortController() : null;
  askState.ctl = ctl;
  if (ctl) askState.timer = setTimeout(() => { try { ctl.abort(); } catch (err) { /* ignore */ } }, ASK_TIMEOUT_MS);
  askState.busy = true;
  askState.answer = null;
  askPaintAnswer();

  let res;
  try {
    res = await askGrounded(q, ctx, { key, model: llmStoredModel(), signal: ctl ? ctl.signal : undefined });
  } catch (err) {
    res = { ok: false, reason: 'Unexpected error while asking.' };
  }
  if (askState.ctl !== ctl) return;              // superseded by a newer question
  if (askState.timer) { clearTimeout(askState.timer); askState.timer = 0; }
  askState.ctl = null;
  askState.busy = false;
  if (res && res.aborted) res = { ok: false, reason: 'The request timed out after 20 seconds.' };
  askState.answer = res;
  askPaintAnswer();
}

/* ---------- mounting ---------- */

/**
 * Re-read the stored key and put the panel in the right state. Called at boot, on mode entry, and
 * after a key is saved or cleared. A stored key still opens the panel by itself; without one the
 * panel waits for the Ask button, which is now visible either way.
 */
export function askRefresh() {
  const panel = askEl('ask-panel');
  if (!panel) return;
  const keyed = !!llmStoredKey();
  if (keyed !== askState.keyed) {
    const had = askState.keyed;
    askState.answer = null;
    askRenderPanel();
    if (keyed && had === false) askState.open = true;   // the key just arrived: show what it unlocked
  }
  if (askState.open === null) askState.open = keyed;
  askApply();
}

/**
 * Build the panel once. Safe to call from every mode's enter() and from the boot hook; the second call
 * only refreshes visibility.
 */
export function askMount(app) {
  if (app) askState.app = app;
  else if (!askState.app && typeof CogniGraph !== 'undefined') askState.app = CogniGraph;
  const panel = askEl('ask-panel');
  if (!panel) return;
  if (!askState.mounted) {
    askState.mounted = true;
    askRenderPanel();
    askWireOnce();
  }
  askWireButton();
  askRefresh();
}
