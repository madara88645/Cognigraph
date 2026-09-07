import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createNetwork, nsimStep, runFor, resetNetwork, nsimSanitize, nsimBufferCap, nsimTrim,
  NSIM_DEFAULTS, NSIM_RANGES,
} from '../src/modes/neurons-core.js';
import { NEURON_PRESETS } from '../src/data/neuro.js';

const P = (over = {}) => ({ ...NSIM_DEFAULTS, ...over });

function finite(net) {
  for (let i = 0; i < net.N; i++) {
    if (!Number.isFinite(net.v[i]) || !Number.isFinite(net.u[i])) return `neuron ${i}: v=${net.v[i]} u=${net.u[i]}`;
    if (!Number.isFinite(net.Isyn_E[i]) || !Number.isFinite(net.Isyn_I[i])) return `neuron ${i}: synaptic current not finite`;
    if (net.v[i] > 30 || net.v[i] < -101) return `neuron ${i}: v out of range (${net.v[i]})`;
  }
  return null;
}

test('createNetwork builds 150 neurons, 120/30 Dale split, ~10% sparse wiring', () => {
  const net = createNetwork({ seed: 1 });
  assert.equal(net.N, 150);
  assert.equal(net.nExc, 120);
  assert.equal(net.nInh, 30);
  assert.ok(net.adjTarget instanceof Int32Array && net.adjWeight instanceof Float32Array);
  assert.ok(net.v instanceof Float32Array && net.u instanceof Float32Array);
  const kOut = net.edges / net.N;
  assert.ok(kOut >= 13 && kOut <= 16, `mean out-degree ${kOut}`);
  for (let i = 0; i < net.N; i++) {
    for (let e = net.adjStart[i]; e < net.adjStart[i + 1]; e++) {
      assert.notEqual(net.adjTarget[e], i, 'no self-connections');
      assert.ok(net.adjWeight[e] > 0, 'weights are stored positive; the sign comes from Dale\'s law');
    }
  }
});

test('10 s at defaults: both populations fire at sane rates, nothing diverges', () => {
  const net = createNetwork({ seed: 20260906 });
  runFor(net, P(), 500);                       // settle
  const r = runFor(net, P(), 10000);
  assert.ok(r.spikesE > 0 && r.spikesI > 0, 'both groups must fire');
  assert.ok(r.rateE >= 1 && r.rateE <= 30, `excitatory rate ${r.rateE.toFixed(2)} Hz outside 1-30`);
  assert.ok(r.rateI >= 5 && r.rateI <= 60, `inhibitory rate ${r.rateI.toFixed(2)} Hz outside 5-60`);
  assert.ok(r.rateI > r.rateE, 'fast-spiking interneurons should out-fire the RS population');
  assert.equal(r.nan, 0);
  assert.equal(net.diverged, 0, 'the default regime must not need the divergence rescue');
  assert.equal(finite(net), null);
});

test('the default regime is asynchronous-irregular, not lockstep and not silent', () => {
  const net = createNetwork({ seed: 3 });
  runFor(net, P(), 500);
  const bins = [];
  let bin = 0, active = new Set();
  for (let k = 0; k < 5000; k++) {
    const sp = nsimStep(net, P());
    bin += sp.length;
    for (const i of sp) active.add(i);
    if (k % 5 === 4) { bins.push(bin); bin = 0; }
  }
  assert.ok(active.size > net.N * 0.8, `only ${active.size}/${net.N} neurons ever fired`);
  const mean = bins.reduce((a, b) => a + b, 0) / bins.length;
  const varr = bins.reduce((a, b) => a + (b - mean) ** 2, 0) / bins.length;
  const fano = varr / mean;
  assert.ok(mean > 0.5, 'population is silent');
  assert.ok(fano < 8, `population is synchronised (Fano ${fano.toFixed(1)} in 5 ms bins)`);
});

test('same seed = identical spike train; different seed = different one', () => {
  const trace = (seed) => {
    const net = createNetwork({ seed });
    let s = '';
    for (let k = 0; k < 400; k++) s += nsimStep(net, P()).join(',') + ';';
    return s;
  };
  assert.equal(trace(42), trace(42));
  assert.notEqual(trace(42), trace(43));
});

test('resetNetwork returns every neuron to rest', () => {
  const net = createNetwork({ seed: 5 });
  runFor(net, P({ I_bg: 8 }), 300);
  resetNetwork(net);
  assert.equal(net.t, 0);
  for (let i = 0; i < net.N; i++) {
    assert.equal(net.v[i], net.c[i]);
    assert.equal(net.Isyn_E[i], 0);
    assert.equal(net.Isyn_I[i], 0);
  }
});

test('synaptic transmission is delayed by one tick and obeys Dale\'s law', () => {
  const net = createNetwork({ seed: 11 });
  const p = P({ I_bg: 8, noise: 0 });
  let seen = false;
  for (let k = 0; k < 200 && !seen; k++) {
    const sp = nsimStep(net, p);
    const exc = sp.find((i) => net.isExc[i]);
    if (exc === undefined) continue;
    seen = true;
    const targets = [];
    for (let e = net.adjStart[exc]; e < net.adjStart[exc + 1]; e++) targets.push(net.adjTarget[e]);
    // the current is queued, not yet applied
    assert.ok(targets.some((j) => net.pend_E[j] > 0), 'excitatory spike must queue excitatory current');
    assert.ok(targets.every((j) => net.pend_I[j] === 0 || !net.isExc[exc]), 'an excitatory neuron never queues inhibition');
    const before = targets.map((j) => net.Isyn_E[j]);
    nsimStep(net, p);
    const after = targets.map((j) => net.Isyn_E[j]);
    assert.ok(after.some((x, i) => x > before[i]), 'queued current must arrive on the next tick');
  }
  assert.ok(seen, 'no excitatory spike happened in 200 ms');
});

test('inhibitory neurons only ever queue inhibitory current', () => {
  const net = createNetwork({ seed: 12 });
  const p = P({ I_bg: 9 });
  for (let k = 0; k < 300; k++) {
    const sp = nsimStep(net, p);
    for (const i of sp) {
      if (net.isExc[i]) continue;
      for (let e = net.adjStart[i]; e < net.adjStart[i + 1]; e++) {
        assert.ok(net.adjWeight[e] > 0);
      }
    }
  }
  assert.equal(finite(net), null);
});

test('no NaN or Infinity at any slider extreme, for any preset pair', () => {
  const R = NSIM_RANGES;
  const extremes = [];
  const keys = ['I_bg', 'noise', 'gainNE', 'achD', 'achEE', 'da', 'sero', 'gaba', 'cortisol'];
  const lo = { I_bg: R.I_bg.min, noise: R.noise.min, gainNE: 0, achD: 0, achEE: 0, da: 0, sero: 0, gaba: R.gaba.min, cortisol: 0 };
  const hi = { I_bg: R.I_bg.max, noise: R.noise.max, gainNE: 1, achD: 1, achEE: 1, da: 1, sero: 1, gaba: R.gaba.max, cortisol: 1 };
  extremes.push(P(lo), P(hi));
  for (const k of keys) { extremes.push(P({ [k]: lo[k] })); extremes.push(P({ [k]: hi[k] })); }
  // a few mixed corners
  let bits = 0;
  for (let n = 0; n < 12; n++) {
    const mix = {};
    keys.forEach((k, i) => { mix[k] = ((bits >> i) & 1) ? hi[k] : lo[k]; });
    bits = (bits * 7 + 13) & 511;
    extremes.push(P(mix));
  }
  const presets = Object.keys(NEURON_PRESETS);
  for (const [n, params] of extremes.entries()) {
    const net = createNetwork({ seed: 100 + n });
    const p = { ...params, presetE: presets[n % presets.length], presetI: presets[(n + 3) % presets.length] };
    for (let k = 0; k < 1200; k++) {
      nsimStep(net, p);
      if (k % 200 === 0) {
        const bad = finite(net);
        assert.equal(bad, null, `${bad} with ${JSON.stringify(p)}`);
      }
    }
    assert.equal(finite(net), null, `after 1200 ms with ${JSON.stringify(p)}`);
  }
});

test('advanced a/b/c/d values are clamped and never destabilise the run', () => {
  const net = createNetwork({ seed: 21 });
  const wild = [
    { a: 1e9, b: -1e9, c: 1e9, d: -1e9 },
    { a: NaN, b: NaN, c: NaN, d: NaN },
    { a: 0, b: 0, c: 0, d: 0 },
    { a: 0.2, b: 0.35, c: -45, d: 12 },
  ];
  for (const advanced of wild) {
    resetNetwork(net);
    for (let k = 0; k < 800; k++) nsimStep(net, P({ advanced }));
    assert.equal(finite(net), null, `advanced=${JSON.stringify(advanced)}`);
    const R = NSIM_RANGES, eps = 1e-5;   // a/b/c/d live in Float32Array, so allow rounding slack
    for (let i = 0; i < net.nExc; i++) {
      assert.ok(net.a[i] >= R.a.min - eps && net.a[i] <= R.a.max + eps, `a=${net.a[i]}`);
      assert.ok(net.b[i] >= R.b.min - eps && net.b[i] <= R.b.max + eps, `b=${net.b[i]}`);
      assert.ok(net.c[i] >= R.c.min - eps && net.c[i] <= R.c.max + eps, `c=${net.c[i]}`);
      assert.ok(net.d[i] >= R.d.min - eps && net.d[i] <= R.d.max + eps, `d=${net.d[i]}`);
    }
  }
});

test('garbage params are sanitised instead of poisoning the state', () => {
  const net = createNetwork({ seed: 31 });
  const junk = { I_bg: 'lots', noise: NaN, gaba: Infinity, da: null, sero: undefined, presetE: 'nope', presetI: 42, advanced: 'x' };
  for (let k = 0; k < 500; k++) nsimStep(net, junk);
  assert.equal(finite(net), null);
  const s = nsimSanitize(junk);
  assert.equal(s.presetE, 'RS');
  assert.equal(s.presetI, 'FS');
  assert.ok(Number.isFinite(s.I_bg) && Number.isFinite(s.noise) && Number.isFinite(s.gaba));
  assert.equal(nsimSanitize(undefined).gaba, 1);
});

test('nsimStep() with no params at all still runs', () => {
  const net = createNetwork({ seed: 41 });
  for (let k = 0; k < 300; k++) nsimStep(net);
  assert.equal(finite(net), null);
});

test('GABA tone moves the network in the expected direction', () => {
  const rate = (gaba) => {
    const net = createNetwork({ seed: 9 });
    runFor(net, P({ gaba }), 400);
    return runFor(net, P({ gaba }), 3000).rateE;
  };
  const low = rate(0.2), high = rate(2);
  assert.ok(low > high, `more inhibition must not raise the rate (${low.toFixed(1)} vs ${high.toFixed(1)} Hz)`);
});

test('background current and noise both drive the network up', () => {
  const rate = (over) => {
    const net = createNetwork({ seed: 13 });
    runFor(net, P(over), 400);
    return runFor(net, P(over), 3000).rateE;
  };
  assert.ok(rate({ I_bg: 6 }) > rate({ I_bg: 0 }));
  assert.ok(rate({ noise: 8 }) > rate({ noise: 0 }));
});

test('acetylcholine reduces adaptation (more spikes) and weakens recurrent excitation', () => {
  const rate = (over) => {
    const net = createNetwork({ seed: 17 });
    runFor(net, P(over), 400);
    return runFor(net, P(over), 3000).rateE;
  };
  assert.ok(rate({ achD: 1 }) > rate({ achD: 0 }), 'less spike-frequency adaptation should raise the rate');
  assert.ok(rate({ achEE: 1 }) < rate({ achEE: 0 }), 'weaker E->E recurrence should lower the rate');
});

test('the spike list is per tick and never reports a neuron that is not at reset', () => {
  const net = createNetwork({ seed: 19 });
  for (let k = 0; k < 600; k++) {
    const sp = nsimStep(net, P());
    for (const i of sp) {
      assert.ok(Number.isInteger(i) && i >= 0 && i < net.N);
      assert.ok(net.v[i] <= 30);
    }
    assert.equal(net.t, k + 1);
  }
});

test('a smaller or larger population still builds and runs', () => {
  for (const N of [20, 60, 400]) {
    const net = createNetwork({ N, seed: 2 });
    assert.equal(net.N, N);
    runFor(net, P(), 400);
    assert.equal(finite(net), null, `N=${N}`);
  }
});

/* ---------- rolling plot buffers ---------- */

test('the trim threshold scales with the plot window, not a flat constant', () => {
  const short = nsimBufferCap(3000, 1, 24);
  const long = nsimBufferCap(12000, 1, 24);
  assert.equal(long, short * 4 - 72, 'a 4x window must allow ~4x the samples');
  assert.ok(short >= 2 * 3000 && short < 3 * 3000, `3 s of 1-per-ms samples -> ${short}`);
  // one frame's worth of new samples always fits above the window, whatever the tick budget
  assert.ok(nsimBufferCap(3000, 1, 240) > nsimBufferCap(3000, 1, 24));
  // denser buffers get proportionally more room, sparser ones proportionally less
  assert.equal(nsimBufferCap(3000, 3, 24), 3 * 2 * 3000 + 24 * 3);
  assert.equal(nsimBufferCap(3000, 1 / 10, 24), Math.ceil(2 * 300 + 2.4));
  // never below a usable floor, and never NaN for junk input
  assert.equal(nsimBufferCap(0, 0, 0), 256);
  assert.equal(nsimBufferCap(NaN, undefined, null), nsimBufferCap(3000, 1, 24));
});

test('nsimTrim keeps parallel buffers aligned and bounded, even when nothing is out of window', () => {
  const cap = 1000;
  const t = [], v = [], u = [];
  for (let k = 0; k < 4000; k++) { t.push(k); v.push(k * 2); u.push(k * 3); }
  // every sample is inside the window: a purely time-based trim would free nothing at all
  const removed = nsimTrim([t, v, u], -1, cap);
  assert.ok(removed > 0, 'the hard ceiling must fire even when no sample has aged out');
  assert.ok(t.length <= cap, `length ${t.length} still above the cap`);
  assert.equal(t.length, v.length);
  assert.equal(t.length, u.length);
  assert.equal(v[0], t[0] * 2, 'the parallel arrays must be cut at the same index');
  assert.equal(u[0], t[0] * 3);
  assert.equal(t[t.length - 1], 3999, 'the newest samples are the ones that survive');
  assert.ok(t.every((x, i) => i === 0 || x > t[i - 1]), 'time stays ascending');
});

test('nsimTrim drops aged-out samples first and is a no-op under the cap', () => {
  const t = [], v = [];
  for (let k = 0; k < 900; k++) { t.push(k); v.push(k); }
  assert.equal(nsimTrim([t, v], 500, 1000), 0, 'under the cap nothing is touched');
  assert.equal(t.length, 900);

  const t2 = [], v2 = [];
  for (let k = 0; k < 2000; k++) { t2.push(k); v2.push(k); }
  nsimTrim([t2, v2], 1500, 1000);          // 1500 samples have aged out, more than the cap needs
  assert.equal(t2[0], 1500, 'aged-out samples go before the ceiling is applied');
  assert.equal(t2.length, 500);
  assert.equal(nsimTrim([], 0, 100), 0);
  assert.equal(nsimTrim(null, 0, 100), 0);
});

test('a maxed-out network stays bounded: 10 s at the fastest settings never exceeds the caps', () => {
  const R = NSIM_RANGES;
  const hot = P({ I_bg: R.I_bg.max, noise: R.noise.max, gaba: 0, cortisol: 1, speed: R.speed.max });
  const net = createNetwork({ seed: 7 });
  const caps = {
    spikes: nsimBufferCap(3000, 3, 24),
    trace: nsimBufferCap(3000, 1, 24),
  };
  const spkT = [], spkI = [], trT = [], trV = [];
  for (let ms = 0; ms < 10000; ms++) {
    const sp = nsimStep(net, hot);
    for (const i of sp) { spkT.push(net.t); spkI.push(i); }
    trT.push(net.t); trV.push(net.v[0]);
    if (ms % 24 === 23) {                                   // trim once per simulated frame, as the UI does
      nsimTrim([spkT, spkI], net.t - 3600, caps.spikes);
      nsimTrim([trT, trV], net.t - 3600, caps.trace);
    }
  }
  // the bound is "cap, plus at most the one frame of samples pushed since the last trim"
  const slackSpikes = 24 * net.N, slackTrace = 24;
  assert.ok(spkT.length <= caps.spikes + slackSpikes, `spike buffer ${spkT.length} > cap ${caps.spikes}`);
  assert.ok(spkT.length < 3 * caps.spikes / 2, 'the cap must actually bite at a saturated firing rate');
  assert.equal(spkT.length, spkI.length);
  assert.ok(trT.length <= caps.trace + slackTrace, `trace buffer ${trT.length} > cap ${caps.trace}`);
  assert.ok(trT.length >= 400, 'the phase portrait still needs its last 400 samples');
  assert.equal(finite(net), null);
});
