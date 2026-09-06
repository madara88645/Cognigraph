// Learn mode (Worker Q): four-choice questions generated from the app's own data, with three Leitner
// boxes behind them so the things you miss come back and the things you know get out of the way.
//
// Nothing here is a test. There is no score, no streak, no timer and no "keep it up" — an item you get
// wrong goes back to box 1 and returns, and that is the whole mechanism. The card always shows the
// record the question came from, so a wrong answer teaches something instead of just being wrong.
//
// Questions come from src/learn/quiz.js (pure, seeded) and the schedule from src/learn/leitner.js
// (pure, localStorage). This file is only the screen.
import { lqItemIds, lqQuestion, lqSeenTermItems, lqSeenTerms } from '../learn/quiz.js';
import { ltLoad, ltSave, ltClear, ltRate, ltDue, ltNext, ltCounts, ltEntry, LT_STORAGE } from '../learn/leitner.js';
import { REGIONS } from '../data/regions.js';
import { registerHowTabs } from '../data/howitworks.js';
import { askRegionRecord } from '../llm/ask.js';
import { askSetContext, askMount } from '../ui/ask.js';
import { explain, setSidePanel, toast, hoverLabel } from '../ui/panels.js';

const LR_ACCENT = 0x7ed69a;
/** Fixed, so an item you missed comes back as the same question rather than a fresh roll of the dice. */
const LR_SEED = 20260906;

const lrn = {
  app: null,
  state: null,          // Leitner state
  current: null,        // the question on screen
  answered: null,       // {picked, correct} once the reader has chosen
  filter: false,        // "terms you looked up" first
  listeners: [],
  keys: null,           // capture-phase key handler (1-4 reach the mode switcher otherwise)
  saved: true,          // whether the last write to localStorage went through
};

/* ---------- helpers ---------- */

function lrEl(id) { return document.getElementById(id); }

function lrEsc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Both halves of this screen are redrawn with innerHTML, so every redraw used to leave its old
 * listeners on the bookkeeping list for ever — twenty questions meant forty dead entries. Each
 * listener now names the half it belongs to, and that half drops its own before it repaints.
 * @param {string} scope 'panel' (the side panel) or 'card' (the question card)
 */
function lrOn(el, type, fn, scope) {
  if (!el) return;
  el.addEventListener(type, fn);
  lrn.listeners.push({ el, type, fn, scope: scope || 'panel' });
}

/** Remove one scope's listeners, or every one of them when called with no scope (mode exit). */
function lrOffAll(scope) {
  const keep = [];
  for (const l of lrn.listeners) {
    if (scope && l.scope !== scope) { keep.push(l); continue; }
    l.el.removeEventListener(l.type, l.fn);
  }
  lrn.listeners = keep;
}

function lrNow() { return Date.now(); }

/** The item pool, in the order the queue should walk it. */
function lrPool() {
  const all = lqItemIds();
  if (!lrn.filter) return all;
  const seen = lqSeenTermItems();
  if (!seen.length) return all;
  const rest = all.filter((id) => seen.indexOf(id) < 0);
  return seen.concat(rest);
}

function lrDueIds() { return ltDue(lrn.state, lrPool(), lrNow()); }

/** "in 3 hours" / "tomorrow" — for the line shown when the queue is empty. */
function lrWhenNext() {
  const pool = lrPool();
  let soonest = Infinity;
  for (const id of pool) {
    const due = ltEntry(lrn.state, id).due;
    if (due < soonest) soonest = due;
  }
  if (!isFinite(soonest)) return '';
  const ms = soonest - lrNow();
  if (ms <= 0) return 'now';
  const h = ms / 3600000;
  if (h < 1) return 'in ' + Math.max(1, Math.round(ms / 60000)) + ' minutes';
  if (h < 24) return 'in ' + Math.round(h) + ' hour' + (Math.round(h) === 1 ? '' : 's');
  const d = Math.round(h / 24);
  return 'in ' + d + ' day' + (d === 1 ? '' : 's');
}

/* ---------- side panel ---------- */

function lrRenderPanel() {
  lrOffAll('panel');
  const counts = ltCounts(lrn.state, lrPool());
  const due = lrDueIds().length;
  const seenN = lqSeenTerms().length;

  const body = setSidePanel(`
    <div class="panel-title">Learn</div>
    <div class="panel-sub">Questions built from the regions, pathways and glossary you have been reading.</div>

    <div class="lr-queue" id="lr-queue">
      <span class="lr-queue-n mono">${due}</span>
      <span class="lr-queue-label">${due === 1 ? 'question ready' : 'questions ready'}</span>
    </div>
    <div class="lr-actions">
      <button class="text-btn primary" id="lr-start" type="button">${lrn.current ? 'Skip to next' : 'Start'}</button>
    </div>

    <h3>Boxes</h3>
    <div class="lr-progress mono" id="lr-progress">Box 1: ${counts[1]} · Box 2: ${counts[2]} · Box 3: ${counts[3]}</div>
    <p class="muted">Right moves an item up a box (box 2 comes back tomorrow, box 3 in four days). Wrong sends it to box 1.</p>

    <h3>Filter</h3>
    <label class="toggle-row lr-toggle">
      <span>Terms you looked up first${seenN ? ' (' + seenN + ')' : ''}</span>
      <input type="checkbox" id="lr-filter"${lrn.filter ? ' checked' : ''}${seenN ? '' : ' disabled'}>
    </label>
    <p class="muted">${seenN
      ? 'Puts the glossary terms you opened at the front of the queue.'
      : 'Click a dotted term anywhere in the app and it shows up here.'}</p>

    <h3>Progress</h3>
    <p class="muted">Kept in this browser only, under <span class="mono">${lrEsc(LT_STORAGE)}</span>.${lrn.saved ? '' : ' This browser refused to store it, so it will not survive a reload.'}</p>
    <button class="text-btn" id="lr-reset" type="button">Reset progress</button>`);

  lrOn(lrEl('lr-start'), 'click', () => lrNextQuestion(), 'panel');
  lrOn(lrEl('lr-filter'), 'change', (e) => {
    lrn.filter = !!e.target.checked;
    lrRenderPanel();
    toast(lrn.filter ? 'Terms you looked up come first.' : 'Back to the full queue.');
  }, 'panel');
  lrOn(lrEl('lr-reset'), 'click', () => {
    ltClear();
    lrn.state = ltLoad();
    lrn.current = null;
    lrn.answered = null;
    lrRenderPanel();
    lrIntro();
    toast('Boxes cleared. Nothing else was stored.');
  }, 'panel');
  return body;
}

function lrRefreshPanelNumbers() {
  const counts = ltCounts(lrn.state, lrPool());
  const prog = lrEl('lr-progress');
  if (prog) prog.textContent = `Box 1: ${counts[1]} · Box 2: ${counts[2]} · Box 3: ${counts[3]}`;
  const q = lrEl('lr-queue');
  if (q) {
    const due = lrDueIds().length;
    q.innerHTML = `<span class="lr-queue-n mono">${due}</span>
      <span class="lr-queue-label">${due === 1 ? 'question ready' : 'questions ready'}</span>`;
  }
}

/* ---------- the card ---------- */

function lrIntro() {
  explain({
    title: 'Ask yourself, not the app',
    badge: 'Simplified',
    badgeClass: 'mid',
    html: `
      <p>Four choices, built from the same region cards, pathways and glossary the rest of the app shows.
      Every question names the record it came from once you have answered.</p>
      <details class="lr-fold"><summary>How the boxes work</summary>
        <p>Three boxes. A new item sits in box 1 and is asked straight away; get it right and it moves to
        box 2 (tomorrow), then box 3 (four days).</p>
        <p>Get it wrong and it goes back to box 1, which means it comes back this session. That is the
        whole system — there is no score to protect.</p>
      </details>
      <div class="note">A four-choice question can only check recognition. Being able to pick the right
      option is not the same as understanding the mechanism.</div>`,
  });
}

/** Options are a list of buttons; the number in front of each is also its keyboard shortcut. */
function lrOptionsHtml(q) {
  return q.options.map((opt, i) => {
    const state = lrn.answered
      ? (i === q.answer ? ' lr-right' : (i === lrn.answered.picked ? ' lr-wrong' : ' lr-dim'))
      : '';
    return `<button class="lr-opt${state}" type="button" data-i="${i}"${lrn.answered ? ' disabled' : ''}>
      <span class="lr-key mono">${i + 1}</span><span class="lr-opt-text">${lrEsc(opt)}</span>
    </button>`;
  }).join('');
}

function lrSourceHtml(q) {
  const src = q.source || {};
  const lines = (src.lines || []).filter(Boolean).map((l) => `<p>${lrEsc(l)}</p>`).join('');
  return `
    <div class="lr-source">
      <div class="lr-source-head">
        <span class="lr-source-title">${lrEsc(src.title || '')}</span>
        <span class="badge mid">${lrEsc(src.badge || 'from this app’s data')}</span>
      </div>
      ${lines}
    </div>`;
}

function lrPaintCard() {
  lrOffAll('card');
  const q = lrn.current;
  if (!q) { lrIntro(); return; }
  const a = lrn.answered;
  const verdict = a
    ? `<div class="lr-verdict ${a.correct ? 'lr-verdict-right' : 'lr-verdict-wrong'}">
         ${a.correct ? 'Correct.' : 'Not this time.'}
         <span class="muted">${a.correct ? 'It moves up a box.' : 'It goes back to box 1 and returns later.'}</span>
       </div>`
    : '';

  explain({
    title: q.kicker,
    badge: 'Simplified',
    badgeClass: 'mid',
    html: `
      <div class="lr-card" data-nolink>
        <p class="lr-prompt">${lrEsc(q.prompt)}</p>
        <div class="lr-options" id="lr-options">${lrOptionsHtml(q)}</div>
        ${verdict}
        ${a ? lrSourceHtml(q) : ''}
        ${a ? `<div class="lr-next-row"><button class="text-btn primary" id="lr-next" type="button">Next</button>
               <span class="muted lr-hint">or press ↵</span></div>` : `<p class="muted lr-hint">Press 1–4, or click.</p>`}
      </div>`,
  });

  const list = lrEl('lr-options');
  if (list) {
    lrOn(list, 'click', (e) => {
      const b = e.target && e.target.closest ? e.target.closest('.lr-opt') : null;
      if (b && !lrn.answered) lrAnswer(parseInt(b.dataset.i, 10));
    }, 'card');
  }
  lrOn(lrEl('lr-next'), 'click', () => lrNextQuestion(), 'card');
}

/* ---------- flow ---------- */

function lrNextQuestion() {
  lrn.answered = null;
  const id = ltNext(lrn.state, lrPool(), lrNow());
  if (!id) {
    lrn.current = null;
    explain({
      title: 'Nothing due right now',
      html: `<p>Every item you have seen is waiting in box 2 or box 3. The next one is due ${lrEsc(lrWhenNext())}.</p>
        <p class="muted">Nothing to do about that — go and read something instead, or reset the boxes in the panel.</p>`,
    });
    lrRefreshPanelNumbers();
    return;
  }
  const q = lqQuestion(id, LR_SEED);
  if (!q) { toast('That item could not be turned into a question.'); return; }
  lrn.current = q;
  if (lrn.app && lrn.app.scene) lrn.app.scene.clearHighlights();
  lrPaintCard();
  lrRefreshPanelNumbers();
  const start = lrEl('lr-start');
  if (start) start.textContent = 'Skip to next';
}

function lrAnswer(i) {
  const q = lrn.current;
  if (!q || lrn.answered || !(i >= 0)) return;
  const correct = i === q.answer;
  lrn.answered = { picked: i, correct };
  lrn.state = ltRate(lrn.state, q.id, correct, lrNow());
  lrn.saved = ltSave(lrn.state);
  lrPaintCard();
  lrRefreshPanelNumbers();
  lrShowRegion(q.regionId);
}

/** Put the region on the brain, so the answer has somewhere to live besides the card. */
function lrShowRegion(id) {
  const app = lrn.app;
  if (!app || !app.scene) return;
  app.scene.clearHighlights();
  if (!id) { if (typeof askSetContext === 'function') askSetContext(null); return; }
  const region = REGIONS.find((r) => r.id === id);
  try {
    app.scene.highlight(id, 1, LR_ACCENT);
    // same framing Atlas uses, so a region looks the same wherever you meet it
    if (typeof app.scene.flyTo === 'function') app.scene.flyTo(id, { distance: 3.5, duration: 0.85 });
  } catch (err) { /* a region with no 3D geometry just does not light up */ }
  if (typeof askSetContext === 'function' && region) {
    const rec = askRegionRecord(id);
    if (rec) askSetContext({ label: region.name, records: [rec] });
  }
}

/* ---------- keyboard ---------- */

/**
 * 1-4 are the app's mode switcher, and panels.js takes them before any mode sees them. A capture-phase
 * listener gets there first; it stops propagation ONLY for the keys this mode actually uses, so
 * Escape, R and the mode pills keep working.
 */
function lrInstallKeys() {
  if (lrn.keys) return;
  lrn.keys = (e) => {
    const tag = e.target && e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    // stopImmediatePropagation as well as stopPropagation: the mode switcher listens on window too, and
    // an event whose target IS window (a synthetic one, say) would otherwise still reach it.
    if (e.key >= '1' && e.key <= '4') {
      if (!lrn.current || lrn.answered) return;             // no question on screen: let it switch modes
      e.stopPropagation(); e.stopImmediatePropagation(); e.preventDefault();
      lrAnswer(parseInt(e.key, 10) - 1);
      return;
    }
    if (e.key === 'Enter') {
      e.stopPropagation(); e.stopImmediatePropagation(); e.preventDefault();
      lrNextQuestion();
    }
  };
  window.addEventListener('keydown', lrn.keys, true);
}

function lrRemoveKeys() {
  if (!lrn.keys) return;
  window.removeEventListener('keydown', lrn.keys, true);
  lrn.keys = null;
}

/* ---------- mode ---------- */

export const LearnMode = {
  id: 'learn',
  label: 'Learn',
  accent: LR_ACCENT,

  enter(app) {
    lrn.app = app;
    lrn.state = ltLoad();
    registerHowTabs();
    lrRenderPanel();
    lrInstallKeys();
    if (typeof askMount === 'function') askMount(app);
    if (lrn.current) lrPaintCard(); else lrIntro();
  },

  exit(app) {
    lrOffAll();
    lrRemoveKeys();
    hoverLabel(null);
    if (app && app.scene) app.scene.clearHighlights();
  },

  update() {},

  onPick(id, app) {
    if (!id) return;
    const r = REGIONS.find((x) => x.id === id);
    if (r) toast(r.name + ' — answer the question to see where it lights up.');
  },

  onHover(id, app, pos) {
    const r = id ? REGIONS.find((x) => x.id === id) : null;
    hoverLabel(r ? r.name : null, pos);
  },

  onKey() { return false; },   // 1-4 and Enter are handled in the capture phase, above
};
