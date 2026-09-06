import test from 'node:test';
import assert from 'node:assert/strict';
import { REGIONS } from '../src/data/regions.js';
import { PATHWAYS } from '../src/data/pathways.js';
import { GLOSSARY } from '../src/data/glossary.js';
import { NEUROMOD_DEFS, NEURON_PRESETS, ACCURACY_PITFALLS } from '../src/data/neuro.js';

test('data counts match the research spec', () => {
  assert.equal(REGIONS.length, 28);
  assert.equal(PATHWAYS.length, 8);
  assert.ok(GLOSSARY.length >= 40, `glossary has ${GLOSSARY.length}`);
  assert.equal(NEUROMOD_DEFS.length, 6);
  assert.equal(Object.keys(NEURON_PRESETS).length, 6);
  assert.ok(ACCURACY_PITFALLS.length >= 13);
});
test('every pathway step references known region ids', () => {
  const ids = new Set(REGIONS.map((r) => r.id));
  for (const p of PATHWAYS) for (const s of p.steps) for (const id of s.region_ids) assert.ok(ids.has(id), `${p.id}: unknown region ${id}`);
});
test('region ids are unique and required fields exist', () => {
  const seen = new Set();
  for (const r of REGIONS) {
    assert.ok(!seen.has(r.id), `dup ${r.id}`); seen.add(r.id);
    for (const k of ['name', 'group', 'one_liner', 'functions', 'lesion_effects', 'approx_location']) assert.ok(r[k], `${r.id} missing ${k}`);
  }
});
