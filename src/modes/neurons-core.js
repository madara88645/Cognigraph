// Pure Izhikevich (2003) spiking-network integrator. No DOM, no three, no globals — node-testable.
//   createNetwork({N, excFrac, connProb, seed}) -> net   (typed arrays only, allocated once)
//   step(net, params, dtMs)                     -> spike list for that 1 ms tick (a REUSED array)
//
// Model:  dv/dt = 0.04v^2 + 5v + 140 - u + I ,  du/dt = a(bv - u) ,  v >= 30 -> v = c, u += d
// Integration: two 0.5 ms half-steps for v per 1 ms tick, u updated once per tick (Izhikevich's own
// stabilisation trick for the v^2 term); the threshold is tested after EVERY sub-step; v is hard
// clamped and every state is isFinite-guarded so no slider combination can produce NaN.
// Synapses: exponential post-synaptic currents (tau_E 5 ms, tau_I 10 ms) with a 1-tick delay.
import { NEURON_PRESETS } from '../data/neuro.js';

/** Default slider/parameter values. The neuromodulator sliders are all 0..1 (1 = strongest effect). */
export const NSIM_DEFAULTS = {
  I_bg: 1.6,      // tonic background current (arbitrary Izhikevich units, "electrode" analogy)
  noise: 5.0,     // std of the per-tick Gaussian background current
  gainNE: 0.5,    // noradrenaline: gain on net current + inverse effect on noise (0.5 = baseline)
  achD: 0,        // acetylcholine part 1: reduces the after-spike jump d
  achEE: 0,       // acetylcholine part 2: weakens recurrent E->E synapses
  da: 0,          // dopamine: tonic depolarising offset on the labelled target subgroup
  sero: 0.5,      // serotonin: E/I set-point shift (0.5 = baseline)
  gaba: 1,        // GABA tone: inhibitory weight gain
  cortisol: 0,    // cortisol: noise + opposite-direction excitability on two labelled subgroups
  speed: 2,       // UI speed multiplier (not used by nsimStep(); the UI decides how many ticks to run)
  presetE: 'RS',
  presetI: 'FS',
  advanced: null, // {a,b,c,d} override for the excitatory population
};

/** Min/max/step/default for every user-facing parameter. Everything is clamped to these. */
export const NSIM_RANGES = {
  I_bg: { min: 0, max: 10, step: 0.1, def: NSIM_DEFAULTS.I_bg },
  noise: { min: 0, max: 10, step: 0.1, def: NSIM_DEFAULTS.noise },
  gainNE: { min: 0, max: 1, step: 0.01, def: 0.5 },
  ach: { min: 0, max: 1, step: 0.01, def: 0 },
  da: { min: 0, max: 1, step: 0.01, def: 0 },
  sero: { min: 0, max: 1, step: 0.01, def: 0.5 },
  gaba: { min: 0, max: 2, step: 0.01, def: 1 },
  cortisol: { min: 0, max: 1, step: 0.01, def: 0 },
  speed: { min: 0.25, max: 8, step: 0.25, def: 2 },
  a: { min: 0.005, max: 0.2, step: 0.001, def: 0.02 },
  b: { min: 0.05, max: 0.35, step: 0.005, def: 0.2 },
  c: { min: -75, max: -45, step: 0.5, def: -65 },
  d: { min: 0.05, max: 12, step: 0.05, def: 8 },
};

const NSIM_TAU_E = 5;    // ms, AMPA-like
const NSIM_TAU_I = 10;   // ms, GABA-A-like
const NSIM_W_E = 2.5;    // per-spike excitatory current jump, tuned for a balanced (Brunel-like) regime
const NSIM_W_I = 4.5;    // per-spike inhibitory current jump
const NSIM_V_MIN = -100;
const NSIM_V_PEAK = 30;

function nsimClamp(x, lo, hi) { return x < lo ? lo : (x > hi ? hi : x); }
function nsimNum(x, fallback) { return (typeof x === 'number' && isFinite(x)) ? x : fallback; }

/* ---------- seeded PRNG (mulberry32 + Box-Muller with a cached spare) ---------- */

function nsimRandom(seed) {
  let s = (seed >>> 0) || 1;
  return function next() {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function nsimGaussian(net) {
  if (net._spare !== null) { const g = net._spare; net._spare = null; return g; }
  let u = 0, v = 0, s = 0;
  do { u = net.rand() * 2 - 1; v = net.rand() * 2 - 1; s = u * u + v * v; } while (s === 0 || s >= 1);
  const f = Math.sqrt(-2 * Math.log(s) / s);
  net._spare = v * f;
  return u * f;
}

/* ---------- construction ---------- */

/**
 * Build a fixed, sparse, Dale's-law network of point neurons.
 * @param {{N?:number, excFrac?:number, connProb?:number, seed?:number}} opts
 */
export function createNetwork(opts = {}) {
  const N = Math.max(4, Math.round(nsimNum(opts.N, 150)));
  const excFrac = nsimClamp(nsimNum(opts.excFrac, 0.8), 0.1, 0.95);
  const connProb = nsimClamp(nsimNum(opts.connProb, 0.1), 0.01, 0.5);
  const nExc = Math.max(1, Math.round(N * excFrac));
  const seed = Math.round(nsimNum(opts.seed, 20260906));

  const net = {
    N, nExc, nInh: N - nExc, connProb, seed,
    isExc: new Uint8Array(N),
    a: new Float32Array(N), b: new Float32Array(N), c: new Float32Array(N), d: new Float32Array(N),
    v: new Float32Array(N), u: new Float32Array(N),
    Isyn_E: new Float32Array(N), Isyn_I: new Float32Array(N),
    pend_E: new Float32Array(N), pend_I: new Float32Array(N),
    noise: new Float32Array(N),
    // labelled subgroups used only by the neuromodulator sliders (NOT real anatomy)
    grpDA: new Uint8Array(N), grpStressUp: new Uint8Array(N), grpStressDown: new Uint8Array(N),
    adjStart: null, adjTarget: null, adjWeight: null,
    spikes: [],           // reused every tick: indices that fired
    t: 0,                 // simulated time, ms
    ticks: 0,
    rand: nsimRandom(seed),
    _spare: null,
    _sig: '',
    diverged: 0,          // how many times the isFinite guard had to rescue a neuron
  };

  for (let i = 0; i < N; i++) net.isExc[i] = i < nExc ? 1 : 0;
  // Subgroup labels: three disjoint slices of the excitatory population, purely for the sliders.
  const g = Math.max(1, Math.round(nExc / 4));
  for (let i = 0; i < nExc; i++) {
    if (i < g) net.grpDA[i] = 1;
    else if (i < 2 * g) net.grpStressUp[i] = 1;
    else if (i < 3 * g) net.grpStressDown[i] = 1;
  }
  net.groups = {
    DA: { label: 'dopamine target group', from: 0, to: g },
    stressUp: { label: 'stress: excited group', from: g, to: 2 * g },
    stressDown: { label: 'stress: suppressed group', from: 2 * g, to: 3 * g },
  };

  // Sparse directed graph, fixed at build time: each neuron gets ~connProb*N random targets.
  const wE = nsimNum(opts.wE, NSIM_W_E), wI = nsimNum(opts.wI, NSIM_W_I);
  const kOut = Math.max(1, Math.round(connProb * N));
  const start = new Int32Array(N + 1);
  const target = new Int32Array(N * kOut);
  const weight = new Float32Array(N * kOut);
  let m = 0;
  const taken = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    start[i] = m;
    let picked = 0, guard = 0;
    while (picked < kOut && guard++ < kOut * 40) {
      const j = Math.floor(net.rand() * N);
      if (j === i || taken[j]) continue;
      taken[j] = 1;
      target[m] = j;
      weight[m] = (net.isExc[i] ? wE : wI) * (0.75 + 0.5 * net.rand());
      m++; picked++;
    }
    for (let k = start[i]; k < m; k++) taken[target[k]] = 0;
  }
  start[N] = m;
  net.adjStart = start;
  net.adjTarget = target.slice(0, m);
  net.adjWeight = weight.slice(0, m);
  net.edges = m;

  nsimApplyCells(net, NSIM_DEFAULTS.presetE, NSIM_DEFAULTS.presetI, null);
  resetNetwork(net);
  return net;
}

/** Put every neuron back at rest and clear all currents (keeps the wiring and the PRNG stream). */
export function resetNetwork(net) {
  for (let i = 0; i < net.N; i++) {
    net.v[i] = net.c[i];
    net.u[i] = net.b[i] * net.c[i];
    net.Isyn_E[i] = 0; net.Isyn_I[i] = 0; net.pend_E[i] = 0; net.pend_I[i] = 0; net.noise[i] = 0;
  }
  net.spikes.length = 0;
  net.t = 0; net.ticks = 0; net.diverged = 0;
  return net;
}

/** Fill a/b/c/d from the named presets, with an optional clamped (a,b,c,d) override for the E group. */
function nsimApplyCells(net, presetE, presetI, advanced) {
  const pe = NEURON_PRESETS[presetE] || NEURON_PRESETS.RS;
  const pi = NEURON_PRESETS[presetI] || NEURON_PRESETS.FS;
  const R = NSIM_RANGES;
  const adv = advanced ? {
    a: nsimClamp(nsimNum(advanced.a, pe.a), R.a.min, R.a.max),
    b: nsimClamp(nsimNum(advanced.b, pe.b), R.b.min, R.b.max),
    c: nsimClamp(nsimNum(advanced.c, pe.c), R.c.min, R.c.max),
    d: nsimClamp(nsimNum(advanced.d, pe.d), R.d.min, R.d.max),
  } : null;
  for (let i = 0; i < net.N; i++) {
    const p = net.isExc[i] ? (adv || pe) : pi;
    net.a[i] = p.a; net.b[i] = p.b; net.c[i] = p.c; net.d[i] = p.d;
  }
}

/** Marker nsimSanitize() stamps on its output so nsimStep can skip a redundant pass. */
const NSIM_SANITIZED = '__nsimSanitized';

/** Clamp an incoming params object into the safe regime and fill in defaults. */
export function nsimSanitize(params) {
  const p = params || {};
  const R = NSIM_RANGES;
  const out = {
    I_bg: nsimClamp(nsimNum(p.I_bg, NSIM_DEFAULTS.I_bg), R.I_bg.min, R.I_bg.max),
    noise: nsimClamp(nsimNum(p.noise, NSIM_DEFAULTS.noise), R.noise.min, R.noise.max),
    gainNE: nsimClamp(nsimNum(p.gainNE, 0.5), 0, 1),
    achD: nsimClamp(nsimNum(p.achD, 0), 0, 1),
    achEE: nsimClamp(nsimNum(p.achEE, 0), 0, 1),
    da: nsimClamp(nsimNum(p.da, 0), 0, 1),
    sero: nsimClamp(nsimNum(p.sero, 0.5), 0, 1),
    gaba: nsimClamp(nsimNum(p.gaba, 1), R.gaba.min, R.gaba.max),
    cortisol: nsimClamp(nsimNum(p.cortisol, 0), 0, 1),
    speed: nsimClamp(nsimNum(p.speed, NSIM_DEFAULTS.speed), R.speed.min, R.speed.max),
    presetE: NEURON_PRESETS[p.presetE] ? p.presetE : 'RS',
    presetI: NEURON_PRESETS[p.presetI] ? p.presetI : 'FS',
    advanced: p.advanced || null,
  };
  // Non-enumerable so it never shows up in a deepEqual, a JSON dump or a for..in: it exists only so
  // nsimStep can skip re-clamping a params object the caller already sanitised this frame.
  Object.defineProperty(out, NSIM_SANITIZED, { value: true, enumerable: false });
  return out;
}

/* ---------- rolling plot buffers (pure, so the UI's memory bound is testable) ---------- */

/**
 * How many samples one rolling plot buffer may legitimately hold.
 * The plots only ever read back to the previous frame (the canvases keep the older history as
 * pixels), so "everything inside the display window, twice over, plus one frame's worth of new
 * samples" is a generous ceiling — and, crucially, it scales with the window instead of being a
 * flat constant that a maxed-out slider can blow through.
 *
 * @param {number} windowMs   simulated ms the plots display
 * @param {number} perMs      samples this buffer appends per simulated ms (spikes: the assumed
 *                            population ceiling; trace: 1; binned rate: 1/binMs)
 * @param {number} ticksPerFrame  most ticks a single frame may run before the next trim
 */
export function nsimBufferCap(windowMs, perMs, ticksPerFrame = 24) {
  const w = Math.max(1, nsimNum(windowMs, 3000));
  const r = Math.max(1e-6, nsimNum(perMs, 1));
  const f = Math.max(1, nsimNum(ticksPerFrame, 24));
  return Math.max(256, Math.ceil(2 * w * r + f * r));
}

/**
 * Trim parallel rolling buffers in place. `arrays[0]` must be the (ascending) time array.
 * Samples older than `keepFrom` go first; if that is not enough the oldest samples are dropped
 * anyway so the buffers can never exceed `cap` — the case a maxed-out network hits, where every
 * sample is still inside the window and a purely time-based trim would free nothing.
 * Trims down to 3/4 of the cap so the O(n) splice runs once every few hundred frames, not every frame.
 * @returns {number} samples removed
 */
export function nsimTrim(arrays, keepFrom, cap) {
  const t = arrays && arrays[0];
  if (!t || !t.length) return 0;
  const max = Math.max(16, Math.round(nsimNum(cap, 8192)));
  if (t.length <= max) return 0;
  const target = Math.floor(max * 0.75);
  let cut = 0;
  while (cut < t.length && t[cut] < keepFrom) cut++;
  if (t.length - cut > target) cut = t.length - target;
  if (cut <= 0) return 0;
  for (const a of arrays) a.splice(0, cut);
  return cut;
}

/* ---------- integrator ---------- */

/**
 * Advance the network by exactly one 1 ms tick, using sub-steps of dtMs for v.
 * @returns {number[]} the indices that spiked this tick (a reused array — copy it if you keep it)
 */
export function nsimStep(net, params, dtMs = 0.5) {
  // Sanitising is ~20 clamps; at 1000 ticks/second of simulated time that is pure overhead when the
  // caller already did it for this frame. The marker is the fast path; the call is still the default,
  // so passing a raw object straight from a slider is as safe as it ever was.
  const p = (params && params[NSIM_SANITIZED]) ? params : nsimSanitize(params);
  const sub = Math.max(1, Math.round(1 / nsimClamp(nsimNum(dtMs, 0.5), 0.05, 1)));
  const dt = 1 / sub;

  const sig = p.presetE + '|' + p.presetI + '|' + (p.advanced
    ? [p.advanced.a, p.advanced.b, p.advanced.c, p.advanced.d].join(',') : '-');
  if (sig !== net._sig) { nsimApplyCells(net, p.presetE, p.presetI, p.advanced); net._sig = sig; }

  // --- per-tick modulator scalars -------------------------------------------------
  const seroShift = (p.sero - 0.5) * 2;                 // -1 .. +1
  const sEE = 1 - 0.4 * p.achEE;                        // ACh weakens recurrent excitation
  const sEEda = sEE * (1 + 0.3 * p.da);                 // DA boosts E->E inside its target group
  const sEI = 1 + 0.35 * seroShift;                     // 5-HT: E->I up ...
  const sIE = p.gaba * (1 - 0.35 * seroShift);          // ... while I->E goes the other way
  const sII = p.gaba;
  const gain = 0.75 + 0.5 * p.gainNE;                   // NE: gain on net current (1.0 at 0.5)
  const noiseScale = 1.3 - 0.6 * p.gainNE;              // NE also sharpens SNR by trimming noise
  const dScale = 1 - 0.5 * p.achD;                      // ACh reduces spike-frequency adaptation
  const noiseAmp = (p.noise + 3.0 * p.cortisol) * noiseScale;
  const daOffset = 2.5 * p.da;
  const stressUp = 1.6 * p.cortisol;
  const stressDown = -1.2 * p.cortisol;
  const decayE = Math.exp(-dt / NSIM_TAU_E);
  const decayI = Math.exp(-dt / NSIM_TAU_I);

  const { N, isExc, v, u, a, b, c, d, Isyn_E, Isyn_I, pend_E, pend_I, noise, grpDA, grpStressUp, grpStressDown } = net;
  const spikes = net.spikes;
  spikes.length = 0;

  // --- deliver the previous tick's spikes (the mandatory 1-step synaptic delay) ----
  for (let i = 0; i < N; i++) {
    Isyn_E[i] += pend_E[i]; pend_E[i] = 0;
    Isyn_I[i] += pend_I[i]; pend_I[i] = 0;
    noise[i] = nsimGaussian(net) * noiseAmp;
  }

  // --- v sub-steps (threshold tested after every one) -----------------------------
  for (let s = 0; s < sub; s++) {
    for (let i = 0; i < N; i++) {
      Isyn_E[i] *= decayE;
      Isyn_I[i] *= decayI;
      let tonic = isExc[i] ? p.I_bg : p.I_bg * 0.6;
      if (grpDA[i]) tonic += daOffset;
      if (grpStressUp[i]) tonic += stressUp;
      if (grpStressDown[i]) tonic += stressDown;
      const I = gain * (Isyn_E[i] - Isyn_I[i] + tonic) + noise[i];
      let vi = v[i];
      vi += dt * (0.04 * vi * vi + 5 * vi + 140 - u[i] + I);
      if (!isFinite(vi)) {                               // NaN / Infinity -> rescue this neuron
        vi = c[i]; u[i] = b[i] * c[i]; net.diverged++;
      } else if (vi >= NSIM_V_PEAK) {                    // spike (checked after EVERY sub-step)
        vi = c[i];
        u[i] += d[i] * dScale;
        spikes.push(i);
      } else if (vi < NSIM_V_MIN) {
        vi = NSIM_V_MIN;                                 // hyperpolarisation floor, not a divergence
      }
      v[i] = vi;
    }
  }

  // --- u once per tick, then the finite guard --------------------------------------
  for (let i = 0; i < N; i++) {
    let ui = u[i] + a[i] * (b[i] * v[i] - u[i]);
    if (!isFinite(ui) || ui > 1e4 || ui < -1e4) { ui = b[i] * c[i]; v[i] = c[i]; net.diverged++; }
    u[i] = ui;
  }

  // --- queue this tick's spikes for delivery on the next tick ----------------------
  for (let k = 0; k < spikes.length; k++) {
    const i = spikes[k];
    const from = net.adjStart[i], to = net.adjStart[i + 1];
    if (isExc[i]) {
      const inDA = grpDA[i] === 1;
      for (let e = from; e < to; e++) {
        const j = net.adjTarget[e];
        const w = net.adjWeight[e];
        pend_E[j] += w * (isExc[j] ? ((inDA && grpDA[j]) ? sEEda : sEE) : sEI);
      }
    } else {
      for (let e = from; e < to; e++) {
        const j = net.adjTarget[e];
        pend_I[j] += net.adjWeight[e] * (isExc[j] ? sIE : sII);
      }
    }
  }

  net.t += 1;
  net.ticks++;
  return spikes;
}

/** Run `ms` milliseconds and return {spikesE, spikesI, rateE, rateI, nan} — used by tests and the UI. */
export function runFor(net, params, ms) {
  let sE = 0, sI = 0, nan = 0;
  for (let k = 0; k < ms; k++) {
    const sp = nsimStep(net, params);
    for (let q = 0; q < sp.length; q++) (net.isExc[sp[q]] ? sE++ : sI++);
    for (let i = 0; i < net.N; i++) if (!isFinite(net.v[i]) || !isFinite(net.u[i])) nan++;
  }
  const sec = ms / 1000;
  return {
    spikesE: sE, spikesI: sI, nan,
    rateE: net.nExc ? sE / net.nExc / sec : 0,
    rateI: net.nInh ? sI / net.nInh / sec : 0,
  };
}
