import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  MODULATION, MOD_BASELINE, MOD_MIN_FACTOR, MOD_MAX_FACTOR, MOD_BADGE_LABEL,
  modFactor, modLevelWord, modRulesFor, modTiming, modWorstBadge,
} from '../src/data/modulation.js';
import { PATHWAYS } from '../src/data/pathways.js';

const byId = (id) => PATHWAYS.find((p) => p.id === id);
const baseline = () => ({ ...MOD_BASELINE });

test('the baseline in modulation.js is the same six sliders main.js boots with', () => {
  const src = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const m = src.match(/modulators:\s*\{([^}]*)\}/);
  assert.ok(m, 'main.js no longer declares app.modulators — the baseline here would drift');
  const fromMain = {};
  for (const pair of m[1].split(',')) {
    const kv = pair.split(':');
    if (kv.length === 2) fromMain[kv[0].trim()] = parseFloat(kv[1]);
  }
  assert.deepEqual(fromMain, MOD_BASELINE);
});

test('every rule points at a real pathway step and is fully written', () => {
  assert.ok(MODULATION.length >= 12, `only ${MODULATION.length} rules`);
  const seen = new Set();
  for (const r of MODULATION) {
    const p = byId(r.pathway_id);
    assert.ok(p, `unknown pathway ${r.pathway_id}`);
    assert.ok(Number.isInteger(r.step_index) && r.step_index >= 0 && r.step_index < p.steps.length,
      `${r.pathway_id}: step ${r.step_index} does not exist`);
    assert.ok(Object.prototype.hasOwnProperty.call(MOD_BASELINE, r.modulator), `unknown modulator ${r.modulator}`);
    assert.ok(['faster', 'slower'].includes(r.direction), `${r.pathway_id}[${r.step_index}]: bad direction`);
    assert.ok(r.strength > 0 && r.strength <= 0.35, `${r.pathway_id}[${r.step_index}]: strength out of range`);
    assert.ok(['ok', 'mid', 'low'].includes(r.badge), `${r.pathway_id}[${r.step_index}]: bad badge`);
    assert.ok(r.why && r.why.length > 30, `${r.pathway_id}[${r.step_index}]: thin why`);
    assert.equal(r.why.trim().split(/[.!?]/).filter((s) => s.trim().length).length, 1,
      `${r.pathway_id}[${r.step_index}]: why must be one sentence`);
    const key = `${r.pathway_id}:${r.step_index}:${r.modulator}`;
    assert.ok(!seen.has(key), `duplicate rule ${key}`);
    seen.add(key);
  }
});

test('schematic pathways are never scaled — their numbers are an animation order', () => {
  for (const p of PATHWAYS.filter((x) => x.timeline === 'schematic')) {
    assert.equal(MODULATION.filter((r) => r.pathway_id === p.id).length, 0, `${p.id} must have no timing rules`);
  }
});

test('at baseline nothing moves', () => {
  const mods = baseline();
  for (const r of MODULATION) assert.equal(modFactor(r, mods), 1, `${r.pathway_id}[${r.step_index}] moved at baseline`);
  for (const p of PATHWAYS) {
    for (const [i, s] of p.steps.entries()) {
      const t = modTiming(p.id, i, s.approx_ms, mods);
      assert.equal(t.ms, s.approx_ms);
      assert.equal(t.changed, false);
    }
  }
});

test("'faster' shortens above baseline and lengthens below it; 'slower' does the reverse", () => {
  const fast = MODULATION.find((r) => r.direction === 'faster');
  const slow = MODULATION.find((r) => r.direction === 'slower');
  const high = (r) => ({ ...MOD_BASELINE, [r.modulator]: 1 });
  const low = (r) => ({ ...MOD_BASELINE, [r.modulator]: 0 });
  assert.ok(modFactor(fast, high(fast)) < 1);
  assert.ok(modFactor(fast, low(fast)) > 1);
  assert.ok(modFactor(slow, high(slow)) > 1);
  assert.ok(modFactor(slow, low(slow)) < 1);
});

test('high noradrenaline speeds the response the burst drives, not the burst itself', () => {
  const p = byId('attention_shift');
  const i = 2;
  assert.ok(p.steps[i].region_ids.includes('ppc'), 'the rule is pinned to the wrong step');
  const t = modTiming(p.id, i, p.steps[i].approx_ms, { ...MOD_BASELINE, noradrenaline: 0.9 });
  assert.ok(t.ms < p.steps[i].approx_ms, `${t.ms} should be under ${p.steps[i].approx_ms}`);
  assert.equal(t.changed, true);
  assert.equal(t.active[0].level, 'high');

  // The locus coeruleus step is where the noradrenaline burst is generated. Scaling it with the
  // noradrenaline slider would be claiming the burst arrives sooner because of itself.
  const lc = p.steps.findIndex((s) => s.region_ids.includes('locus_coeruleus'));
  assert.ok(lc >= 0, 'attention_shift lost its locus coeruleus step');
  assert.equal(modRulesFor(p.id, lc).length, 0, 'the LC step must not be scaled by its own transmitter');
});

test('the benzodiazepine rule is honest that its evidence is about magnitude, not latency', () => {
  const r = MODULATION.find((x) => x.pathway_id === 'fear_response' && x.modulator === 'gaba');
  assert.ok(r, 'the amygdala GABA rule is gone');
  assert.equal(r.badge, 'low', 'a timing claim extrapolated from a magnitude effect cannot be badged Simplified');
  assert.match(r.why, /extrapolation/i, 'the why must say the timing effect is extrapolated');
});

test('scaling never lets a later step arrive before an earlier one', () => {
  // Neighbouring steps have different sensitivities, so under an extreme slider they could swap
  // places. The running floor Pathways applies is the guard; this pins the property it protects.
  const seq = (p, mods) => {
    let prev = -Infinity;
    return p.steps.map((s, i) => {
      const t = modTiming(p.id, i, s.approx_ms, mods);
      let ms = t.changed ? t.ms : s.approx_ms;
      if (ms < prev) ms = prev;
      prev = ms;
      return ms;
    });
  };
  const extremes = [
    { dopamine: 1, acetylcholine: 1, noradrenaline: 1, serotonin: 1, gaba: 0, cortisol: 0 },
    { dopamine: 0, acetylcholine: 0, noradrenaline: 0, serotonin: 0, gaba: 1, cortisol: 1 },
  ];
  for (const mods of extremes) {
    for (const p of PATHWAYS) {
      const ms = seq(p, mods);
      for (let i = 1; i < ms.length; i++) {
        assert.ok(ms[i] >= ms[i - 1], `${p.id}: step ${i} (${ms[i]}ms) landed before step ${i - 1} (${ms[i - 1]}ms)`);
      }
    }
  }
});

test('high cortisol slows the hippocampal retrieval step of recall_word', () => {
  const p = byId('recall_word');
  const t = modTiming(p.id, 1, p.steps[1].approx_ms, { ...MOD_BASELINE, cortisol: 0.9 });
  assert.ok(t.ms > p.steps[1].approx_ms);
  assert.equal(t.active[0].rule.badge, 'ok');
});

test('low dopamine slows the striatal decision step', () => {
  const p = byId('making_decision');
  const t = modTiming(p.id, 3, p.steps[3].approx_ms, { ...MOD_BASELINE, dopamine: 0 });
  assert.ok(t.ms > p.steps[3].approx_ms, 'less dopamine must mean a slower choice');
});

test('the total factor is clamped to 0.6-1.6 even when every rule pushes the same way', () => {
  const extreme = { dopamine: 1, acetylcholine: 1, noradrenaline: 1, serotonin: 1, gaba: 0, cortisol: 0 };
  const floor = { dopamine: 0, acetylcholine: 0, noradrenaline: 0, serotonin: 0, gaba: 1, cortisol: 1 };
  for (const mods of [extreme, floor]) {
    for (const p of PATHWAYS) {
      for (const [i, s] of p.steps.entries()) {
        const t = modTiming(p.id, i, s.approx_ms, mods);
        assert.ok(t.factor >= MOD_MIN_FACTOR - 1e-9 && t.factor <= MOD_MAX_FACTOR + 1e-9,
          `${p.id}[${i}] factor ${t.factor} escaped the clamp`);
        assert.ok(t.ms >= 0);
      }
    }
  }
});

test('missing or nonsense modulator state leaves the timing alone', () => {
  const p = byId('recall_word');
  assert.equal(modTiming(p.id, 1, 400, {}).ms, 400);
  assert.equal(modTiming(p.id, 1, 400, { cortisol: 'nope' }).ms, 400);
  assert.equal(modTiming('not_a_pathway', 0, 400, { cortisol: 1 }).ms, 400);
  assert.equal(modFactor(null, baseline()), 1);
});

test('helpers: rules lookup, level words, worst badge, badge labels', () => {
  assert.ok(modRulesFor('attention_shift', 2).length >= 1);
  assert.equal(modRulesFor('attention_shift', 99).length, 0);
  assert.equal(modLevelWord('cortisol', { ...MOD_BASELINE, cortisol: 0.9 }), 'high');
  assert.equal(modLevelWord('cortisol', { ...MOD_BASELINE, cortisol: 0 }), 'low');
  assert.equal(modLevelWord('cortisol', baseline()), 'typical');
  assert.equal(modWorstBadge([{ badge: 'ok' }, { badge: 'low' }, { badge: 'mid' }]), 'low');
  assert.equal(modWorstBadge([{ badge: 'ok' }]), 'ok');
  for (const k of ['ok', 'mid', 'low']) assert.ok(MOD_BADGE_LABEL[k], `no label for ${k}`);
});
