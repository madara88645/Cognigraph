// Pathways mode (Worker B): pick a scenario, watch it play out region by region on the brain,
// with the evidence for each step and the pathway's caveats always on screen.
import { PATHWAYS } from '../data/pathways.js';
import { REGIONS } from '../data/regions.js';
import { MOD_BADGE_LABEL, modTiming, modWorstBadge } from '../data/modulation.js';
import { registerHowTabs } from '../data/howitworks.js';
import { labCloseStroop, labIsOpen, labLoadMeasures, labMeasureUsable, labOpenStroop } from '../lab/stroop.js';
import { explain, setSidePanel, showTimeline, hoverLabel, toast } from '../ui/panels.js';

const PW_ACCENT = 0x5ee1d6;
const PW_MIN_STEP_S = 0.9;
const PW_MAX_STEP_S = 2.5;
const PW_SCHEMATIC_S = 1.8;
const PW_LAST_STEP_S = 1.6;
const PW_FLY_DISTANCE = 5.5;   // frame the step with its neighbourhood; the scene's own default is tight
const PW_MIN_MARK_PX = 24;     // no two timeline dots may sit closer than this
const PW_LABEL_MIN_PX = 56;    // below this the markers stay bare dots rather than crowding labels

/** How each evidence tier is shown: badge class + the words on the badge. */
const PW_TIER = {
  human_direct: { cls: 'ok', label: 'Human recording' },
  animal_inferred: { cls: 'mid', label: 'Animal model' },
  estimated: { cls: 'low', label: 'Estimated' },
};

/** Pathways whose steps are close enough to the Stroop task to sit beside a personal measurement. */
const PW_MEASURE_PATHWAYS = ['attention_shift', 'making_decision'];

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

/* ---------- modulator-weighted timing ---------- */

/**
 * What the Neurons sliders do to this step's latency, or null when nothing scales it: schematic
 * pathways (their numbers are an animation order), a borrowed transient pathway, or no rule in play.
 */
function pwTiming(p, i) {
  if (!p || pwIsSchematic(p) || pw.transient) return null;
  const mods = pw.app && pw.app.modulators;
  if (!mods) return null;
  const t = modTiming(p.id, i, p.steps[i].approx_ms, mods);
  return t.active.length ? t : null;
}

/**
 * Every step's effective latency, in order. Steps are scaled one by one, so two neighbours with
 * different sensitivities could otherwise swap places; a running floor keeps the sequence a sequence,
 * because a later step arriving earlier than an earlier one would be a claim about the brain, not a
 * knob effect.
 */
function pwEffMsSeq(p) {
  let prev = -Infinity;
  return p.steps.map((s, i) => {
    const t = pwTiming(p, i);
    let ms = (t && t.changed) ? t.ms : s.approx_ms;
    if (ms < prev) ms = prev;
    prev = ms;
    return ms;
  });
}

/** Milliseconds actually used for the readout and for playback pacing. */
function pwEffMs(p, i) { return pwEffMsSeq(p)[i]; }

function pwAnyScaled(p) {
  if (!p || pwIsSchematic(p)) return false;
  return pwEffMsSeq(p).some((ms, i) => ms !== p.steps[i].approx_ms);
}

function pwMsText(p, step, i) {
  if (pwIsSchematic(p)) return 'schematic order';
  const ms = (typeof i === 'number') ? pwEffMs(p, i) : step.approx_ms;
  return '~' + ms + ' ms';
}

/** Seconds to hold one step on screen: derived from the (scaled) gap to the next step, clamped. */
function pwStepDuration(p, i) {
  if (pwIsSchematic(p)) return PW_SCHEMATIC_S;
  if (!p.steps[i + 1]) return PW_LAST_STEP_S;
  const gap = Math.max(0, pwEffMs(p, i + 1) - pwEffMs(p, i));
  return Math.min(PW_MAX_STEP_S, Math.max(PW_MIN_STEP_S, gap / 130));
}

/* ---------- lesions: which steps the replay can no longer promise ---------- */

function pwLesionSet() {
  const s = pw.app && pw.app.lesions;
  return (s && typeof s.has === 'function' && s.size) ? s : null;
}

/** The regions of this step that are currently lesioned in Atlas. */
function pwBrokenIn(step) {
  const les = pwLesionSet();
  if (!les) return [];
  return step.region_ids.filter((id) => les.has(id));
}

/**
 * broken = a step whose own region is lesioned. dimmed = a later step that either shares a region
 * with a broken one or is the pathway's last step: once something upstream is gone, the sequence
 * cannot land where the timeline says it lands.
 */
function pwBreakMap(p) {
  const broken = new Set(), dimmed = new Set();
  if (!p || !pwLesionSet()) return { broken, dimmed };
  const brokenIds = new Set();
  p.steps.forEach((s, i) => {
    const hit = pwBrokenIn(s);
    if (hit.length) { broken.add(i); for (const id of hit) brokenIds.add(id); }
  });
  if (!broken.size) return { broken, dimmed };
  let first = Infinity;
  broken.forEach((i) => { if (i < first) first = i; });
  p.steps.forEach((s, i) => {
    if (i <= first || broken.has(i)) return;
    if (s.region_ids.some((id) => brokenIds.has(id)) || i === p.steps.length - 1) dimmed.add(i);
  });
  return { broken, dimmed };
}

/**
 * Split prose into sentences. The step card shows one or two of them and folds the rest away, so the
 * card never grows taller than the panel it lives in.
 *
 * Lossless on purpose: the pieces put back together are the original text, so nothing a caveat says
 * can go missing between the visible part and the folded one. A full stop only ends a sentence when
 * whitespace (or the end of the string) follows it — otherwise "1.5 seconds" would be two sentences,
 * and the first half of the number would be dropped.
 */
function pwSentences(text) {
  const t = String(text || '').trim();
  if (!t) return [];
  const out = [];
  let start = 0;
  for (let i = 0; i < t.length; i++) {
    if ('.!?'.indexOf(t[i]) < 0) continue;
    let j = i + 1;
    while (j < t.length && '.!?\'")]'.indexOf(t[j]) >= 0) j++;   // "…?!" and closing quotes belong to it
    if (j < t.length && !/\s/.test(t[j])) { i = j - 1; continue; }
    out.push(t.slice(start, j).trim());
    start = j;
    i = j - 1;
  }
  const tail = t.slice(start).trim();
  if (tail) out.push(tail);
  return out;
}

/**
 * The pathway caveat, as it appears at the foot of a step card: two sentences in the note itself and
 * the remainder behind a disclosure, so the note stays the same height whatever pathway is open.
 */
function pwCaveatHtml(text) {
  const all = pwSentences(text);
  const head = all.slice(0, 2).join(' ');
  const tail = all.slice(2);
  return `<div class="note pw-caveat">${pwEsc(head)}${tail.length ? `
    <details class="pw-more pw-caveat-more">
      <summary>The rest of the caveat</summary>
      ${tail.map((line) => `<p>${pwEsc(line)}</p>`).join('')}
    </details>` : ''}</div>`;
}

/** One line saying what the rest of the sequence would look like with this region gone. */
function pwDownstreamLine(p, i, names) {
  const later = [];
  pwBreakMap(p).dimmed.forEach((k) => { if (k > i) later.push(k + 1); });
  later.sort((a, b) => a - b);
  if (!later.length) return 'The later steps still run, but whatever this region contributes is missing from them.';
  const one = later.length === 1;
  const list = one
    ? 'step ' + later[0] + ' is'
    : 'steps ' + later.slice(0, -1).join(', ') + ' and ' + later[later.length - 1] + ' are';
  const tail = one
    ? 'it leans on the same region, or it is where the sequence was meant to arrive'
    : 'they lean on the same region, or they are where the sequence was meant to arrive';
  return `With ${names} out, ${list} dimmed on the timeline: ${tail}.`;
}

/** Repair every lesion from inside Pathways (Atlas owns the set; this only empties it). */
function pwResetLesions() {
  const app = pw.app;
  if (!app || !app.lesions) return;
  app.lesions.clear();
  if (app.scene && typeof app.scene.clearLesions === 'function') {
    try { app.scene.clearLesions(); } catch (err) { /* a scene without lesion support must not break the button */ }
  }
  pwRenderPanel();
  pwBuildTimeline();
  pwPaintPlayhead(pw.duration > 0 ? pw.elapsed / pw.duration : 0);
  if (pw.pathway && !pw.external) pwExplainStep();
  toast('All lesions repaired');
}

/* ---------- evidence tier + personal measurement ---------- */

function pwTierBadge(step) {
  const t = PW_TIER[step && step.evidence_tier] || PW_TIER.estimated;
  return `<span class="badge ${t.cls} pw-tier" title="${pwEsc(step && step.tier_reason || '')}">${t.label}</span>`;
}

function pwMeasurement() {
  const m = pw.app && pw.app.measure && pw.app.measure.stroop;
  return labMeasureUsable(m) ? m : null;
}

/** "Your timing" line, only on the two pathways the Stroop task actually speaks to. */
function pwMeasureHtml(p) {
  if (!p || PW_MEASURE_PATHWAYS.indexOf(p.id) < 0) return '';
  const m = pwMeasurement();
  if (!m) return '';
  return `<div class="pw-yours">Your Stroop interference: <span class="mono">${Math.round(m.interference)} ms</span> (n=${m.n}).</div>
    <div class="note pw-soft">That is a reaction-time cost from a colour-word task, not a stage latency — shown for
      interest, not for comparison with the ms above. One session on one keyboard, and not diagnostic.</div>`;
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
    const { broken, dimmed } = pwBreakMap(p);
    const n = pwLesionSet() ? pwLesionSet().size : 0;
    const chip = n ? `<div class="pw-lesion-chip">
        <span class="badge danger">${n} region${n === 1 ? '' : 's'} lesioned in Atlas</span>
        <span class="muted">·</span>
        <button class="text-btn pw-lesion-reset" type="button">Reset</button>
      </div>` : '';
    steps = `
      <h3>Steps — ${pwEsc(p.title)}</h3>
      ${chip}
      <div class="list" id="pw-steps">${p.steps.map((s, i) => `
        <div class="list-item pw-step${i === pw.index ? ' active' : ''}${broken.has(i) ? ' pw-step-broken' : ''}${dimmed.has(i) ? ' pw-step-dimmed' : ''}" data-step="${i}" role="button" tabindex="0">
          <span class="pw-step-n mono">${i + 1}</span>
          <span class="pw-item-text">
            <span>${pwEsc(pwStepLabel(s))}</span>
            <span class="muted mono">${pwEsc(pwMsText(p, s, i))}</span>
          </span>
        </div>`).join('')}
      </div>
      <p class="note pw-caveat">${pwIsSchematic(p)
        ? 'The order is real; the numbers are not. This timeline is schematic.'
        : 'Latencies are group averages, not constants. Each step names its evidence.'}</p>`;
  }

  const m = pwMeasurement();
  const measure = `
    <h3>Your own timing</h3>
    <button class="text-btn pw-measure" type="button">Measure yourself</button>
    <p class="muted pw-measure-note">${m
      ? `Last Stroop run: <span class="mono">${Math.round(m.interference)} ms</span> interference over ${m.n} trials.`
      : 'A 24-trial Stroop task, about a minute. It runs and stays on this device.'}</p>`;

  const body = setSidePanel(`
    <div class="panel-title">Pathways</div>
    <div class="panel-sub">Eight everyday moments, replayed hub by hub.</div>
    <h3>Scenarios</h3>
    <div class="list" id="pw-list">${items}</div>
    ${steps}
    ${measure}`);

  const reset = body.querySelector('.pw-lesion-reset');
  if (reset) reset.addEventListener('click', pwResetLesions);
  const measureBtn = body.querySelector('.pw-measure');
  if (measureBtn) measureBtn.addEventListener('click', () => {
    pw.playing = false; pwSyncTransport();
    labOpenStroop(pw.app, () => { pwRenderPanel(); if (pw.pathway) pwExplainStep(); });
  });

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
  const { broken, dimmed } = pwBreakMap(pw.pathway);
  pw.pathway.steps.forEach((s, i) => {
    const pos = pw.pos[i];
    const m = document.createElement('button');
    const tier = PW_TIER[s.evidence_tier] ? s.evidence_tier : 'estimated';
    m.className = 'tl-marker tl-tier-' + tier + (broken.has(i) ? ' tl-broken' : '') + (dimmed.has(i) ? ' tl-dimmed' : '');
    m.type = 'button';
    m.style.left = (pos * 100) + '%';
    m.title = `Step ${i + 1}: ${pwStepLabel(s)} (${pwMsText(pw.pathway, s, i)}) · ${PW_TIER[tier].label}`
      + (s.tier_reason ? ' — ' + s.tier_reason : '')
      + (broken.has(i) ? ' · lesioned, this step is broken' : (dimmed.has(i) ? ' · downstream of a lesion' : ''));
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
  pwTimelineNote(pwAnyScaled(pw.pathway) ? 'Timing scaled by your Neurons sliders (direction only)' : '');
  pwPaintPlayhead(0);
}

/** One muted line attached to the timeline bar; pass '' to remove it. */
function pwTimelineNote(text) {
  const bar = pwEl('timeline');
  if (!bar) return;
  let el = bar.querySelector('.pw-tl-note');
  if (!text) { if (el) el.remove(); return; }
  if (!el) { el = document.createElement('div'); el.className = 'pw-tl-note muted'; bar.appendChild(el); }
  el.textContent = text;
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
  const i = pw.index;
  const s = p.steps[i];
  const schematic = pwIsSchematic(p);
  // The title names every region in the step (the side-panel list is where the label gets truncated),
  // so the card does not need a separate "lit up" line under the prose.
  const names = s.region_ids.map(pwShortName).join(' + ');
  const title = `Step ${i + 1} of ${p.steps.length} · ${names} · ${pwMsText(p, s, i)}`;

  /* --- lesioned? the step still plays, but it says what is missing --- */
  const brokenIds = pwBrokenIn(s);
  let brokenHtml = '';
  if (brokenIds.length) {
    const brokenNames = brokenIds.map((id) => { const r = pwRegion(id); return r ? r.name : id; }).join(' and ');
    // Two sentences on the card by default: the bold lead and the first thing the deficit does.
    // Everything else — the rest of the lesion text and what it costs downstream — folds away.
    const effects = [];
    for (const id of brokenIds) {
      const r = pwRegion(id);
      if (r) for (const line of pwSentences(r.lesion_effects).slice(0, 2)) effects.push(line);
    }
    const lead = effects.length ? effects[0] : '';
    const rest = effects.slice(1);
    brokenHtml = `<div class="note pw-broken">
      <strong>Broken here: ${pwEsc(brokenNames)}.</strong> ${pwEsc(lead)}
      <details class="pw-more pw-broken-more">
        <summary>What it costs the rest of the sequence</summary>
        ${rest.map((line) => `<p>${pwEsc(line)}</p>`).join('')}
        <p>${pwEsc(pwDownstreamLine(p, i, brokenNames))}</p>
      </details>
    </div>`;
  }

  /* --- modulator-weighted timing --- */
  const t = pwTiming(p, i);
  const eff = pwEffMs(p, i);
  let timingHtml = '';
  if (t && eff !== s.approx_ms) {
    const worst = modWorstBadge(t.active.map((a) => a.rule));
    const who = t.active.map((a) => `${a.rule.modulator} ${a.level}`).join(', ');
    // The card carries two badges at most (the header one and the evidence tier), so the confidence
    // of the scaling rule lives in this line's tooltip and, in full, in the disclosure under it.
    const tip = `${MOD_BADGE_LABEL[worst]} — direction only; the millisecond size of these effects is not established.`;
    timingHtml = `
      <div class="pw-timing" title="${pwEsc(tip)}">
        <span>Timing: <span class="mono">~${s.approx_ms} ms</span> → <span class="mono">~${eff} ms</span> · ${pwEsc(who)}</span>
        <span class="pw-timing-conf">${pwEsc(MOD_BADGE_LABEL[worst].toLowerCase())}</span>
      </div>
      <details class="pw-more">
        <summary>Why this moves</summary>
        ${t.active.map((a) => `<p class="muted">${pwEsc(a.rule.why)}</p>`).join('')}
        <p class="muted">Direction only. The sign of these effects is textbook; the millisecond size is not.</p>
      </details>`;
  }

  explain({
    title,
    badge: brokenIds.length ? 'Illustrative disconnection' : (schematic ? 'schematic timeline' : 'approximate timing'),
    badgeClass: brokenIds.length ? 'danger' : (schematic ? 'mid' : ''),
    html: `
      <div class="pw-meta">${pwTierBadge(s)}<span class="mono pw-ms">${pwEsc(pwMsText(p, s, i))}</span></div>
      <p class="pw-lede">${pwEsc(s.what_happens)}</p>
      ${brokenHtml}
      ${timingHtml}
      ${pwMeasureHtml(p)}
      ${s.why_it_matters ? `<details class="pw-more">
        <summary>Why it matters</summary>
        <p>${pwEsc(s.why_it_matters)}</p>
      </details>` : ''}
      ${s.evidence_or_method ? `<details class="pw-more">
        <summary>How we know</summary>
        <p class="muted">${pwEsc(s.evidence_or_method)}</p>
        <p class="muted"><strong>${PW_TIER[s.evidence_tier] ? PW_TIER[s.evidence_tier].label : 'Estimated'}:</strong> ${pwEsc(s.tier_reason || '')}</p>
      </details>` : ''}
      ${pwCaveatHtml(p.accuracy_caveats)}`,
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
  const scaled = !pwIsSchematic(p) && pwEffMs(p, next) !== p.steps[next].approx_ms;
  pwReadout(pwIsSchematic(p) ? 'schematic' : pwMsText(p, p.steps[next], next) + (scaled ? ' · scaled' : ''));
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
      <details class="pw-more">
        <summary>What the badges on each step mean</summary>
        <p><span class="badge ok">Human recording</span> a named human ERP, MEG or intracranial result backs
        the region and roughly the timing.</p>
        <p><span class="badge mid">Animal model</span> the main support is monkey or rodent work, and the
        human number is inferred from it.</p>
        <p><span class="badge low">Estimated</span> the step is real but its millisecond value is
        extrapolated, or the pathway is schematic.</p>
      </details>
      <p class="muted">Lesion a region in Atlas and the steps that use it are marked broken here. Move the
      Neurons sliders and the step timings scale with them, direction only.</p>
      ${pwCaveatHtml('Teaching sequences, not recordings: a lit region is a major hub, not the whole story, and '
        + 'the millisecond values are group averages. Two of the eight are far too slow for milliseconds and are '
        + 'marked schematic.')}`,
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
  pwTimelineNote('');
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
    labLoadMeasures(app);      // a Stroop result from an earlier visit belongs on the step cards
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
    if (labIsOpen()) labCloseStroop();
    pwOffAll();
    hoverLabel(null);
    pwTimelineNote('');
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
    // While the Stroop overlay is up it owns the keyboard completely. Claiming every key here is what
    // actually stops the mode switcher: panels.js asks the active mode first and returns the moment a
    // mode says it handled the key, so '2' can no longer drop the reader into Atlas mid-trial. (The
    // overlay's own capture listener stops real key events earlier; this covers the rest, including
    // events dispatched straight at window, where a capture listener has no head start.) Escape never
    // reaches here — panels.js takes it first — so the overlay can still be closed.
    if (labIsOpen()) return true;
    if (e.key === 'ArrowLeft') { pw.playing = false; pwSyncTransport(); pwStepBy(-1); return true; }
    if (e.key === 'ArrowRight') { pw.playing = false; pwSyncTransport(); pwStepBy(1); return true; }
    if (e.key === ' ' || e.key === 'Spacebar') { pwTogglePlay(); return true; }
    return false;
  },
};
