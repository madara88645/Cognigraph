// A 24-trial colour-word Stroop task, run inside #lab-overlay.
//
// The point is one number: the interference effect, how much slower you are when the word and the ink
// disagree. It is your own reaction time on your own keyboard, so Pathways shows it beside the
// group-average latencies rather than instead of them. Nothing is uploaded; the result lives in
// localStorage under `cg.measure.stroop` and on `app.measure.stroop`.
//
// The scoring half (labScoreStroop, labMakeTrials, labRng) is pure and tested; the DOM half is not.
import { toast } from '../ui/panels.js';

export const LAB_STROOP_KEY = 'cg.measure.stroop';
export const LAB_TRIALS = 24;          // scored trials: 12 congruent, 12 incongruent
export const LAB_PRACTICE = 4;         // dropped before scoring
export const LAB_RESPONSE_MS = 1500;   // response window; past it the trial is an error
const LAB_FIX_MS = 400;                // fixation cross before each word
const LAB_FEEDBACK_MS = 320;

/** The four colours, in the fixed key order shown on screen. */
export const LAB_COLORS = [
  { id: 'red', word: 'RED', hex: '#ff6b6b', key: 'd' },
  { id: 'green', word: 'GREEN', hex: '#62d69a', key: 'f' },
  { id: 'blue', word: 'BLUE', hex: '#6aa8ff', key: 'j' },
  { id: 'yellow', word: 'YELLOW', hex: '#f2c14e', key: 'k' },
];

/* ---------------- pure: trial list, scoring ---------------- */

/** Small deterministic PRNG so the trial list can be tested (and so a run is reproducible from a seed). */
export function labRng(seed) {
  let s = (seed >>> 0) || 1;
  return function next() {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function labShuffle(arr, rnd) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}

/**
 * The full trial list: LAB_PRACTICE practice trials then LAB_TRIALS scored ones,
 * half congruent, each ink colour used equally often.
 * @returns {Array<{practice:boolean, congruent:boolean, ink:string, word:string}>}
 */
export function labMakeTrials(seed = 1) {
  const rnd = labRng(seed);
  const build = (n) => {
    const half = n / 2;
    const out = [];
    for (let k = 0; k < half; k++) {
      const c = LAB_COLORS[k % LAB_COLORS.length];
      out.push({ practice: false, congruent: true, ink: c.id, word: c.word });
    }
    for (let k = 0; k < half; k++) {
      const c = LAB_COLORS[k % LAB_COLORS.length];
      const others = LAB_COLORS.filter((o) => o.id !== c.id);
      const w = others[Math.floor(rnd() * others.length)];
      out.push({ practice: false, congruent: false, ink: c.id, word: w.word });
    }
    return labShuffle(out, rnd);
  };
  const practice = build(LAB_PRACTICE).map((t) => ({ ...t, practice: true }));
  return practice.concat(build(LAB_TRIALS));
}

function labMean(xs) {
  if (!xs.length) return null;
  let s = 0;
  for (const x of xs) s += x;
  return Math.round(s / xs.length);
}

/**
 * Score a finished run. Pure: given trial records, returns the summary Pathways displays.
 * Practice trials are dropped. A timeout counts as an error and contributes no reaction time,
 * and only correct trials feed the two means (the standard way to read a Stroop effect).
 *
 * @param {Array<{practice?:boolean, congruent:boolean, rt:number|null, correct?:boolean, timeout?:boolean}>} trials
 * @param {number} at epoch ms to stamp the result with
 * @returns {{meanRtCongruent:number|null, meanRtIncongruent:number|null, interference:number|null,
 *            accuracy:number, n:number, at:number}}
 */
export function labScoreStroop(trials, at = 0) {
  const scored = (Array.isArray(trials) ? trials : []).filter((t) => t && !t.practice);
  const ok = (t) => t.correct === true && t.timeout !== true && typeof t.rt === 'number' && isFinite(t.rt) && t.rt > 0;
  const con = scored.filter((t) => t.congruent && ok(t)).map((t) => t.rt);
  const inc = scored.filter((t) => !t.congruent && ok(t)).map((t) => t.rt);
  const meanRtCongruent = labMean(con);
  const meanRtIncongruent = labMean(inc);
  const correct = scored.filter(ok).length;
  return {
    meanRtCongruent,
    meanRtIncongruent,
    interference: (meanRtCongruent == null || meanRtIncongruent == null) ? null : meanRtIncongruent - meanRtCongruent,
    accuracy: scored.length ? correct / scored.length : 0,
    n: scored.length,
    at,
  };
}

/** Is a stored/loaded result usable enough to show next to a step card? */
export function labMeasureUsable(m) {
  return !!m && typeof m.interference === 'number' && isFinite(m.interference) && m.n > 0 && m.accuracy >= 0.6;
}

/* ---------------- storage ---------------- */

/** Read every saved measurement into app.measure. Safe when storage is blocked or empty. */
export function labLoadMeasures(app) {
  if (!app) return null;
  if (!app.measure) app.measure = {};
  try {
    const raw = localStorage.getItem(LAB_STROOP_KEY);
    if (raw) {
      const v = JSON.parse(raw);
      if (v && typeof v === 'object') app.measure.stroop = v;
    }
  } catch (err) { /* private mode, disabled storage: the app just has no measurement */ }
  return app.measure.stroop || null;
}

function labSaveMeasure(app, result) {
  if (app) {
    if (!app.measure) app.measure = {};
    app.measure.stroop = result;
  }
  try { localStorage.setItem(LAB_STROOP_KEY, JSON.stringify(result)); } catch (err) { /* not fatal */ }
}

/* ---------------- overlay ---------------- */

const lab = {
  app: null,
  el: null,          // #lab-overlay
  trials: [],
  i: 0,
  shownAt: 0,
  timer: null,
  onKey: null,
  onClose: null,
  phase: 'idle',     // idle | intro | fixation | stimulus | feedback | done
  answered: false,
};

function labEsc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function labClearTimer() { if (lab.timer) { clearTimeout(lab.timer); lab.timer = null; } }

function labKeyLegend() {
  return LAB_COLORS.map((c) =>
    `<span class="lab-key"><kbd>${c.key.toUpperCase()}</kbd><span style="color:${c.hex}">${labEsc(c.word)}</span></span>`).join('');
}

function labShell(inner) {
  if (!lab.el) return;
  lab.el.innerHTML = `<div class="lab-card">
    <button class="icon-btn lab-close" type="button" title="Close (Esc)">&times;</button>
    ${inner}
  </div>`;
  const close = lab.el.querySelector('.lab-close');
  if (close) close.addEventListener('click', () => labCloseStroop());
}

function labIntro() {
  lab.phase = 'intro';
  labShell(`
    <div class="lab-head"><h2>Stroop task</h2><span class="badge mid">Your own timing, one session</span></div>
    <p>A colour word appears. Press the key for the <strong>ink colour</strong>, not the word.</p>
    <div class="lab-keys">${labKeyLegend()}</div>
    <p class="muted">${LAB_PRACTICE} practice trials, then ${LAB_TRIALS} scored ones. You have ${(LAB_RESPONSE_MS / 1000).toFixed(1)} s per trial;
    no answer counts as an error.</p>
    <div class="note">This measures you on this keyboard right now, not your brain. It is a demonstration, not a test of anything clinical.</div>
    <div class="lab-actions"><button class="text-btn primary lab-start" type="button">Start</button>
      <span class="muted">Escape closes.</span></div>`);
  const start = lab.el.querySelector('.lab-start');
  if (start) start.addEventListener('click', labStart);
}

function labStart() {
  lab.trials = labMakeTrials((Date.now() % 100000) + 1).map((t) => ({ ...t, rt: null, correct: false, timeout: false }));
  lab.i = 0;
  labFixation();
}

function labFixation() {
  lab.phase = 'fixation';
  lab.answered = false;
  const t = lab.trials[lab.i];
  const practice = t && t.practice;
  const scoredIndex = lab.i - LAB_PRACTICE + 1;
  labShell(`
    <div class="lab-stage">
      <div class="lab-progress mono">${practice ? 'practice ' + (lab.i + 1) + '/' + LAB_PRACTICE : scoredIndex + '/' + LAB_TRIALS}</div>
      <div class="lab-word lab-fix">+</div>
      <div class="lab-keys">${labKeyLegend()}</div>
    </div>`);
  labClearTimer();
  lab.timer = setTimeout(labStimulus, LAB_FIX_MS);
}

function labStimulus() {
  const t = lab.trials[lab.i];
  if (!t) return labFinish();
  lab.phase = 'stimulus';
  const ink = LAB_COLORS.find((c) => c.id === t.ink);
  const practice = t.practice;
  const scoredIndex = lab.i - LAB_PRACTICE + 1;
  labShell(`
    <div class="lab-stage">
      <div class="lab-progress mono">${practice ? 'practice ' + (lab.i + 1) + '/' + LAB_PRACTICE : scoredIndex + '/' + LAB_TRIALS}</div>
      <div class="lab-word" style="color:${ink ? ink.hex : '#fff'}">${labEsc(t.word)}</div>
      <div class="lab-keys">${labKeyLegend()}</div>
    </div>`);
  lab.shownAt = performance.now();
  labClearTimer();
  lab.timer = setTimeout(() => labAnswer(null), LAB_RESPONSE_MS);
}

function labAnswer(key) {
  if (lab.phase !== 'stimulus' || lab.answered) return;
  lab.answered = true;
  labClearTimer();
  const t = lab.trials[lab.i];
  const rt = Math.round(performance.now() - lab.shownAt);
  if (key == null) {
    t.timeout = true; t.correct = false; t.rt = null;
  } else {
    const picked = LAB_COLORS.find((c) => c.key === key);
    t.rt = rt;
    t.correct = !!picked && picked.id === t.ink;
  }
  lab.phase = 'feedback';
  const mark = t.timeout ? 'too slow' : (t.correct ? 'correct' : 'wrong colour');
  const cls = t.correct ? 'ok' : 'danger';
  const card = lab.el && lab.el.querySelector('.lab-stage');
  if (card) {
    const tag = document.createElement('div');
    tag.className = 'lab-feedback badge ' + cls;
    tag.textContent = mark;
    card.appendChild(tag);
  }
  lab.timer = setTimeout(() => {
    lab.i++;
    if (lab.i >= lab.trials.length) labFinish(); else labFixation();
  }, LAB_FEEDBACK_MS);
}

function labFinish() {
  lab.phase = 'done';
  labClearTimer();
  const result = labScoreStroop(lab.trials, Date.now());
  labSaveMeasure(lab.app, result);
  const ms = (v) => (v == null ? '—' : '~' + v + ' ms');
  const usable = labMeasureUsable(result);
  labShell(`
    <div class="lab-head"><h2>Your Stroop result</h2><span class="badge ${usable ? 'mid' : 'danger'}">${usable ? 'One session, one device' : 'Too many errors to read'}</span></div>
    <dl class="kv">
      <dt>Congruent</dt><dd class="mono">${ms(result.meanRtCongruent)}</dd>
      <dt>Incongruent</dt><dd class="mono">${ms(result.meanRtIncongruent)}</dd>
      <dt>Interference</dt><dd class="mono">${result.interference == null ? '—' : result.interference + ' ms'}</dd>
      <dt>Accuracy</dt><dd class="mono">${Math.round(result.accuracy * 100)}% of ${result.n}</dd>
    </dl>
    <p>Interference is the extra time the mismatched word costs you. Pathways now shows it beside the group-average steps in Shifting Attention and Making a Decision.</p>
    <div class="note">One session on one keyboard, so treat it as your number today, not a measurement of your brain. It is not diagnostic.</div>
    <div class="lab-actions">
      <button class="text-btn lab-again" type="button">Run again</button>
      <button class="text-btn primary lab-done" type="button">Done</button>
    </div>`);
  const again = lab.el.querySelector('.lab-again');
  if (again) again.addEventListener('click', labStart);
  const done = lab.el.querySelector('.lab-done');
  if (done) done.addEventListener('click', () => labCloseStroop());
  if (typeof toast === 'function' && usable) toast('Stroop result saved on this device.');
}

/**
 * Open the task. Safe to call twice; the second call just re-shows the intro.
 * @param {object} app the shared app object (the result lands on app.measure.stroop)
 * @param {function} [onClose] called once the overlay closes, so the caller can redraw
 */
export function labOpenStroop(app, onClose) {
  const el = document.getElementById('lab-overlay');
  if (!el) return false;
  lab.app = app || lab.app;
  lab.onClose = typeof onClose === 'function' ? onClose : null;
  lab.el = el;
  el.hidden = false;
  el.classList.add('lab-on');
  if (!lab.onKey) {
    lab.onKey = (e) => {
      if (lab.phase === 'idle') return;                 // the overlay is closed; the app owns the keyboard
      if (e.key === 'Escape') { e.preventDefault(); labCloseStroop(); return; }
      // While the task is on screen NOTHING else may act on a keypress. The mode switcher listens on
      // window for 1-5, so a '2' typed mid-trial used to drop the reader into Atlas with the timer
      // still running. Escape above is the one key that still reaches anything, and it closes this.
      e.stopPropagation();
      if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
      if (lab.phase === 'intro' && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); labStart(); return; }
      if (lab.phase !== 'stimulus') return;
      const k = String(e.key || '').toLowerCase();
      if (LAB_COLORS.some((c) => c.key === k)) { e.preventDefault(); labAnswer(k); }
    };
    window.addEventListener('keydown', lab.onKey, true);
  }
  labIntro();
  return true;
}

/** Close the overlay and drop every timer and listener it owns. */
export function labCloseStroop() {
  labClearTimer();
  if (lab.onKey) { window.removeEventListener('keydown', lab.onKey, true); lab.onKey = null; }
  lab.phase = 'idle';
  if (lab.el) { lab.el.hidden = true; lab.el.classList.remove('lab-on'); lab.el.innerHTML = ''; }
  const cb = lab.onClose;
  lab.onClose = null;
  if (typeof cb === 'function') { try { cb(lab.app); } catch (err) { /* a caller's redraw must not trap the overlay open */ } }
  return true;
}

/** True while the task owns the keyboard — Pathways checks this before handling its own keys. */
export function labIsOpen() { return lab.phase !== 'idle'; }
