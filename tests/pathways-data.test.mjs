import test from 'node:test';
import assert from 'node:assert/strict';
import { PATHWAYS } from '../src/data/pathways.js';
import { REGIONS } from '../src/data/regions.js';

const byId = (id) => PATHWAYS.find((p) => p.id === id);
const text = (o) => JSON.stringify(o);

test('there are 8 pathways with unique ids and the required top-level fields', () => {
  assert.equal(PATHWAYS.length, 8);
  const seen = new Set();
  for (const p of PATHWAYS) {
    assert.ok(!seen.has(p.id), `duplicate pathway id ${p.id}`);
    seen.add(p.id);
    assert.ok(p.title && p.title.length, `${p.id}: missing title`);
    assert.ok(p.scenario_sentence && p.scenario_sentence.length > 20, `${p.id}: missing scenario_sentence`);
    assert.ok(p.accuracy_caveats && p.accuracy_caveats.length > 40, `${p.id}: caveats must always be shown, so they must exist`);
    assert.ok(['ms', 'schematic'].includes(p.timeline), `${p.id}: timeline must be 'ms' or 'schematic'`);
  }
});

test('each pathway has 4-6 fully written steps referencing known regions', () => {
  const ids = new Set(REGIONS.map((r) => r.id));
  for (const p of PATHWAYS) {
    assert.ok(p.steps.length >= 4 && p.steps.length <= 6, `${p.id} has ${p.steps.length} steps`);
    for (const [i, s] of p.steps.entries()) {
      assert.ok(Array.isArray(s.region_ids) && s.region_ids.length >= 1, `${p.id} step ${i}: no regions`);
      for (const id of s.region_ids) assert.ok(ids.has(id), `${p.id} step ${i}: unknown region ${id}`);
      assert.equal(typeof s.approx_ms, 'number', `${p.id} step ${i}: approx_ms must be a number`);
      assert.ok(Number.isFinite(s.approx_ms) && s.approx_ms >= 0, `${p.id} step ${i}: bad approx_ms`);
      assert.ok(s.what_happens && s.what_happens.length > 40, `${p.id} step ${i}: thin what_happens`);
      assert.ok(s.why_it_matters && s.why_it_matters.length > 30, `${p.id} step ${i}: thin why_it_matters`);
      assert.ok(s.evidence_or_method && s.evidence_or_method.length > 20, `${p.id} step ${i}: missing evidence_or_method`);
    }
  }
});

test('approx_ms never goes backwards within a pathway', () => {
  for (const p of PATHWAYS) {
    for (let i = 1; i < p.steps.length; i++) {
      assert.ok(p.steps[i].approx_ms >= p.steps[i - 1].approx_ms,
        `${p.id}: step ${i} (${p.steps[i].approx_ms}ms) precedes step ${i - 1} (${p.steps[i - 1].approx_ms}ms)`);
    }
  }
});

test('the two slow pathways are flagged schematic, the other six are in ms', () => {
  const schematic = PATHWAYS.filter((p) => p.timeline === 'schematic').map((p) => p.id).sort();
  assert.deepEqual(schematic, ['motor_skill_learning', 'sleep_consolidation']);
  for (const id of schematic) {
    assert.match(byId(id).accuracy_caveats, /SCHEMATIC/,
      `${id}: caveats must say the timeline is schematic, not measured latencies`);
  }
  assert.equal(PATHWAYS.filter((p) => p.timeline === 'ms').length, 6);
});

test('fear_response drops the mis-cited PNAS reference and the 20-30 ms MEG amygdala figure', () => {
  const fear = text(byId('fear_response'));
  assert.ok(!fear.includes('PNAS'), 'Luo et al. 2007 was published in NeuroImage, not PNAS');
  assert.ok(!fear.includes('20-30'), 'the MEG-derived 20-30 ms amygdala latency must not be quoted');
  assert.ok(fear.includes('NeuroImage'), 'the corrected journal must be named');
  assert.ok(fear.includes('74-88'), 'the intracranial amygdala onset (Mendez-Bertolo 2016) must be kept');
  assert.match(byId('fear_response').accuracy_caveats, /rodent/i, 'the low road must be flagged rodent-established');
});

test('the language pathways carry the "classic model is a teaching simplification" caveat', () => {
  for (const id of ['recall_word', 'reading_sentence']) {
    assert.match(byId(id).accuracy_caveats, /Tremblay & Dick, 2016/, `${id}: missing the modern-aphasiology caveat`);
  }
});

test('the FFA/N170 claim is softened to a primary, not sole, contributor', () => {
  const face = text(byId('recognize_face'));
  assert.ok(!/source-localizes the N170/.test(face));
  assert.match(face, /not the sole/);
});

test('no HTML entities or raw markup leaked into the pathway copy', () => {
  const all = text(PATHWAYS);
  assert.ok(!/&(amp|quot|lt|gt|nbsp|#\d+);/.test(all), 'HTML entity found in pathway text');
  assert.ok(!/<[a-z/][^>]*>/.test(all), 'raw HTML tag found in pathway text');
});
