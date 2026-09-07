// Timing invariant: whatever the six neuromodulator sliders are set to, a pathway's steps must never
// be reported out of chronological order (step i+1 arriving before step i would make the timeline
// readout and the travelling pulse animation lie about causality). tests/modulation.test.mjs already
// checks this at a handful of specific slider settings; this file sweeps the full 6x6 grid of
// pairwise slider extremes (each of the 6 modulators pinned to 0 while another is pinned to 1, in
// every combination, plus all-0 and all-1) against pwEffMsSeq — the actual per-frame function
// PathwaysMode calls, reached the same way the production bundle would reach it (everything sharing
// one scope; pwEffMsSeq is a bundle-internal name, not something modules.js ever exports).
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadFullScope } from './helpers/full-bundle.mjs';

const { pwEffMsSeq, pw, PATHWAYS, MOD_BASELINE, LLM_MODULATORS } = loadFullScope(
  ['pwEffMsSeq', 'pw', 'PATHWAYS', 'modTiming', 'MOD_BASELINE', 'LLM_MODULATORS'],
);

function buildGrid() {
  const grid = [];
  for (const lo of LLM_MODULATORS) {
    for (const hi of LLM_MODULATORS) {
      const m = { ...MOD_BASELINE };
      m[lo] = 0; m[hi] = 1;
      grid.push({ label: `${lo}=0,${hi}=1`, m });
    }
  }
  grid.push({ label: 'all 0', m: Object.fromEntries(LLM_MODULATORS.map((k) => [k, 0])) });
  grid.push({ label: 'all 1', m: Object.fromEntries(LLM_MODULATORS.map((k) => [k, 1])) });
  return grid;
}

test(`6x6 modulator grid (${LLM_MODULATORS.length * LLM_MODULATORS.length + 2} combinations) never reorders any pathway's steps`, () => {
  const grid = buildGrid();
  assert.equal(grid.length, LLM_MODULATORS.length * LLM_MODULATORS.length + 2);
  pw.transient = false;
  let msPathwaysChecked = 0;
  for (const { label, m } of grid) {
    pw.app = { modulators: m, lesions: new Set() };
    for (const p of PATHWAYS) {
      const seq = pwEffMsSeq(p);
      assert.equal(seq.length, p.steps.length, `${label} / ${p.id}: sequence length drifted`);
      for (let i = 1; i < seq.length; i++) {
        assert.ok(seq[i] >= seq[i - 1], `${label} / ${p.id}: step ${i} (${seq[i]}ms) arrives before step ${i - 1} (${seq[i - 1]}ms)`);
      }
      if (p.timeline === 'ms') msPathwaysChecked++;
    }
  }
  assert.ok(msPathwaysChecked > 0, 'sanity: at least one ms-timeline pathway must have been exercised');
});

test('schematic (non-ms) pathways are never scaled by modTiming, so they cannot reorder either', () => {
  pw.transient = false;
  const m = Object.fromEntries(LLM_MODULATORS.map((k) => [k, 1]));
  pw.app = { modulators: m, lesions: new Set() };
  for (const p of PATHWAYS.filter((x) => x.timeline !== 'ms')) {
    const seq = pwEffMsSeq(p);
    assert.deepEqual(seq, p.steps.map((s) => s.approx_ms), `${p.id}: schematic timing should pass through unchanged`);
  }
});
