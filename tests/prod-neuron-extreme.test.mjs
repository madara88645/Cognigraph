// Neuron core stress test: tests/neurons-core.test.mjs already checks every slider extreme for
// 1.2 simulated seconds on one seed each. This file asks a narrower but deeper question — across
// MULTIPLE seeds (so the stochastic noise term gets a real chance to misbehave) and a much longer
// run (20 simulated seconds, long enough for slow adaptation/aggregate effects to show up), does the
// network ever go non-finite or drift outside the modelled voltage range, and do the ring buffers a
// real UI would keep (spikes + a trace) ever grow past their documented cap?
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createNetwork, nsimStep, nsimSanitize, nsimBufferCap, nsimTrim, NSIM_RANGES,
} from '../src/modes/neurons-core.js';

const SEEDS = [1, 7, 20260906, 999983, 2 ** 31 - 1];
const SIM_MS = 20000;
const R = NSIM_RANGES;

// A handful of genuinely extreme-but-in-range corners, not the full slider grid (that is already
// covered per-seed in neurons-core.test.mjs) — the point here is seed x duration, not exhaustive
// parameter coverage.
const EXTREMES = [
  { label: 'hottest: max drive/noise, min inhibition, everything neuromodulated to 1', params: {
    gaba: R.gaba.min, I_bg: R.I_bg.max, noise: R.noise.max, gainNE: 1,
    achD: 1, achEE: 1, da: 1, sero: 1, cortisol: 1, presetE: 'CH', presetI: 'LTS',
  } },
  { label: 'coldest: min drive/noise, max inhibition, everything neuromodulated to 0', params: {
    gaba: R.gaba.max, I_bg: R.I_bg.min, noise: R.noise.min, gainNE: 0,
    achD: 0, achEE: 0, da: 0, sero: 0, cortisol: 0, presetE: 'IB', presetI: 'FS',
  } },
  { label: 'max drive + max inhibition (fighting extremes), bursting presets', params: {
    gaba: R.gaba.max, I_bg: R.I_bg.max, noise: R.noise.max, gainNE: 1,
    achD: 1, achEE: 0, da: 1, sero: 0, cortisol: 1, presetE: 'CH', presetI: 'FS',
  } },
  { label: 'advanced a/b/c/d pinned to their range extremes', params: {
    I_bg: R.I_bg.max, noise: R.noise.max, gaba: R.gaba.min, gainNE: 1, cortisol: 1, da: 1,
    advanced: { a: R.a.max, b: R.b.max, c: R.c.max, d: R.d.min }, presetE: 'CH', presetI: 'FS',
  } },
];

function finiteCheck(net) {
  for (let i = 0; i < net.N; i++) {
    if (!Number.isFinite(net.v[i]) || !Number.isFinite(net.u[i])) return `neuron ${i}: v=${net.v[i]} u=${net.u[i]}`;
    if (net.v[i] > 30.001 || net.v[i] < -100.001) return `neuron ${i}: v out of range (${net.v[i]})`;
  }
  return null;
}

test(`${SEEDS.length} seeds x ${EXTREMES.length} extreme param sets x ${SIM_MS / 1000}s: never NaN/Infinity, v stays in [-100, 30]`, () => {
  for (const seed of SEEDS) {
    for (const { label, params } of EXTREMES) {
      const net = createNetwork({ seed });
      const p = nsimSanitize(params);
      for (let t = 0; t < SIM_MS; t++) {
        nsimStep(net, p);
        if (t % 1000 === 999) {
          const bad = finiteCheck(net);
          assert.equal(bad, null, `seed ${seed}, ${label}, at t=${t}ms: ${bad}`);
        }
      }
      assert.equal(finiteCheck(net), null, `seed ${seed}, ${label}, after ${SIM_MS}ms`);
    }
  }
});

test('spike + trace ring buffers stay within their documented cap across the same 20s stress runs', () => {
  const caps = { spikes: nsimBufferCap(3000, 3, 24), trace: nsimBufferCap(3000, 1, 24) };
  for (const seed of [SEEDS[0], SEEDS[SEEDS.length - 1]]) {           // two seeds is enough here; the
    for (const { label, params } of EXTREMES) {                       // finiteness test above already
      const net = createNetwork({ seed });                            // covers the full seed list
      const p = nsimSanitize(params);
      const spkT = [], spkI = [], trT = [], trV = [];
      for (let t = 0; t < SIM_MS; t++) {
        const sp = nsimStep(net, p);
        for (const i of sp) { spkT.push(net.t); spkI.push(i); }
        trT.push(net.t); trV.push(net.v[0]);
        if (t % 24 === 23) {
          nsimTrim([spkT, spkI], net.t - 3600, caps.spikes);
          nsimTrim([trT, trV], net.t - 3600, caps.trace);
        }
      }
      const slackSpikes = 24 * net.N, slackTrace = 24;
      assert.ok(spkT.length <= caps.spikes + slackSpikes, `${label} seed ${seed}: spike buffer ${spkT.length} > cap ${caps.spikes}`);
      assert.equal(spkT.length, spkI.length, `${label} seed ${seed}: parallel spike arrays diverged`);
      assert.ok(trT.length <= caps.trace + slackTrace, `${label} seed ${seed}: trace buffer ${trT.length} > cap ${caps.trace}`);
      assert.equal(trT.length, trV.length, `${label} seed ${seed}: parallel trace arrays diverged`);
    }
  }
});
