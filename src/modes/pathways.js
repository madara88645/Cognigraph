// Pathways mode (Worker B): pick a scenario, watch it play out region by region on the brain,
// with the evidence for each step and the pathway's caveats always on screen.
import { PATHWAYS } from '../data/pathways.js';
import { REGIONS } from '../data/regions.js';
import { registerHowTabs } from '../data/howitworks.js';
import { explain, setSidePanel, showTimeline, hoverLabel, toast } from '../ui/panels.js';

const PW_ACCENT = 0x5ee1d6;
const PW_MIN_STEP_S = 0.9;
const PW_MAX_STEP_S = 2.5;
const PW_SCHEMATIC_S = 1.8;
const PW_LAST_STEP_S = 1.6;
const PW_FLY_DISTANCE = 5.5;   // frame the step with its neighbourhood; the scene's own default is tight
const PW_MIN_MARK_PX = 24;     // no two timeline dots may sit closer than this
const PW_LABEL_MIN_PX = 56;    // below this the markers stay bare dots rather than crowding labels

const pw = {
  pathway: null,      // the selected PATHWAYS entry
  index: 0,           // current step
  playing: false,
  elapsed: 0,         // seconds spent on the current step
  duration: PW_SCHEMATIC_S,
  marks: [],          // {el, pos} timeline markers
  pos: [],            // laid-out marker positions 0..1 (raw latency spacing, de-crowded)
  playhead: null,
  fill: null,
  listeners: [],      // {el, type, fn}
  app: null,
  external: null,     // opts of a pwPlayExternal() run (Scenario mode borrows the engine); null when Pathways owns it
  transient: false,   // true while pw.pathway is a one-off object that must never survive a mode switch
  stashed: null,      // {pathway, index} parked by pwPlayExternal() so the user's own selection survives
};

/* ---------- small helpers ---------- */

function pwEl(id) { return document.getElementById(id); }

function pwOn(el, type, fn) {
  if (!el) return;
  el.addEventListener(type, fn);
  pw.listeners.push({ el, type, fn });
}

function pwOffAll() {
  for (const l of pw.listeners) l.el.removeEventListener(l.type, l.fn);
  pw.listeners.length = 0;
}

function pwEsc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function pwRegion(id) { return REGIONS.find((r) => r.id === id) || null; }

/**
 * Short display label: the trailing abbreviation if there is one ("(V1)"), otherwise the name with any
 * trailing gloss dropped — "Substantia Nigra (pars compacta)" is a title, not a label.
 */
function pwShortName(id) {
  const r = pwRegion(id);
  if (!r) return id;
  const paren = r.name.match(/\(([^()]{1,12})\)\s*$/);
  if (paren) return paren[1];
  return r.name
    .replace(/\s*\([^()]*\)\s*$/, '')
    .replace(/^(Primary |Visual Area |Middle Temporal Area )/, '')
    .replace(/ Cortex$/, '');
}

function pwStepLabel(step) {
  const names = step.region_ids.map(pwShortName);
  if (names.length <= 2) return names.join(' + ');
  return names.slice(0, 2).join(' + ') + ' +' + (names.length - 2);
}

function pwIsSchematic(p) { return !p || p.timeline === 'schematic'; }

function pwMsText(p, step) {
  return pwIsSchematic(p) ? 'schematic order' : '~' + step.approx_ms + ' ms';
}

/** Seconds to hold one step on screen: derived from the gap to the next step, clamped. */
function pwStepDuration(p, i) {
  if (pwIsSchematic(p)) return PW_SCHEMATIC_S;
  const cur = p.steps[i], next = p.steps[i + 1];
  if (!next) return PW_LAST_STEP_S;
  const gap = Math.max(0, next.approx_ms - cur.approx_ms);
  return Math.min(PW_MAX_STEP_S, Math.max(PW_MIN_STEP_S, gap / 130));
}

/** Marker position along the track, 0..1 — true latency spacing, or even for schematic pathways. */
function pwStepPos(p, i) {
  const n = p.steps.length;
  if (n <= 1) return 0.5;
  if (pwIsSchematic(p)) return i / (n - 1);
  const first = p.steps[0].approx_ms, last = p.steps[n - 1].approx_ms;
  if (last <= first) return i / (n - 1);
  return (p.steps[i].approx_ms - first) / (last - first);
}

/**
 * Marker positions along the track, 0..1: true latency spacing, then nudged apart so no two dots sit
 * closer than PW_MIN_MARK_PX. Two passes (push right, then pull back from the end) leave the order
 * intact and the first/last markers on the ends.
 */
function pwLayoutPositions(p, trackPx) {
  const n = p.steps.length;
  const raw = p.steps.map((s, i) => pwStepPos(p, i));
  if (!(trackPx > 0) || n < 2) return raw;
  const min = PW_MIN_MARK_PX / trackPx;
  if (min * (n - 1) >= 1) return raw.map((v, i) => i / (n - 1));   // no room even for even spacing
  const out = raw.slice();
  for (let i = 1; i < n; i++) out[i] = Math.max(out[i], out[i - 1] + min);
  out[n - 1] = Math.min(out[n - 1], 1);
  for (let i = n - 2; i >= 0; i--) out[i] = Math.min(out[i], out[i + 1] - min);
  return out.map((v) => Math.max(0, Math.min(1, v)));
}

/** Where step i actually sits on the track (the de-crowded position when one has been measured). */
function pwPosAt(i) {
  if (pw.pos.length > i && typeof pw.pos[i] === 'number') return pw.pos[i];
  return pw.pathway ? pwStepPos(pw.pathway, i) : 0;
}

/* ---------- side panel ---------- */

function pwRenderPanel() {
  if (pw.external) return;   // Scenario mode owns the side panel while it is borrowing the engine
  const items = PATHWAYS.map((p) => `
    <div class="list-item pw-item${pw.pathway && pw.pathway.id === p.id ? ' active' : ''}" data-pw="${pwEsc(p.id)}" role="button" tabindex="0">
      <span class="dot"></span>
      <span class="pw-item-text">
        <span class="pw-item-title">${pwEsc(p.title)}</span>
        <span class="muted">${pwEsc(p.scenario_sentence)}</span>
      </span>
    </div>`).join('');

  let steps = '';
  if (pw.pathway) {
    const p = pw.pathway;
    steps = `
      <h3>Steps — ${pwEsc(p.title)}</h3>
      <div class="list" id="pw-steps">${p.steps.map((s, i) => `
        <div class="list-item pw-step${i === pw.index ? ' active' : ''}" data-step="${i}" role="button" tabindex="0">
          <span class="pw-step-n mono">${i + 1}</span>
          <span class="pw-item-text">
            <span>${pwEsc(pwStepLabel(s))}</span>
            <span class="muted mono">${pwEsc(pwMsText(p, s))}</span>
          </span>
        </div>`).join('')}
      </div>
      <p class="note">${pwIsSchematic(p)
        ? 'The order is real; the numbers are not. This timeline is schematic.'
        : 'Latencies are group averages, not constants. Each step names its evidence.'}</p>`;
  }

  const body = setSidePanel(`
    <div class="panel-title">Pathways</div>
    <div class="panel-sub">Eight everyday moments, replayed hub by hub.</div>
    <h3>Scenarios</h3>
    <div class="list" id="pw-list">${items}</div>
    ${steps}`);

  body.querySelectorAll('.pw-item').forEach((el) => {
    const go = () => pwSelect(el.dataset.pw);
    el.addEventListener('click', go);
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
  });
  body.querySelectorAll('.pw-step').forEach((el) => {
    const go = () => { pw.playing = false; pwSyncTransport(); pwGoTo(parseInt(el.dataset.step, 10)); };
    el.addEventListener('click', go);
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
  });
}

function pwMarkPanelStep() {
  document.querySelectorAll('#pw-steps .pw-step').forEach((el) => {
    el.classList.toggle('active', parseInt(el.dataset.step, 10) === pw.index);
  });
}

/* ---------- timeline ---------- */

function pwBuildTimeline() {
  const track = pwEl('timeline-track');
  if (!track) return;
  track.innerHTML = '';
  pw.marks = [];
  pw.pos = [];
  pw.fill = null;
  pw.playhead = null;
  if (!pw.pathway) { pwReadout(''); return; }

  const fill = document.createElement('div');
  fill.className = 'tl-fill';
  track.appendChild(fill);
  pw.fill = fill;

  const trackPx = track.getBoundingClientRect().width;
  pw.pos = pwLayoutPositions(pw.pathway, trackPx);
  let minGapPx = Infinity;
  for (let i = 1; i < pw.pos.length; i++) minGapPx = Math.min(minGapPx, (pw.pos[i] - pw.pos[i - 1]) * trackPx);
  const withLabels = trackPx > 0 && minGapPx >= PW_LABEL_MIN_PX;   // otherwise: bare dots, no crowding

  track.classList.toggle('tl-labelled', withLabels);
  pw.pathway.steps.forEach((s, i) => {
    const pos = pw.pos[i];
    const m = document.createElement('button');
    m.className = 'tl-marker';
    m.type = 'button';
    m.style.left = (pos * 100) + '%';
    m.title = `Step ${i + 1}: ${pwStepLabel(s)} (${pwMsText(pw.pathway, s)})`;
    m.setAttribute('aria-label', m.title);
    if (withLabels) {
      const cap = document.createElement('span');
      cap.className = 'tl-cap';
      cap.textContent = pwShortName(s.region_ids[0]).replace(/\s*\([^()]*\)\s*$/, '');
      m.appendChild(cap);
    }
    m.addEventListener('click', (e) => {
      e.stopPropagation();
      pw.playing = false; pwSyncTransport(); pwGoTo(i);
    });
    track.appendChild(m);
    pw.marks.push({ el: m, pos });
  });

  const head = document.createElement('div');
  head.className = 'tl-playhead';
  track.appendChild(head);
  pw.playhead = head;
  pwPaintPlayhead(0);
}

function pwPaintPlayhead(frac) {
  if (!pw.pathway || !pw.playhead) return;
  const i = pw.index;
  const a = pwPosAt(i);
  const b = pwPosAt(Math.min(pw.pathway.steps.length - 1, i + 1));
  const pos = a + (b - a) * Math.max(0, Math.min(1, frac));
  pw.playhead.style.left = (pos * 100) + '%';
  if (pw.fill) pw.fill.style.width = (pos * 100) + '%';
  pw.marks.forEach((m, k) => m.el.classList.toggle('done', k <= i));
}

function pwReadout(text) {
  const el = pwEl('timeline-readout');
  if (el) el.textContent = text;
}

function pwSyncTransport() {
  const play = pwEl('tl-play');
  if (play) { play.textContent = pw.playing ? '⏸' : '▶'; play.title = pw.playing ? 'Pause (space)' : 'Play (space)'; }
}

/* ---------- playback ---------- */

function pwSelect(id) {
  const p = PATHWAYS.find((x) => x.id === id);
  if (!p) return;
  pw.pathway = p;
  pw.index = 0;
  pw.elapsed = 0;
  pw.playing = true;
  pwRenderPanel();
  pwBuildTimeline();
  pwSyncTransport();
  pwGoTo(0, { pulse: false });
}

/** Playback colour: the borrowing mode's accent when the engine is on loan, otherwise Pathways' own. */
function pwColor() {
  return (pw.external && typeof pw.external.color === 'number') ? pw.external.color : PW_ACCENT;
}

function pwHighlight() {
  const app = pw.app;
  if (!app || !app.scene || !pw.pathway) return;
  const scene = app.scene;
  const color = pwColor();
  scene.clearHighlights();
  for (let k = 0; k <= pw.index; k++) {
    const w = k === pw.index ? 1 : 0.25;      // earlier steps stay dimly lit, they have not switched off
    for (const id of pw.pathway.steps[k].region_ids) scene.highlight(id, w, color);
  }
}

function pwPulseInto(i) {
  const app = pw.app;
  if (!app || !app.scene || !pw.pathway || i <= 0) return;
  const prev = pw.pathway.steps[i - 1].region_ids;
  const cur = pw.pathway.steps[i].region_ids;
  const n = Math.min(4, Math.max(prev.length, cur.length));
  for (let k = 0; k < n; k++) {
    const from = prev[k % prev.length], to = cur[k % cur.length];
    if (!from || !to || from === to) continue;
    try {
      const pr = app.scene.pulse(from, to, { color: pwColor(), duration: 0.85 });
      if (pr && typeof pr.catch === 'function') pr.catch(() => {});
    } catch (err) { /* a region missing from the 3D model must never break playback */ }
  }
}

function pwExplainStep() {
  const p = pw.pathway;
  if (!p) return;
  const s = p.steps[pw.index];
  const schematic = pwIsSchematic(p);
  // The title names every region in the step (the side-panel list is where the label gets truncated),
  // so the card does not need a separate "lit up" line under the prose.
  const names = s.region_ids.map(pwShortName).join(' + ');
  const title = `Step ${pw.index + 1} of ${p.steps.length} · ${names} · ${schematic ? 'schematic order' : '~' + s.approx_ms + ' ms'}`;
  explain({
    title,
    badge: schematic ? 'schematic timeline' : 'approximate timing',
    badgeClass: schematic ? 'mid' : '',
    html: `
      <p class="pw-lede">${pwEsc(s.what_happens)}</p>
      ${s.why_it_matters ? `<details class="pw-more">
        <summary>Why it matters</summary>
        <p>${pwEsc(s.why_it_matters)}</p>
      </details>` : ''}
      ${s.evidence_or_method ? `<details class="pw-more">
        <summary>How we know</summary>
        <p class="muted">${pwEsc(s.evidence_or_method)}</p>
      </details>` : ''}
      <div class="note">${pwEsc(p.accuracy_caveats)}</div>`,
  });
}

function pwGoTo(i, opts = {}) {
  const p = pw.pathway;
  if (!p) return;
  const n = p.steps.length;
  const next = Math.max(0, Math.min(n - 1, i));
  const moved = next !== pw.index || opts.force;
  pw.index = next;
  pw.elapsed = 0;
  pw.duration = pwStepDuration(p, next);

  pwHighlight();
  if (opts.pulse !== false && moved) pwPulseInto(next);
  const first = p.steps[next].region_ids[0];
  if (pw.app && pw.app.scene && first) {
    try { pw.app.scene.flyTo(first, { duration: 0.9, distance: PW_FLY_DISTANCE }); } catch (err) { /* ignore */ }
  }
  if (pw.external) { if (typeof pw.external.onStep === 'function') pw.external.onStep(next, p.steps[next], p); }
  else pwExplainStep();
  pwMarkPanelStep();
  pwPaintPlayhead(0);
  pwReadout(pwIsSchematic(p) ? 'schematic' : '~' + p.steps[next].approx_ms + ' ms');
}

function pwStepBy(delta) {
  if (!pw.pathway) return;
  const n = pw.pathway.steps.length;
  const next = pw.index + delta;
  if (next < 0 || next > n - 1) return;
  pwGoTo(next);
}

function pwTogglePlay() {
  if (!pw.pathway) { toast('Pick a scenario first.'); return; }
  if (!pw.playing && pw.index >= pw.pathway.steps.length - 1) pwGoTo(0, { pulse: false, force: true });
  pw.playing = !pw.playing;
  pwSyncTransport();
}

function pwIntro() {
  explain({
    title: 'Cognitive pathways',
    html: `
      <p>Pick one of the eight everyday moments on the left. Its regions light up in order, and every
      step opens with one sentence, with the reasoning and the evidence behind it.</p>
      <p class="muted"><span class="mono">←</span> <span class="mono">→</span> step ·
      <span class="mono">space</span> plays · click a timeline marker to jump.</p>
      <div class="note">Teaching sequences, not recordings: a lit region is a major hub, not the whole
      story, and the millisecond values are group averages. Two of the eight are far too slow for
      milliseconds and are marked schematic.</div>`,
  });
}

/** Transport + track + resize wiring. Shared by PathwaysMode.enter() and pwPlayExternal(). */
function pwWireTimeline() {
  pwOn(pwEl('tl-play'), 'click', pwTogglePlay);
  pwOn(pwEl('tl-prev'), 'click', () => { pw.playing = false; pwSyncTransport(); pwStepBy(-1); });
  pwOn(pwEl('tl-next'), 'click', () => { pw.playing = false; pwSyncTransport(); pwStepBy(1); });
  pwOn(pwEl('timeline-track'), 'click', (e) => {
    if (!pw.pathway || !pw.marks.length) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - r.left) / Math.max(1, r.width);
    let best = 0, bestD = Infinity;
    pw.marks.forEach((m, i) => { const d = Math.abs(m.pos - x); if (d < bestD) { bestD = d; best = i; } });
    pw.playing = false; pwSyncTransport(); pwGoTo(best);
  });
  pwOn(window, 'resize', () => {
    if (!pw.pathway) return;
    pwBuildTimeline();
    pwPaintPlayhead(pw.duration > 0 ? pw.elapsed / pw.duration : 0);
  });
}

/* ---------- borrowing the engine (Scenario mode) ---------- */

/**
 * Play a PATHWAYS-shaped object that is NOT in the list — used by Scenario mode to replay an LLM or
 * heuristic result with the same sequencer, camera moves, pulses and timeline.
 *
 * The pathway is transient: it never enters PATHWAYS, never renders the Pathways side panel, and the
 * Explain panel is left alone (the caller gets `opts.onStep(i, step, pathway)` instead, so it can mark
 * its own result card). Driving it needs `PathwaysMode.update(dt, app)` to be called each frame.
 *
 * @param {object} pathwayLike {title, scenario_sentence?, steps[{region_ids[], approx_ms|null, what_happens, why_it_matters}], accuracy_caveats?}
 * @param {object} opts {app, onStep}
 * @returns {object|null} the transient pathway actually played, or null if it had no usable steps
 */
export function pwPlayExternal(pathwayLike, opts = {}) {
  if (opts.app) pw.app = opts.app;
  const src = (pathwayLike && Array.isArray(pathwayLike.steps)) ? pathwayLike.steps : [];
  const steps = src
    .filter((s) => s && Array.isArray(s.region_ids) && s.region_ids.length)
    .map((s, i) => ({
      region_ids: s.region_ids.slice(),
      approx_ms: (typeof s.approx_ms === 'number' && isFinite(s.approx_ms)) ? s.approx_ms : i * 200,
      what_happens: s.what_happens || '',
      why_it_matters: s.why_it_matters || '',
      evidence_or_method: s.evidence_or_method || '',
    }));
  if (!steps.length) return null;

  // Real millisecond values only when every step carried one, and only when they actually advance:
  // otherwise the markers would claim a latency spacing the numbers do not support.
  const allMs = src.length === steps.length && src.every((s) => typeof s.approx_ms === 'number' && isFinite(s.approx_ms));
  const increasing = steps.every((s, i) => i === 0 || s.approx_ms >= steps[i - 1].approx_ms);
  const spread = steps[steps.length - 1].approx_ms - steps[0].approx_ms;

  pwOffAll();
  // Park a real selection so a Scenario replay does not cost the user their place in Pathways. Only the
  // first external run stashes: a second replay must not overwrite the stash with a transient pathway.
  if (pw.pathway && !pw.transient) pw.stashed = { pathway: pw.pathway, index: pw.index };
  pw.external = opts;
  pw.transient = true;
  pw.pathway = {
    id: pathwayLike.id || 'scenario-transient',
    timeline: (allMs && increasing && spread > 0 && spread <= 120000) ? 'ms' : 'schematic',
    title: pathwayLike.title || 'Scenario',
    scenario_sentence: pathwayLike.scenario_sentence || '',
    steps,
    accuracy_caveats: pathwayLike.accuracy_caveats || '',
  };
  pw.index = 0;
  pw.elapsed = 0;
  pw.playing = true;
  showTimeline(true);
  pwWireTimeline();
  pwBuildTimeline();
  pwSyncTransport();
  pwGoTo(0, { pulse: false, force: true });
  return pw.pathway;
}

/** Stop a pwPlayExternal() run and put the engine back exactly as PathwaysMode.exit() leaves it. */
export function pwStopExternal() {
  if (!pw.external && !pw.transient) return;
  pw.playing = false;
  pw.external = null;
  pw.transient = false;
  // Put the user's own selection back rather than clearing it: returning to Pathways after a Scenario
  // replay should land on the pathway (and step) they had open, not on the empty intro.
  pw.pathway = pw.stashed ? pw.stashed.pathway : null;
  pw.index = pw.stashed ? pw.stashed.index : 0;
  pw.stashed = null;
  pwOffAll();
  showTimeline(false);
  const track = pwEl('timeline-track');
  if (track) track.innerHTML = '';
  pw.marks = []; pw.pos = []; pw.playhead = null; pw.fill = null;
  if (pw.app && pw.app.scene) pw.app.scene.clearHighlights();
}

/* ---------- mode ---------- */

export const PathwaysMode = {
  id: 'pathways',
  label: 'Pathways',
  accent: PW_ACCENT,

  enter(app) {
    pw.app = app;
    // A Scenario replay may have left a transient pathway behind; Pathways only ever shows its own eight.
    if (pw.transient) { pw.pathway = null; pw.index = 0; }
    pw.external = null;
    pw.transient = false;
    pw.stashed = null;         // pw.pathway is authoritative in this mode; a stash here would be stale
    registerHowTabs();
    showTimeline(true);
    pwRenderPanel();
    pwSyncTransport();
    pwWireTimeline();

    if (pw.pathway) { pwBuildTimeline(); pwGoTo(pw.index, { pulse: false, force: true }); } else { pwBuildTimeline(); pwIntro(); }
  },

  exit(app) {
    pw.playing = false;
    pw.external = null;
    if (pw.transient) { pw.transient = false; pw.pathway = null; pw.index = 0; }
    pw.stashed = null;
    pwOffAll();
    hoverLabel(null);
    showTimeline(false);
    const track = pwEl('timeline-track');
    if (track) track.innerHTML = '';
    pw.marks = []; pw.pos = []; pw.playhead = null; pw.fill = null;
    if (app && app.scene) app.scene.clearHighlights();
  },

  update(dt, app) {
    if (!pw.pathway) return;
    if (!pw.playing) return;
    pw.elapsed += dt;
    const frac = pw.duration > 0 ? pw.elapsed / pw.duration : 1;
    pwPaintPlayhead(frac);
    if (frac >= 1) {
      if (pw.index >= pw.pathway.steps.length - 1) {
        pw.playing = false;
        pwSyncTransport();
        pwPaintPlayhead(0);
      } else {
        pwGoTo(pw.index + 1);
      }
    }
  },

  onPick(id, app) {
    if (!id) return;
    if (!pw.pathway) { const r = pwRegion(id); if (r) toast(`${r.name} — pick a scenario to see it in a sequence.`); return; }
    const i = pw.pathway.steps.findIndex((s) => s.region_ids.indexOf(id) >= 0);
    if (i >= 0) { pw.playing = false; pwSyncTransport(); pwGoTo(i, { force: true }); }
    else toast(`${pwShortName(id)} is not part of ${pw.pathway.title}.`);
  },

  onHover(id, app, pos) {
    const r = id ? pwRegion(id) : null;
    hoverLabel(r ? r.name : null, pos);
  },

  onKey(e) {
    if (e.key === 'ArrowLeft') { pw.playing = false; pwSyncTransport(); pwStepBy(-1); return true; }
    if (e.key === 'ArrowRight') { pw.playing = false; pwSyncTransport(); pwStepBy(1); return true; }
    if (e.key === ' ' || e.key === 'Spacebar') { pwTogglePlay(); return true; }
    return false;
  },
};
