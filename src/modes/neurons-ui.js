// Neurons mode (Worker B): 150 Izhikevich point neurons running live, with honest controls.
// Sliders -> neurons-core.js (pure). Plots are 2D canvases drawn incrementally; the 3D dots are one
// InstancedMesh handed to the scene as an overlay. Nothing here narrates the network mentalistically.
import { NEURON_PRESETS, NEUROMOD_DEFS } from '../data/neuro.js';
import { NEUROMOD_UI, neuroConfidenceBadge, registerHowTabs } from '../data/howitworks.js';
import { createNetwork, nsimStep, nsimSanitize, resetNetwork, nsimBufferCap, nsimTrim, NSIM_DEFAULTS, NSIM_RANGES } from './neurons-core.js';
import { explain, setSidePanel, showNeuronPlots, toast } from '../ui/panels.js';
import { askMount } from '../ui/ask.js';

const NS_ACCENT = 0xf5b74a;
const NS_COL_E = '#f5b74a';       // excitatory: amber (mode accent)
const NS_COL_I = '#6aa6ff';       // inhibitory: blue
const NS_WINDOW_MS = 3000;        // rolling plot window, in simulated ms
const NS_BIN_MS = 10;             // population-rate bin
const NS_MAX_TICKS_PER_FRAME = 24;
const NS_TICKS_PER_SEC = 120;     // at speed 1x: 120 simulated ms per real second (4 sub-steps/frame @60fps)
const NS_KEEP_MS = NS_WINDOW_MS * 1.2;   // slack the rolling buffers keep beyond the drawn window
const NS_SPIKES_PER_MS = 3;       // assumed population ceiling (150 cells at ~20 Hz mean) for the spike buffer
const NS_TALL_VIEWPORT = 900;     // px of viewport height above which the secondary plots open by default

/* The 3D population disc is an inset, not part of the anatomy: it is anchored in SCREEN space at the
   bottom left of the stage (clear of the side panel, and never over the brainstem) and drawn in front
   of everything. Sizes are fractions of the viewport, so they hold at any window size. */
const NS_DISC_DIST = 1.15;        // world units in front of the camera (the brain sits ~4.5 away)
const NS_DISC_FRAC = 0.08;        // disc DIAMETER as a fraction of viewport height
const NS_DISC_DOT = 1.35;         // dot size relative to a straight scale-down, so they stay visible
const NS_DISC_GAP = 64;           // px to the right of the side panel's edge
const NS_DISC_Y = 0.78;           // down the stage, 0 = top

/* Hypothesis card: 3 s of simulated time on each side of the profile change. */
const NS_HYP_MS = 3000;
const NS_HYP_MIN_SPAN = 1200;     // usable history before the change; below this we measure a fresh baseline
const NS_HYP_FLAT = 0.06;         // |score| under this predicts "about the same" rather than a direction

const ns = {
  net: null,
  params: null,
  running: true,
  app: null,
  tickAcc: 0,
  highlight: 0,
  spkT: [], spkI: [],                     // rolling spike buffer
  trT: [], trV: [], trU: [],              // membrane trace of the highlighted neuron
  rtT: [], rtE: [], rtI: [],              // binned population rate
  binT: 0, binE: 0, binI: 0,
  rateE: 0, rateI: 0,
  plots: null,
  overlay: null, act: null, dummy: null, colE: null, colI: null, tmpCol: null,
  listeners: [],
  ro: null,                               // ResizeObserver on the plots container
  statusEl: null, statusAcc: 0,
  lastExplainKey: '',
  applied: null,                          // {beforeParams, before, after, profile} from the last Scenario hand-off
  hyp: null,                              // live hypothesis card (see nsSetHypothesis)
  discNdc: null,                          // cached screen anchor for the population disc
};

/* ---------- helpers ---------- */

function nsEl(id) { return document.getElementById(id); }
function nsEsc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function nsClamp(x, lo, hi) { return x < lo ? lo : (x > hi ? hi : x); }

function nsOn(el, type, fn) {
  if (!el) return;
  el.addEventListener(type, fn);
  ns.listeners.push({ el, type, fn });
}
function nsOffAll() {
  for (const l of ns.listeners) l.el.removeEventListener(l.type, l.fn);
  ns.listeners.length = 0;
}

/**
 * Per-buffer ceilings, derived from the plot window rather than a flat constant, so a maxed-out
 * speed/current slider cannot pile up megabytes before the first trim. Memoised, not computed at
 * top level, because nothing in this file may run at module scope.
 */
let nsCapCache = null;
function nsCaps() {
  if (!nsCapCache) {
    nsCapCache = {
      spikes: nsimBufferCap(NS_WINDOW_MS, NS_SPIKES_PER_MS, NS_MAX_TICKS_PER_FRAME),
      trace: nsimBufferCap(NS_WINDOW_MS, 1, NS_MAX_TICKS_PER_FRAME),
      rate: nsimBufferCap(NS_WINDOW_MS, 1 / NS_BIN_MS, NS_MAX_TICKS_PER_FRAME),
    };
  }
  return nsCapCache;
}

/** Read-only snapshot for browser checks: NeuroScope.neurons.debug(). */
function nsDebug() {
  const net = ns.net;
  return Object.freeze({
    t: net ? net.t : 0,
    ticks: net ? net.ticks : 0,
    diverged: net ? net.diverged : 0,
    running: ns.running,
    speed: ns.params ? ns.params.speed : 0,
    rateE: ns.rateE, rateI: ns.rateI,
    buffers: Object.freeze({
      spikes: ns.spkT.length, spikeIds: ns.spkI.length,
      trace: ns.trT.length, rate: ns.rtT.length,
      total: ns.spkT.length * 2 + ns.trT.length * 3 + ns.rtT.length * 3,
    }),
    caps: Object.freeze({ ...nsCaps() }),
  });
}

function nsModDef(modulator) { return NEUROMOD_DEFS.find((d) => d.modulator === modulator) || {}; }

/* ---------- side panel ---------- */

function nsPresetOptions(sel) {
  return Object.keys(NEURON_PRESETS).map((k) => {
    const p = NEURON_PRESETS[k];
    return `<option value="${k}"${k === sel ? ' selected' : ''}>${nsEsc(k)} — ${nsEsc(p.name)}</option>`;
  }).join('');
}

function nsSliderRow(id, label, value, range, unit) {
  return `<div class="slider-row">
      <span class="label">${nsEsc(label)}</span>
      <span class="value mono" id="${id}-val">${value}${unit || ''}</span>
      <input type="range" id="${id}" min="${range.min}" max="${range.max}" step="${range.step}" value="${value}">
    </div>`;
}

/** One closed disclosure. Everything that is only for the curious goes inside one of these. */
function nsFold(summary, inner) {
  return `<details class="ns-why"><summary>${nsEsc(summary)}</summary><div class="ns-two">${inner}</div></details>`;
}

function nsModBlock(m) {
  const def = nsModDef(m.modulator);
  const badge = neuroConfidenceBadge(def.confidence);
  const R = NSIM_RANGES[m.key] || NSIM_RANGES.da;
  const val = ns.params[m.key === 'ach' ? 'achD' : m.key];
  return `<div class="ns-mod" data-mod="${m.key}">
      <div class="ns-mod-head">
        <span class="ns-mod-name">${nsEsc(m.name)}</span>
        <span class="badge ${badge.cls}" title="${nsEsc(badge.label)}">${nsEsc(badge.label)}</span>
      </div>
      ${nsSliderRow('ns-' + m.key, 'level', val, R, '')}
      <p class="ns-short"><span class="ns-lead">Here:</span> ${nsEsc(m.short || m.sim)}</p>
      <details class="ns-why">
        <summary>why</summary>
        <div class="ns-two">
          <p><span class="ns-lead">In real circuits:</span> ${nsEsc(m.real)}</p>
          <p><span class="ns-lead">In this simulation:</span> the slider ${nsEsc(m.sim)}</p>
        </div>
      </details>
    </div>`;
}

function nsRenderPanel() {
  const p = ns.params;
  const R = NSIM_RANGES;
  const body = setSidePanel(`
    <div class="panel-title">Neurons</div>
    <div class="panel-sub">150 spiking point neurons, live.</div>
    <p class="note ns-disclaimer"><strong>A generic toy network, not a brain</strong> — nothing here is
      thinking, feeling or remembering.</p>
    <div class="ns-hyp" id="ns-hyp" hidden></div>

    <div class="ns-status" id="ns-status">warming up…</div>
    <div class="ns-transport">
      <button class="text-btn" id="ns-toggle">Pause</button>
      <button class="text-btn" id="ns-reset">Reset network</button>
    </div>

    <h3>Cell types</h3>
    <div class="ns-selects">
      <label>Excitatory (120)<select id="ns-presetE">${nsPresetOptions(p.presetE)}</select></label>
      <label>Inhibitory (30)<select id="ns-presetI">${nsPresetOptions(p.presetI)}</select></label>
    </div>
    <p class="muted">Dale's law is enforced: a cell is excitatory or inhibitory to <em>every</em> target.</p>
    ${nsFold('why 80/20', '<p>The 80/20 split is a common cortex-wide approximation, not a constant — real ratios vary by region, layer and species.</p>')}

    <h3>Drive</h3>
    ${nsSliderRow('ns-speed', 'Speed', p.speed, R.speed, '×')}
    <p class="muted">Viewing speed only — it says nothing about how fast real neurons run.</p>
    ${nsSliderRow('ns-I_bg', 'Background drive', p.I_bg, R.I_bg, '')}
    ${nsSliderRow('ns-noise', 'Noise', p.noise, R.noise, '')}
    <p class="muted">The drive is an experimenter's electrode; the noise stands in for inputs we do not simulate.</p>
    ${nsFold('why noise', '<p>A real cortical neuron receives thousands of synaptic inputs this model does not track one by one. The noise term stands in for them — it is not a claim that neurons contain a random-number generator.</p>')}

    <details class="ns-group" id="ns-mods" open>
      <summary>Neuromodulators (6)</summary>
      <p class="muted ns-group-note">One line each. Open <em>why</em> for the real-circuit story.</p>
      ${NEUROMOD_UI.map(nsModBlock).join('')}
    </details>

    <details class="ns-adv">
      <summary>Advanced: raw a, b, c, d</summary>
      <p class="muted">These override the excitatory preset; ranges are clamped to keep the maths stable.</p>
      ${nsSliderRow('ns-a', 'a — recovery speed', R.a.def, R.a, '')}
      ${nsSliderRow('ns-b', 'b — sub-threshold coupling', R.b.def, R.b, '')}
      ${nsSliderRow('ns-c', 'c — reset voltage', R.c.def, R.c, ' mV')}
      ${nsSliderRow('ns-d', 'd — after-spike jump', R.d.def, R.d, '')}
      <div class="toggle-row"><span>Use these instead of the preset</span>
        <input type="checkbox" id="ns-adv-on"></div>
    </details>`);

  ns.statusEl = nsEl('ns-status');
  nsPaintHypothesis();
  nsWirePanel(body);
}

function nsSetVal(id, text) { const el = nsEl(id + '-val'); if (el) el.textContent = text; }

function nsWirePanel(body) {
  const p = ns.params;

  nsOn(nsEl('ns-toggle'), 'click', () => {
    ns.running = !ns.running;
    nsEl('ns-toggle').textContent = ns.running ? 'Pause' : 'Resume';
  });
  nsOn(nsEl('ns-reset'), 'click', () => {
    resetNetwork(ns.net);
    nsClearBuffers();
    nsHypCancel('the network was reset');
    toast('Network reset to rest.');
  });
  nsOn(nsEl('ns-presetE'), 'change', (e) => { p.presetE = e.target.value; nsHypCancel('the cell type changed'); nsExplainPreset('E', e.target.value); });
  nsOn(nsEl('ns-presetI'), 'change', (e) => { p.presetI = e.target.value; nsHypCancel('the cell type changed'); nsExplainPreset('I', e.target.value); });

  const bindSlider = (id, key, unit, after) => {
    nsOn(nsEl(id), 'input', (e) => {
      const v = parseFloat(e.target.value);
      if (!isFinite(v)) return;
      p[key] = v;
      nsSetVal(id, (Math.round(v * 100) / 100) + (unit || ''));
      if (after) after(v);
    });
  };
  bindSlider('ns-speed', 'speed', '×');
  bindSlider('ns-I_bg', 'I_bg', '', () => nsExplainDrive('I_bg'));
  bindSlider('ns-noise', 'noise', '', () => nsExplainDrive('noise'));

  for (const m of NEUROMOD_UI) {
    nsOn(nsEl('ns-' + m.key), 'input', (e) => {
      const v = parseFloat(e.target.value);
      if (!isFinite(v)) return;
      if (m.key === 'ach') { p.achD = v; p.achEE = v; } else { p[m.key] = v; }
      nsSetVal('ns-' + m.key, Math.round(v * 100) / 100);
      nsHypCancel('a slider moved mid-measurement');
      nsExplainMod(m);
    });
  }

  const adv = () => {
    const on = nsEl('ns-adv-on') && nsEl('ns-adv-on').checked;
    if (!on) { p.advanced = null; return; }
    p.advanced = {
      a: parseFloat(nsEl('ns-a').value), b: parseFloat(nsEl('ns-b').value),
      c: parseFloat(nsEl('ns-c').value), d: parseFloat(nsEl('ns-d').value),
    };
  };
  for (const k of ['a', 'b', 'c', 'd']) {
    nsOn(nsEl('ns-' + k), 'input', (e) => {
      const v = parseFloat(e.target.value);
      nsSetVal('ns-' + k, (Math.round(v * 1000) / 1000) + (k === 'c' ? ' mV' : ''));
      adv();
      nsExplainAdvanced(k, v);
    });
  }
  nsOn(nsEl('ns-adv-on'), 'change', adv);
  if (body) body.querySelectorAll('input[type=range]').forEach((el) => {
    el.addEventListener('keydown', (e) => e.stopPropagation());  // arrows belong to the slider here
  });
}

/* ---------- explain copy ---------- */

function nsExplainIntro() {
  ns.lastExplainKey = 'intro';
  explain({
    title: 'A small spiking network',
    badge: 'simplified model',
    badgeClass: 'mid',
    html: `
      <p>150 point neurons — 120 excitatory, 30 inhibitory — wired at random and left to run on the
      two-equation <strong>Izhikevich (2003)</strong> model. Nothing here is scripted.</p>
      ${nsFold('How to read the plots', `
        <p>The raster shows one dot per <span class="term" data-term="Action potential">spike</span>: rows are
        neurons, columns are time. Click a row to follow that neuron in the trace beside it, which shows the
        same events as a continuous voltage <em>v</em> with its recovery variable <em>u</em>.</p>
        <p>Move any slider for its own explanation, or open <strong>How this simulation works →
        Neuron equations</strong> for the maths in plain English.</p>`)}
      <div class="note">A generic population, not a model of any named circuit. It illustrates mechanisms;
      it never <em>is</em> the thing they are named after.</div>`,
  });
}

function nsExplainMod(m) {
  if (ns.lastExplainKey === 'mod:' + m.key) return;
  ns.lastExplainKey = 'mod:' + m.key;
  const def = nsModDef(m.modulator);
  const badge = neuroConfidenceBadge(def.confidence);
  explain({
    title: m.name,
    badge: badge.label,
    badgeClass: badge.cls,
    html: `
      <p><span class="ns-lead">Here:</span> ${nsEsc(m.short || m.sim)}</p>
      ${nsFold('Real circuits vs this simulation', `
        <p><span class="ns-lead">In real circuits:</span> ${nsEsc(m.real)}</p>
        <p><span class="ns-lead">In this simulation:</span> the slider ${nsEsc(m.sim)}</p>
        <p class="muted">Parameters touched: <span class="mono">${nsEsc(m.param)}</span></p>
        <p class="muted">${nsEsc(def.confidence || '')}</p>`)}
      <div class="note">${nsEsc(m.caution || '')}</div>`,
  });
}

function nsExplainPreset(which, key) {
  const p = NEURON_PRESETS[key];
  if (!p) return;
  ns.lastExplainKey = 'preset:' + which + key;
  explain({
    title: `${p.name}`,
    badge: which === 'E' ? 'excitatory population' : 'inhibitory population',
    html: `
      <p>${nsEsc(p.note)}</p>
      <p class="mono">a = ${p.a} · b = ${p.b} · c = ${p.c} mV · d = ${p.d}</p>
      ${nsFold('why this matters', '<p>Same two equations, four different numbers. One recipe reproduces regular spiking, bursting, chattering, fast spiking and low-threshold spiking without changing anything else.</p>')}
      ${key === 'TC' ? '<div class="note">This set only bursts from a hyperpolarised hold, so turn the background drive down to see it. What a preset does depends on the current you inject too.</div>' : ''}`,
  });
}

function nsExplainDrive(key) {
  if (ns.lastExplainKey === 'drive:' + key) return;
  ns.lastExplainKey = 'drive:' + key;
  const isNoise = key === 'noise';
  explain({
    title: isNoise ? 'Noise' : 'Background drive',
    html: isNoise
      ? `<p>An independent random current drawn fresh for every neuron on every tick.</p>
         ${nsFold('why it is there', `<p>It stands in for the thousands of synaptic inputs a real cortical
         neuron receives that this simulation does not model individually — a necessary simplification, not
         a claim that neurons are noisy by design.</p>
         <p>With noise at zero and the drive low, the network falls silent: nothing is sustaining it.</p>`)}`
      : `<p>A steady current injected into every neuron, like an experimenter's electrode.</p>
         ${nsFold('what to expect', `<p>Excitatory cells get the full value, inhibitory cells 60% of it.
         Below roughly 1 the network needs noise to fire at all.</p>
         <p>Pushed high, firing climbs toward the model's ceiling and the raster turns to stripes — that
         synchrony is the network's dynamics, not a rendering artefact.</p>`)}`,
  });
}

function nsExplainAdvanced(k, v) {
  const copy = {
    a: 'How fast the recovery variable u chases v. Small a means slow recovery: bursting and adaptation.',
    b: 'How strongly sub-threshold voltage wobbles recruit u. Larger b makes the neuron resonant.',
    c: 'The voltage the neuron snaps back to right after a spike. A less negative c makes bursting easier.',
    d: 'How big a jump u takes after every spike. Larger d means more spike-frequency adaptation.',
  };
  ns.lastExplainKey = 'adv:' + k;
  explain({
    title: `Parameter ${k} = ${Math.round(v * 1000) / 1000}`,
    badge: 'fitted parameter',
    badgeClass: 'mid',
    html: `<p>${copy[k]}</p>
      <div class="note">None of these four are biophysical quantities — they are curve-fit numbers, so no
      term here maps onto a measured ion-channel conductance.</div>`,
  });
}

/* ---------- plots ---------- */

/**
 * The plots container is short (it is bottom-bound so it can never reach the Explain card), so only
 * the raster and the membrane trace stay open. Population rate joins the phase portrait in the one
 * collapsible group, which starts open only on a tall viewport. Structure only — the container's own
 * position and bounds belong to the skeleton.
 * @returns {HTMLDetailsElement|null} the "more plots" group
 */
function nsBuildPlotLayout() {
  const box = nsEl('neuron-plots');
  const phase = nsEl('plot-phase');
  const det = phase && phase.closest ? phase.closest('details') : null;
  if (!box || !det) return det;
  det.classList.add('ns-more');

  const sum = det.querySelector(':scope > summary');
  if (sum) sum.textContent = 'More plots: rate + phase portrait';

  const rate = nsEl('plot-rate');
  const rateBlock = rate && rate.closest ? rate.closest('.plot') : null;
  if (rateBlock && rateBlock !== det && !det.contains(rateBlock)) {
    if (sum && sum.nextSibling) det.insertBefore(rateBlock, sum.nextSibling);
    else det.appendChild(rateBlock);
  }
  // Short labels only: each shares one row with its legend, so a long label pushes the legend out.
  for (const [id, text] of [['plot-raster', 'Raster'], ['plot-trace', 'Membrane v, u'], ['plot-rate', 'Rate']]) {
    const cv = nsEl(id);
    const lab = cv && cv.parentNode ? cv.parentNode.querySelector('.plot-label') : null;
    if (lab) lab.textContent = text;
  }

  if (!det.dataset.nsInit) {                                   // first entry decides; a user toggle wins after
    det.dataset.nsInit = '1';
    det.open = window.innerHeight >= NS_TALL_VIEWPORT;
  }
  return det;
}

function nsSetupPlots() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const prev = ns.plots || {};
  // Size every canvas from its own CSS box, never from a fixed pixel guess. A canvas inside the
  // closed "more plots" group measures 0 and is simply not drawn until it is opened again.
  const make = (id, key) => {
    const cv = nsEl(id);
    if (!cv) return null;
    const box = cv.getBoundingClientRect();
    const w = Math.round(box.width * dpr), h = Math.round(box.height * dpr);
    if (w < 8 || h < 8) return null;
    const old = prev[key];
    if (old && old.cv === cv && old.dpr === dpr && cv.width === w && cv.height === h) return old;
    cv.width = w; cv.height = h;                                               // resizing clears it
    return { cv, ctx: cv.getContext('2d'), acc: 0, lastT: ns.net ? ns.net.t : 0, dpr };
  };
  ns.plots = {
    raster: make('plot-raster', 'raster'),
    trace: make('plot-trace', 'trace'),
    rate: make('plot-rate', 'rate'),
    phase: make('plot-phase', 'phase'),
  };
}

/** Re-measure after anything that can change the container's box or its content height. */
function nsRelayoutPlots() {
  nsSetupPlots();
  nsUpdatePlotFade();
  ns.discNdc = null;                        // the stage changed size: re-measure the inset's anchor
}

/** Fade the bottom edge only while there is clipped content below, so it reads as "more below". */
function nsUpdatePlotFade() {
  const box = nsEl('neuron-plots');
  if (!box) return;
  const more = box.scrollHeight - box.clientHeight - box.scrollTop;
  box.classList.toggle('ns-fade', box.scrollHeight - box.clientHeight > 4 && more > 4);
}

const NS_LEGENDS = {
  'plot-raster': '<span class="key"><i class="swatch e"></i>exc</span><span class="key"><i class="swatch i"></i>inh</span><span class="sep">·</span><span>1 dot = 1 spike · 3 s</span>',
  'plot-trace': '<span class="key"><i class="swatch e"></i>v</span><span class="key"><i class="swatch i"></i>u</span><span class="sep">·</span><span id="ns-follow">neuron #0</span>',
  'plot-rate': '<span class="key"><i class="swatch e"></i>exc</span><span class="key"><i class="swatch i"></i>inh</span><span class="sep">·</span><span>Hz · 10 ms bins · 0-40</span>',
  'plot-phase': '<span class="key"><i class="swatch n"></i>dv/dt=0</span><span class="key"><i class="swatch i"></i>du/dt=0</span><span class="sep">·</span><span>amber = live (v, u)</span>',
};

/**
 * Legends are injected here rather than in body.html, which the orchestrator owns. Each one shares a
 * single header row with the plot's label, which saves a whole line of height per plot.
 */
function nsAddLegends() {
  for (const id of Object.keys(NS_LEGENDS)) {
    const cv = nsEl(id);
    if (!cv || !cv.parentNode) continue;
    const block = cv.parentNode;
    let head = block.querySelector(':scope > .ns-plot-head');
    if (!head) {
      head = document.createElement('div');
      head.className = 'ns-plot-head';
      block.insertBefore(head, cv);
    }
    const lab = block.querySelector(':scope > .plot-label');   // never a <summary>: that must stay put
    if (lab) head.insertBefore(lab, head.firstChild);
    let leg = head.querySelector(':scope > .ns-legend');
    if (!leg) {
      leg = document.createElement('div');
      leg.className = 'ns-legend';
      head.appendChild(leg);
    }
    leg.innerHTML = NS_LEGENDS[id];
  }
  nsSetFollowLabel();
}

function nsSetFollowLabel() {
  const el = nsEl('ns-follow');
  if (!el || !ns.net) return;
  el.textContent = `neuron #${ns.highlight} (${ns.net.isExc[ns.highlight] ? 'exc' : 'inh'})`;
}

function nsScroll(p, dx) {
  const { ctx, cv } = p;
  const buf = p.buf || (p.buf = document.createElement('canvas'));
  if (buf.width !== cv.width || buf.height !== cv.height) { buf.width = cv.width; buf.height = cv.height; }
  const bctx = p.bctx || (p.bctx = buf.getContext('2d'));
  bctx.globalCompositeOperation = 'copy';
  bctx.drawImage(cv, 0, 0);
  ctx.globalCompositeOperation = 'copy';
  ctx.drawImage(buf, -dx, 0);
  ctx.globalCompositeOperation = 'source-over';
  ctx.clearRect(cv.width - dx, 0, dx, cv.height);
}

function nsDrawStrips() {
  const net = ns.net;
  if (!net || !ns.plots) return;
  const now = net.t;

  // --- raster -------------------------------------------------------------------
  const R = ns.plots.raster;
  if (R && R.cv.width > 4) {
    const w = R.cv.width, h = R.cv.height, dpr = R.dpr;
    R.acc += (now - R.lastT) * (w / NS_WINDOW_MS);
    const dx = Math.floor(R.acc);
    if (dx >= w) { R.ctx.clearRect(0, 0, w, h); R.acc = 0; R.lastT = now; }
    else if (dx > 0) {
      R.acc -= dx;
      nsScroll(R, dx);
      const t0 = R.lastT, span = Math.max(1e-6, now - t0);
      const ctx = R.ctx;
      const dotH = Math.max(1, Math.round(h / net.N));
      for (let k = ns.spkT.length - 1; k >= 0; k--) {
        const t = ns.spkT[k];
        if (t <= t0) break;
        if (t > now) continue;
        const i = ns.spkI[k];
        const x = w - dx + ((t - t0) / span) * dx;
        ctx.fillStyle = net.isExc[i] ? NS_COL_E : NS_COL_I;
        ctx.fillRect(x, (i / net.N) * h, Math.max(1, dpr), dotH);
      }
      R.lastT = now;
    }
  }

  // --- membrane trace ------------------------------------------------------------
  const T = ns.plots.trace;
  if (T && T.cv.width > 4) {
    const w = T.cv.width, h = T.cv.height, dpr = T.dpr;
    T.acc += (now - T.lastT) * (w / NS_WINDOW_MS);
    const dx = Math.floor(T.acc);
    if (dx >= w) { T.ctx.clearRect(0, 0, w, h); T.acc = 0; T.lastT = now; }
    else if (dx > 0) {
      T.acc -= dx;
      nsScroll(T, dx);
      const ctx = T.ctx, t0 = T.lastT;
      let vmin = 1e9, vmax = -1e9, umin = 1e9, umax = -1e9, any = false;
      for (let k = ns.trT.length - 1; k >= 0; k--) {
        if (ns.trT[k] <= t0) break;
        any = true;
        vmin = Math.min(vmin, ns.trV[k]); vmax = Math.max(vmax, ns.trV[k]);
        umin = Math.min(umin, ns.trU[k]); umax = Math.max(umax, ns.trU[k]);
      }
      if (any) {
        const vy = (v) => h - ((nsClamp(v, -90, 35) + 90) / 125) * h * 0.92 - h * 0.04;
        const uy = (u) => h - ((nsClamp(u, -25, 25) + 25) / 50) * h * 0.92 - h * 0.04;
        ctx.lineWidth = Math.max(1, dpr);
        ctx.strokeStyle = 'rgba(106,166,255,0.85)';
        ctx.beginPath(); ctx.moveTo(w - dx, uy(umin)); ctx.lineTo(w - 0.5, uy(umax)); ctx.stroke();
        ctx.strokeStyle = NS_COL_E;
        ctx.beginPath(); ctx.moveTo(w - dx, vy(vmin)); ctx.lineTo(w - 0.5, vy(vmax)); ctx.stroke();
      }
      T.lastT = now;
    }
  }

  // --- population rate -----------------------------------------------------------
  const P = ns.plots.rate;
  if (P && P.cv.width > 4) {
    const w = P.cv.width, h = P.cv.height, dpr = P.dpr;
    P.acc += (now - P.lastT) * (w / NS_WINDOW_MS);
    const dx = Math.floor(P.acc);
    if (dx >= w) { P.ctx.clearRect(0, 0, w, h); P.acc = 0; P.lastT = now; P.prevE = undefined; }
    else if (dx > 0) {
      P.acc -= dx;
      nsScroll(P, dx);
      const ctx = P.ctx;
      const top = 40;                                    // Hz at the top of the plot (values above it clip)
      const y = (r) => h - nsClamp(r / top, 0, 1) * (h - 2) - 1;
      ctx.lineWidth = Math.max(1, dpr);
      if (P.prevE !== undefined) {
        ctx.strokeStyle = 'rgba(106,166,255,0.9)';
        ctx.beginPath(); ctx.moveTo(w - dx, y(P.prevI)); ctx.lineTo(w - 0.5, y(ns.rateI)); ctx.stroke();
        ctx.strokeStyle = NS_COL_E;
        ctx.beginPath(); ctx.moveTo(w - dx, y(P.prevE)); ctx.lineTo(w - 0.5, y(ns.rateE)); ctx.stroke();
      }
      P.prevE = ns.rateE; P.prevI = ns.rateI;
      P.lastT = now;
    }
  }
}

function nsDrawPhase() {
  const P = ns.plots && ns.plots.phase;
  const net = ns.net;
  if (!P || !net) return;
  const det = P.cv.closest ? P.cv.closest('details') : null;
  if (det && !det.open) return;                 // sizing happens in nsSetupPlots, on the toggle event
  const { ctx, cv, dpr } = P;
  const w = cv.width, h = cv.height;
  if (w < 8) return;
  ctx.clearRect(0, 0, w, h);

  const i = ns.highlight;
  const vLo = -90, vHi = 35, uLo = -25, uHi = 25;
  const X = (v) => ((nsClamp(v, vLo, vHi) - vLo) / (vHi - vLo)) * (w - 2) + 1;
  const Y = (u) => h - ((nsClamp(u, uLo, uHi) - uLo) / (uHi - uLo)) * (h - 2) - 1;
  const I = net.Isyn_E[i] - net.Isyn_I[i] + (net.isExc[i] ? ns.params.I_bg : ns.params.I_bg * 0.6);

  ctx.lineWidth = Math.max(1, dpr);
  ctx.strokeStyle = 'rgba(232,234,240,0.25)';            // dv/dt = 0
  ctx.beginPath();
  for (let v = vLo; v <= vHi; v += 1) {
    const u = 0.04 * v * v + 5 * v + 140 + I;
    if (v === vLo) ctx.moveTo(X(v), Y(u)); else ctx.lineTo(X(v), Y(u));
  }
  ctx.stroke();
  ctx.strokeStyle = 'rgba(106,166,255,0.4)';             // du/dt = 0
  ctx.beginPath();
  ctx.moveTo(X(vLo), Y(net.b[i] * vLo));
  ctx.lineTo(X(vHi), Y(net.b[i] * vHi));
  ctx.stroke();

  ctx.strokeStyle = 'rgba(245,183,74,0.7)';
  ctx.beginPath();
  const from = Math.max(0, ns.trV.length - 400);
  for (let k = from; k < ns.trV.length; k++) {
    const x = X(ns.trV[k]), y = Y(ns.trU[k]);
    if (k === from) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.fillStyle = NS_COL_E;
  ctx.beginPath();
  ctx.arc(X(net.v[i]), Y(net.u[i]), 2.5 * dpr, 0, Math.PI * 2);
  ctx.fill();
}

function nsClearBuffers() {
  ns.spkT.length = 0; ns.spkI.length = 0;
  ns.trT.length = 0; ns.trV.length = 0; ns.trU.length = 0;
  ns.rtT.length = 0; ns.rtE.length = 0; ns.rtI.length = 0;
  ns.binT = ns.net ? ns.net.t : 0; ns.binE = 0; ns.binI = 0;
  if (ns.plots) {
    for (const k of ['raster', 'trace', 'rate']) {
      const p = ns.plots[k];
      if (!p) continue;
      p.ctx.clearRect(0, 0, p.cv.width, p.cv.height);
      p.lastT = ns.net ? ns.net.t : 0; p.acc = 0; p.prevE = undefined; p.prevI = undefined;
    }
  }
}

/* ---------- 3D overlay ---------- */

/**
 * Where the population sits: an inset in the bottom-left of the stage, anchored in SCREEN space.
 *
 * It used to be a disc parked under the brain in world space, which put 150 glowing dots straight
 * through the brainstem and over the disclaimer. It is not anatomy and pretending otherwise cost more
 * than it bought, so it is now a small panel that keeps its place while the camera moves: clear of the
 * side panel on the left, low enough to stay out of the brain, and drawn in front of everything.
 *
 * @returns {{x:number, y:number}} normalised device coordinates (-1..1, y up)
 */
function nsDiscAnchor() {
  const stage = nsEl('stage');
  const W = (stage && stage.clientWidth) || window.innerWidth || 1440;
  const H = (stage && stage.clientHeight) || window.innerHeight || 900;
  const panel = document.getElementById('side-panel');
  let left = 12;
  try {
    if (panel && !panel.classList.contains('collapsed')) left = panel.getBoundingClientRect().right;
  } catch (err) { /* fall back to the gutter */ }
  const x = Math.min(left + NS_DISC_GAP, W * 0.42);
  const y = H * NS_DISC_Y;
  return { x: (x / W) * 2 - 1, y: 1 - (y / H) * 2 };
}

/** Keep the inset at its screen anchor, face-on to the camera, one fixed distance in front of it. */
function nsAnchorOverlay(app) {
  const mesh = ns.overlay;
  const scene = app && app.scene;
  if (!mesh || !scene || !scene.camera || !scene.THREE) return;
  const cam = scene.camera;
  if (!ns.discNdc) ns.discNdc = nsDiscAnchor();
  const v = new scene.THREE.Vector3(ns.discNdc.x, ns.discNdc.y, 0.5);
  v.unproject(cam);
  v.sub(cam.position).normalize().multiplyScalar(NS_DISC_DIST).add(cam.position);
  mesh.position.copy(v);
  mesh.quaternion.copy(cam.quaternion);
}

/** The scene's vertical field of view in radians (40 degrees today; read it rather than assume it). */
function nsCameraFovRad(scene) {
  const fov = scene && scene.camera ? scene.camera.fov : 0;
  return (typeof fov === 'number' && fov > 1 && fov < 179) ? (fov * Math.PI) / 180 : 0;
}

function nsBuildOverlay(app) {
  const scene = app && app.scene;
  if (!scene || !scene.THREE || typeof scene.addOverlay !== 'function') return;
  const THREE = scene.THREE;
  const net = ns.net;
  const geo = new THREE.SphereGeometry(0.05, 8, 6);
  const mat = new THREE.MeshBasicMaterial({
    color: 0xffffff, transparent: true, opacity: 0.95,
    depthWrite: false, depthTest: false, fog: false,   // an inset in front of the scene, not inside it
  });
  const mesh = new THREE.InstancedMesh(geo, mat, net.N);
  mesh.frustumCulled = false;
  mesh.renderOrder = 999;
  const dummy = new THREE.Object3D();
  const col = new THREE.Color();
  // Radius that renders as NS_DISC_FRAC of the viewport height at NS_DISC_DIST, whatever the window is.
  const halfFov = (nsCameraFovRad(scene) || 0.698) / 2;
  const R = NS_DISC_FRAC * NS_DISC_DIST * Math.tan(halfFov);
  const scale = R * NS_DISC_DOT;                  // geometry is a 0.05-radius sphere
  let e = 0, inh = 0;
  for (let i = 0; i < net.N; i++) {
    const exc = net.isExc[i] === 1;
    const n = exc ? net.nExc : net.nInh;
    const k = exc ? e++ : inh++;
    let x, y;
    if (exc) {                                    // 120 excitatory: phyllotaxis disc
      const r = R * 0.82 * Math.sqrt((k + 0.5) / n);
      const a = k * 2.39996323;
      x = Math.cos(a) * r; y = Math.sin(a) * r;
    } else {                                      // 30 inhibitory: a ring around them
      const a = (k / n) * Math.PI * 2;
      x = Math.cos(a) * R; y = Math.sin(a) * R;
    }
    dummy.position.set(x, y, 0);
    dummy.scale.setScalar((exc ? 1 : 1.25) * scale);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    mesh.setColorAt(i, col.set(exc ? NS_COL_E : NS_COL_I).multiplyScalar(0.18));
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  scene.addOverlay(mesh);
  ns.discNdc = nsDiscAnchor();
  ns.overlay = mesh;
  ns.act = new Float32Array(net.N);
  ns.colE = new THREE.Color(NS_COL_E);
  ns.colI = new THREE.Color(NS_COL_I);
  ns.tmpCol = new THREE.Color();
}

function nsUpdateOverlay(dt) {
  const mesh = ns.overlay;
  if (!mesh || !ns.act) return;
  const net = ns.net;
  const decay = Math.exp(-dt / 0.13);
  const c = ns.tmpCol;
  for (let i = 0; i < net.N; i++) {
    const a = (ns.act[i] *= decay);
    c.copy(net.isExc[i] ? ns.colE : ns.colI).multiplyScalar(0.18 + 1.5 * a);
    mesh.setColorAt(i, c);
  }
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
}

/* ---------- status ---------- */

function nsNetworkState() {
  if (ns.rateE < 0.4 && ns.rateI < 0.4) return { label: 'silent', hint: 'nothing is driving it — raise the background current or noise, or lower GABA tone' };
  if (ns.rateE > 60 || ns.rateI > 120) return { label: 'saturated', hint: 'firing near the model ceiling — this is a runaway regime, not a healthy one' };
  return { label: 'asynchronous', hint: 'irregular firing, no global lockstep' };
}

function nsUpdateStatus() {
  if (!ns.statusEl) return;
  const st = nsNetworkState();
  ns.statusEl.innerHTML =
    `<span class="ns-dot ns-dot-e"></span><span class="mono">${ns.rateE.toFixed(1)} Hz</span>` +
    `<span class="ns-dot ns-dot-i"></span><span class="mono">${ns.rateI.toFixed(1)} Hz</span>` +
    `<span class="ns-state">${nsEsc(st.label)}</span>`;
  ns.statusEl.title = st.hint;
}

/* ---------- hypothesis card (predicted vs observed) ---------- */

/**
 * The rule table. Each row says which way a parameter pushes the excitatory and inhibitory rates,
 * and how to say that in one sentence. These are the directions THIS simulation is wired for — read
 * nsimStep for the arithmetic — not claims about real neuromodulators.
 *
 * `span` is the parameter's own range, so a change is scored as a fraction of what the slider can do.
 */
const NS_HYP_RULES = [
  {
    key: 'gainNE', label: 'noradrenaline', span: 1, e: 1.0, i: 0.7,
    up: 'raises the gain on every input (and trims the noise), so firing should rise',
    down: 'lowers the gain on every input, so firing should fall',
  },
  {
    key: 'gaba', label: 'GABA tone', span: 2, e: -1.2, i: -0.9,
    up: 'scales every inhibitory synapse up, so both rates should fall',
    down: 'weakens every inhibitory synapse, so both rates should rise',
  },
  {
    key: 'achD', label: 'acetylcholine', span: 1, e: 0.4, i: 0.25,
    up: 'trims spike-frequency adaptation, so excitatory cells should fire a little more',
    down: 'restores adaptation, so excitatory cells should fire a little less',
  },
  {
    key: 'cortisol', label: 'cortisol', span: 1, e: 0.6, i: 0.45,
    up: 'adds noise on top of the drive, so firing should get higher and rougher',
    down: 'takes that extra noise away, so firing should settle',
  },
  {
    key: 'da', label: 'dopamine', span: 1, e: 0.35, i: 0.2,
    up: 'depolarises its target subgroup, so part of the excitatory population should speed up',
    down: 'stops depolarising its target subgroup',
  },
  {
    key: 'sero', label: 'serotonin', span: 1, e: 0.15, i: 0.4,
    up: 'shifts the E/I set point toward driving inhibitory cells',
    down: 'shifts the E/I set point away from inhibitory cells',
  },
];

/**
 * The params the integrator should use right now — the pre-change ones while a baseline is running.
 * Speed rides along from the live params: it is a viewing control and changes nothing being compared,
 * so a frozen speed slider would look broken for no gain.
 */
function nsActiveParams() {
  if (ns.hyp && ns.hyp.phase === 'pre' && ns.hyp.beforeParams) {
    return { ...ns.hyp.beforeParams, speed: ns.params.speed };
  }
  return ns.params;
}

function nsArrow(score) {
  if (score > NS_HYP_FLAT) return '\u2191';
  if (score < -NS_HYP_FLAT) return '\u2193';
  return '\u2192';
}

/**
 * Predicted direction for the two population rates, from the parameter change alone.
 * @returns {{e:number, i:number, why:string}} scores (sign = direction) and the one-line reason
 */
function nsPredict(before, after) {
  let e = 0, i = 0, top = null, topWeight = 0;
  for (const rule of NS_HYP_RULES) {
    const d = ((after[rule.key] || 0) - (before[rule.key] || 0)) / rule.span;
    if (!isFinite(d) || Math.abs(d) < 0.01) continue;
    e += rule.e * d;
    i += rule.i * d;
    const w = Math.abs(rule.e * d) + Math.abs(rule.i * d);
    if (w > topWeight) { topWeight = w; top = { rule, up: d > 0 }; }
  }
  const why = top
    ? top.rule.label + ' went ' + (top.up ? 'up' : 'down') + ', which ' + (top.up ? top.rule.up : top.rule.down) + '.'
    : 'Nothing moved far enough to predict a change.';
  return { e, i, why };
}

/** Mean binned rates inside a simulated-time window, or null when there are no samples in it. */
function nsMeanRates(from, to) {
  let e = 0, i = 0, n = 0, first = null, last = null;
  for (let k = 0; k < ns.rtT.length; k++) {
    const t = ns.rtT[k];
    if (t < from || t > to) continue;
    e += ns.rtE[k]; i += ns.rtI[k]; n++;
    if (first === null) first = t;
    last = t;
  }
  return n ? { e: e / n, i: i / n, n, span: last - first } : null;
}

/** "+18 %" when there is enough baseline to divide by, plain Hz when there is not. */
function nsChangeText(name, base, obs) {
  if (base >= 0.5) {
    const pct = Math.round(((obs - base) / base) * 100);
    return name + ' ' + (pct >= 0 ? '+' : '\u2212') + Math.abs(pct) + ' %';
  }
  return name + ' ' + base.toFixed(1) + '\u2192' + obs.toFixed(1) + ' Hz';
}

function nsHypProgressText() {
  const h = ns.hyp;
  if (!h || !ns.net) return '';
  const done = Math.max(0, Math.min(NS_HYP_MS, ns.net.t - h.t0));
  const s = (done / 1000).toFixed(1);
  if (h.phase === 'pre') return 'Baseline first: ' + s + ' s of 3 s at the previous settings.';
  if (h.phase === 'post') return 'Watching: ' + s + ' s of 3 s with this profile.';
  return '';
}

function nsPaintHypothesis() {
  const el = nsEl('ns-hyp');
  const h = ns.hyp;
  if (!el) return;
  if (!h) { el.hidden = true; el.innerHTML = ''; return; }
  const pred = 'E ' + nsArrow(h.pred.e) + ' I ' + nsArrow(h.pred.i);
  let observed;
  if (h.cancelled) observed = '<span class="ns-hyp-pending">cancelled — ' + nsEsc(h.cancelled) + '</span>';
  else if (h.obs && h.base) observed = nsEsc(nsChangeText('E', h.base.e, h.obs.e) + ' ' + nsChangeText('I', h.base.i, h.obs.i));
  else observed = '<span class="ns-hyp-pending">measuring\u2026</span>';

  el.hidden = false;
  el.innerHTML = `
    <div class="ns-hyp-head">
      <span class="ns-hyp-kicker">Hypothesis</span>
      <span class="badge mid">A toy check, not confirmation</span>
    </div>
    <div class="ns-hyp-title">${nsEsc(h.title)}</div>
    <div class="ns-hyp-line"><b>Prediction:</b> ${nsEsc(pred)} \u00b7 <b>Observed:</b> ${observed}</div>
    <div class="ns-hyp-why">${nsEsc(h.pred.why)}</div>
    <div class="ns-hyp-progress" id="ns-hyp-progress">${nsEsc(nsHypProgressText())}</div>`;
}

/** Drop the measurement when the network stops being the one the prediction was made about. */
function nsHypCancel(reason) {
  if (!ns.hyp || ns.hyp.phase === 'done') return;
  ns.hyp.phase = 'done';
  ns.hyp.cancelled = reason;
  nsPaintHypothesis();
}

/** Advance the two measurement windows. Called once a frame; does nothing unless one is running. */
function nsHypTick() {
  const h = ns.hyp;
  if (!h || h.phase === 'done' || !ns.net) return;
  const t = ns.net.t;
  if (h.phase === 'pre') {
    if (t < h.t0 + NS_HYP_MS) return;
    h.base = nsMeanRates(h.t0, t) || { e: ns.rateE, i: ns.rateI, n: 1, span: 0 };
    h.phase = 'post';
    h.t0 = t;
    nsPaintHypothesis();
    return;
  }
  if (t >= h.t0 + NS_HYP_MS) {
    h.obs = nsMeanRates(h.t0, t) || { e: ns.rateE, i: ns.rateI, n: 1, span: 0 };
    h.phase = 'done';
    nsPaintHypothesis();
  }
}

/**
 * Show what the last applied profile is expected to do, then what it actually did.
 *
 * Prediction comes from the parameter change and the rule table above — stated before the network is
 * watched, because a prediction written after the fact is not one. Observation is the mean population
 * rate over 3 s of simulated time on each side of the change. If there is no usable history before the
 * change (the usual case when Scenario has just switched modes), the previous parameters are held for
 * one 3 s window first and the card says so.
 *
 * @param {{title:string, profile:object}} card
 * @returns {boolean} whether a card was started
 */
export function nsSetHypothesis(card) {
  if (!card || !ns.net || !ns.applied) return false;
  const { before, after, beforeParams } = ns.applied;
  const t = ns.net.t;
  const history = nsMeanRates(t - NS_HYP_MS, t);
  const usable = history && history.span >= NS_HYP_MIN_SPAN;
  ns.hyp = {
    title: card.title || 'Scenario profile',
    pred: nsPredict(before, after),
    base: usable ? history : null,
    obs: null,
    beforeParams,
    phase: usable ? 'post' : 'pre',
    t0: t,
    cancelled: '',
  };
  nsPaintHypothesis();
  return true;
}

/* ---------- profile hand-off from Scenario mode ---------- */

/**
 * How a 0..1 "how much is this system in play" profile value becomes a simulation parameter.
 * Most sliders are already 0..1; GABA tone runs 0..2 with 1.0 as baseline, so 0.5 maps to 1.0 there.
 */
const NS_PROFILE_MAP = {
  dopamine: { key: 'da', to: (v) => v },
  acetylcholine: { key: 'ach', to: (v) => v },
  noradrenaline: { key: 'gainNE', to: (v) => v },
  serotonin: { key: 'sero', to: (v) => v },
  gaba: { key: 'gaba', to: (v) => 0.4 + v * 1.2 },
  cortisol: { key: 'cortisol', to: (v) => v },
};

/**
 * Apply a six-value neuromodulator profile (0..1 each) from Scenario mode to the sliders and params.
 * Safe to call before the mode has ever been entered — it just reports false.
 * @param {object} profile {dopamine, acetylcholine, noradrenaline, serotonin, gaba, cortisol}
 * @returns {boolean} whether anything was applied
 */
/** Publish the six slider positions as 0..1 modulator levels on app.modulators (baseline = main.js defaults). Pathways reads them for timing. */
function nsPublishModulators(app) {
  if (!app || !app.modulators || !ns.params) return;
  const P = ns.params, M = app.modulators;
  const up = (v, base) => base + nsClamp(v, 0, 1) * (1 - base);           // sliders whose default is 0
  const around = (v, def, max, base) => (v < def ? base * (v / def) : base + ((v - def) / (max - def)) * (1 - base));
  M.dopamine = up(P.da, 0.25);
  M.acetylcholine = up(P.achD, 0.3);
  M.noradrenaline = around(P.gainNE, 0.5, 1, 0.3);
  M.serotonin = nsClamp(P.sero, 0, 1);
  M.gaba = around(P.gaba, 1, 2, 0.5);
  M.cortisol = up(P.cortisol, 0.2);
}

export function nsApplyModulators(profile) {
  if (!profile || typeof profile !== 'object' || !ns.params) return false;
  // Snapshot first: the hypothesis card compares the network before and after this call, so the
  // previous parameters have to survive the assignment that is about to happen.
  const beforeParams = { ...ns.params };
  const applied = [];
  for (const name of Object.keys(NS_PROFILE_MAP)) {
    const raw = profile[name];
    const n = typeof raw === 'number' ? raw : parseFloat(raw);
    if (!isFinite(n)) continue;
    const spec = NS_PROFILE_MAP[name];
    const R = NSIM_RANGES[spec.key] || NSIM_RANGES.da;
    const v = Math.round(nsClamp(spec.to(nsClamp(n, 0, 1)), R.min, R.max) * 100) / 100;
    if (spec.key === 'ach') { ns.params.achD = v; ns.params.achEE = v; } else { ns.params[spec.key] = v; }
    const el = nsEl('ns-' + spec.key);
    if (el) el.value = String(v);
    nsSetVal('ns-' + spec.key, v);
    applied.push({ name, v, profile: Math.round(nsClamp(n, 0, 1) * 100) / 100 });
  }
  if (!applied.length) return false;

  const keys = ['gainNE', 'achD', 'da', 'sero', 'gaba', 'cortisol'];
  const pick = (src) => keys.reduce((o, k) => { o[k] = src[k]; return o; }, {});
  ns.applied = { beforeParams, before: pick(beforeParams), after: pick(ns.params), profile };

  const rows = applied.map((a) => `<dt>${nsEsc(a.name)}</dt><dd class="mono">${a.profile.toFixed(2)} → slider ${a.v}</dd>`).join('');
  explain({
    title: 'Profile applied from Scenario',
    badge: 'not a measurement',
    badgeClass: 'low',
    html: `
      <p>The six sliders now sit where the Scenario result put them.</p>
      ${nsFold('what moved', `<dl class="kv">${rows}</dl>`)}
      <div class="note">Nothing here knows what the scenario was. Moving knobs in a generic population does
      not make it stressed, focused or rewarded.</div>`,
  });
  ns.lastExplainKey = 'scenario-profile';
  return true;
}

/* ---------- mode ---------- */

export const NeuronsMode = {
  id: 'neurons',
  label: 'Neurons',
  accent: NS_ACCENT,

  enter(app) {
    ns.app = app;
    registerHowTabs();
    if (!ns.net) {
      ns.net = createNetwork({ N: 150, excFrac: 0.8, connProb: 0.1, seed: 20260906 });
      ns.params = { ...NSIM_DEFAULTS };
    }
    ns.running = true;
    showNeuronPlots(true);
    nsRenderPanel();
    nsBuildPlotLayout();
    nsAddLegends();
    nsSetupPlots();
    nsClearBuffers();
    nsUpdatePlotFade();
    nsBuildOverlay(app);
    nsAnchorOverlay(app);
    if (typeof askMount === 'function') askMount(app);
    nsExplainIntro();
    app.neurons = ns.net;                 // debug/verification handle: NeuroScope.neurons
    if (typeof ns.net.debug !== 'function') {
      Object.defineProperty(ns.net, 'debug', { value: nsDebug, enumerable: false, configurable: true });
    }

    nsOn(nsEl('plot-raster'), 'click', (e) => {
      const r = e.currentTarget.getBoundingClientRect();
      const i = Math.floor(((e.clientY - r.top) / Math.max(1, r.height)) * ns.net.N);
      ns.highlight = nsClamp(i, 0, ns.net.N - 1);
      ns.trT.length = 0; ns.trV.length = 0; ns.trU.length = 0;
      const t = ns.plots && ns.plots.trace;
      if (t) { t.ctx.clearRect(0, 0, t.cv.width, t.cv.height); t.lastT = ns.net.t; }
      nsSetFollowLabel();
      toast(`Following neuron #${ns.highlight} (${ns.net.isExc[ns.highlight] ? 'excitatory' : 'inhibitory'}).`);
    });
    nsOn(window, 'resize', nsRelayoutPlots);
    nsOn(nsEl('neuron-plots'), 'scroll', nsUpdatePlotFade);
    const det = nsEl('plot-phase') && nsEl('plot-phase').closest('details');
    nsOn(det, 'toggle', nsRelayoutPlots);
    // The container is bottom-bound by the skeleton, so its box changes with the viewport, not with
    // its content: measure from the box itself instead of trusting any fixed pixel size.
    if (typeof ResizeObserver === 'function' && nsEl('neuron-plots')) {
      ns.ro = new ResizeObserver(() => nsRelayoutPlots());
      ns.ro.observe(nsEl('neuron-plots'));
    }
  },

  exit(app) {
    nsHypCancel('you left the mode mid-measurement');   // the network stops advancing while away
    nsOffAll();
    if (ns.ro) { ns.ro.disconnect(); ns.ro = null; }
    const box = nsEl('neuron-plots');
    if (box) box.classList.remove('ns-fade');
    showNeuronPlots(false);
    if (ns.overlay && app && app.scene && typeof app.scene.removeOverlay === 'function') {
      app.scene.removeOverlay(ns.overlay);
      if (ns.overlay.geometry) ns.overlay.geometry.dispose();
      if (ns.overlay.material) ns.overlay.material.dispose();
    }
    ns.overlay = null;
    ns.statusEl = null;
  },

  update(dt, app) {
    nsPublishModulators(app);
    const net = ns.net;
    if (!net) return;

    if (ns.running) {
      // Sanitise once per frame, not once per tick: the sliders cannot move between two ticks of the
      // same frame, so up to NS_MAX_TICKS_PER_FRAME redundant clamp passes were being done for nothing.
      // nsimStep still sanitises anything it is handed that is not marked, so this is an optimisation
      // and not a new contract.
      const p = nsimSanitize(nsActiveParams());
      ns.tickAcc += dt * NS_TICKS_PER_SEC * p.speed;
      let ticks = Math.min(NS_MAX_TICKS_PER_FRAME, Math.floor(ns.tickAcc));
      ns.tickAcc -= ticks;
      if (ns.tickAcc > NS_MAX_TICKS_PER_FRAME) ns.tickAcc = 0;   // never build a backlog
      while (ticks-- > 0) {
        const spikes = nsimStep(net, p);
        const t = net.t;
        for (let k = 0; k < spikes.length; k++) {
          const i = spikes[k];
          ns.spkT.push(t); ns.spkI.push(i);
          if (ns.act) ns.act[i] = 1;
          if (net.isExc[i]) ns.binE++; else ns.binI++;
        }
        ns.trT.push(t); ns.trV.push(net.v[ns.highlight]); ns.trU.push(net.u[ns.highlight]);
        if (t - ns.binT >= NS_BIN_MS) {
          const sec = (t - ns.binT) / 1000;
          const e = ns.binE / net.nExc / sec, i2 = ns.binI / net.nInh / sec;
          ns.rateE += (e - ns.rateE) * 0.25;                     // light smoothing
          ns.rateI += (i2 - ns.rateI) * 0.25;
          ns.rtT.push(t); ns.rtE.push(ns.rateE); ns.rtI.push(ns.rateI);
          ns.binT = t; ns.binE = 0; ns.binI = 0;
        }
      }
      const caps = nsCaps();
      const keepFrom = net.t - NS_KEEP_MS;
      nsimTrim([ns.spkT, ns.spkI], keepFrom, caps.spikes);
      nsimTrim([ns.trT, ns.trV, ns.trU], keepFrom, caps.trace);
      nsimTrim([ns.rtT, ns.rtE, ns.rtI], keepFrom, caps.rate);
    }

    nsUpdateOverlay(dt);
    nsAnchorOverlay(app);
    nsHypTick();
    if (document.hidden || (nsEl('neuron-plots') && nsEl('neuron-plots').hidden)) return;
    nsDrawStrips();
    nsDrawPhase();
    ns.statusAcc += dt;
    if (ns.statusAcc > 0.25) {
      ns.statusAcc = 0;
      nsUpdateStatus();
      ns.discNdc = nsDiscAnchor();          // the anchor follows the side panel, which can collapse
      const prog = nsEl('ns-hyp-progress');
      if (prog && ns.hyp && ns.hyp.phase !== 'done') prog.textContent = nsHypProgressText();
    }
  },

  onPick() {},
  onHover() {},

  onKey(e) {
    if (e.key === ' ' || e.key === 'Spacebar') {
      ns.running = !ns.running;
      const b = nsEl('ns-toggle');
      if (b) b.textContent = ns.running ? 'Pause' : 'Resume';
      return true;
    }
    return false;
  },
};
