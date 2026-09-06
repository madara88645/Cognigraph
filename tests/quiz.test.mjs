// Every Learn question is generated from the data files, so these tests are mostly about two things:
// the same seed must always produce the same question (the Leitner boxes key on the item id, so a
// missed item has to come back identical), and no question may be answerable without knowing the
// material — no duplicate options, no answer leaking into a distractor.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  lqItems, lqItemIds, lqItem, lqQuestion, lqFirstSentence, lqShortName,
  lqRegionRoleId, lqLesionId, lqStepId, lqTermId, lqSeenTerms, lqSeenTermItems,
  LQ_OPTIONS, LQ_SEEN_STORAGE,
} from '../src/learn/quiz.js';
import { REGIONS } from '../src/data/regions.js';
import { PATHWAYS } from '../src/data/pathways.js';
import { GLOSSARY } from '../src/data/glossary.js';

const SEED = 20260906;

function fakeStore(initial) {
  const map = new Map(Object.entries(initial || {}));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

/* ---------- the item pool ---------- */

test('there is one item per region role, per lesion, per pathway transition and per glossary term', () => {
  const items = lqItems();
  const byType = items.reduce((a, x) => { a[x.type] = (a[x.type] || 0) + 1; return a; }, {});
  const transitions = PATHWAYS.reduce((n, p) => n + p.steps.length - 1, 0);
  assert.equal(byType.region_role, REGIONS.filter((r) => r.one_liner).length);
  assert.equal(byType.lesion, REGIONS.filter((r) => r.lesion_effects).length);
  assert.equal(byType.next_step, transitions);
  assert.equal(byType.term, GLOSSARY.filter((g) => g.term && g.plain_definition).length);
  assert.equal(new Set(items.map((x) => x.id)).size, items.length, 'ids are unique');
});

test('every item in the pool actually produces a question', () => {
  const bad = lqItemIds().filter((id) => !lqQuestion(id, SEED));
  assert.deepEqual(bad, [], 'these items could not be turned into a question');
});

test('an unknown id is null rather than a throw or a guess', () => {
  assert.equal(lqQuestion('region:not_a_region:role', SEED), null);
  assert.equal(lqQuestion('', SEED), null);
  assert.equal(lqQuestion(null, SEED), null);
  assert.equal(lqItem('nope'), null);
});

/* ---------- determinism ---------- */

test('the same seed gives byte-identical questions, every time', () => {
  for (const id of lqItemIds().slice(0, 40)) {
    assert.deepEqual(lqQuestion(id, SEED), lqQuestion(id, SEED), id);
  }
});

test('a different seed reshuffles options without changing which one is right', () => {
  const ids = lqItemIds();
  let moved = 0;
  for (const id of ids) {
    const a = lqQuestion(id, 1);
    const b = lqQuestion(id, 2);
    assert.equal(a.options[a.answer], b.options[b.answer], 'the correct text never changes: ' + id);
    if (a.options.join('|') !== b.options.join('|')) moved++;
  }
  assert.ok(moved > ids.length * 0.8, 'seeds should actually change the question, moved=' + moved);
});

/* ---------- question quality ---------- */

test('every question has four distinct options and an in-range answer index', () => {
  for (const id of lqItemIds()) {
    const q = lqQuestion(id, SEED);
    assert.equal(q.options.length, LQ_OPTIONS, id);
    assert.equal(new Set(q.options.map((o) => o.trim().toLowerCase())).size, LQ_OPTIONS, 'duplicate option in ' + id);
    assert.ok(q.answer >= 0 && q.answer < LQ_OPTIONS, id);
    assert.ok(q.prompt && q.prompt.length > 10, 'prompt too short: ' + id);
    assert.ok(q.kicker, id);
    for (const o of q.options) assert.ok(o && o.trim(), 'empty option in ' + id);
  }
});

test('the answer to a region question is the region, and it carries the id for the 3D highlight', () => {
  const r = REGIONS.find((x) => x.id === 'ffa');
  const q = lqQuestion(lqRegionRoleId('ffa'), SEED);
  assert.equal(q.type, 'region_role');
  assert.equal(q.prompt, r.one_liner);
  assert.equal(q.options[q.answer], r.name);
  assert.equal(q.regionId, 'ffa');
  assert.equal(q.source.title, r.name);
});

test('a lesion question asks about one region and never names it in a wrong option', () => {
  for (const r of REGIONS) {
    const q = lqQuestion(lqLesionId(r.id), SEED);
    if (!q) continue;
    assert.equal(q.options[q.answer], lqFirstSentence(r.lesion_effects), r.id);
    assert.ok(q.prompt.indexOf(r.name) >= 0, 'the prompt names the region: ' + r.id);
    const short = lqShortName(r.name).toLowerCase();
    q.options.forEach((o, i) => {
      if (i === q.answer) return;
      assert.equal(o.toLowerCase().indexOf(short), -1, 'distractor leaks "' + short + '" in ' + r.id);
    });
  }
});

test('"what comes next" asks about the step after the one it shows, and only inside one pathway', () => {
  const p = PATHWAYS[0];
  const q = lqQuestion(lqStepId(p.id, 0), SEED);
  const nextRegion = REGIONS.find((r) => r.id === p.steps[1].region_ids[0]);
  assert.equal(q.type, 'next_step');
  assert.equal(q.options[q.answer], nextRegion.name);
  assert.equal(q.regionId, nextRegion.id);
  assert.ok(q.prompt.indexOf(p.title) >= 0);
  // the region that is actually next must not also appear as a distractor under another step's name
  const wrong = q.options.filter((_, i) => i !== q.answer);
  for (const id of p.steps[1].region_ids) {
    const name = (REGIONS.find((r) => r.id === id) || {}).name;
    if (name) assert.equal(wrong.indexOf(name), -1, 'a next-step region was offered as wrong: ' + id);
  }
  assert.equal(lqQuestion(lqStepId(p.id, p.steps.length - 1), SEED), null, 'the last step has no "next"');
});

test('a glossary question shows the definition and offers four real terms', () => {
  const g = GLOSSARY[0];
  const q = lqQuestion(lqTermId(g.term), SEED);
  const terms = new Set(GLOSSARY.map((x) => x.term));
  assert.equal(q.prompt, g.plain_definition);
  assert.equal(q.options[q.answer], g.term);
  assert.equal(q.regionId, null, 'a term has no region to fly to');
  for (const o of q.options) assert.ok(terms.has(o), 'invented term: ' + o);
});

test('every question carries the record it was drawn from', () => {
  for (const id of lqItemIds()) {
    const q = lqQuestion(id, SEED);
    assert.ok(q.source && q.source.title, 'no source title on ' + id);
    assert.ok(q.source.lines && q.source.lines.length, 'no source lines on ' + id);
  }
});

/* ---------- "terms you looked up" ---------- */

test('looked-up terms come back newest first, and only ones the quiz can ask about', () => {
  const store = fakeStore({
    [LQ_SEEN_STORAGE]: JSON.stringify({
      Synapse: { n: 1, at: 100 },
      Neuron: { n: 4, at: 900 },
      'Not A Real Term': { n: 2, at: 500 },
    }),
  });
  assert.deepEqual(lqSeenTerms(store), ['Neuron', 'Not A Real Term', 'Synapse']);
  assert.deepEqual(lqSeenTermItems(store), [lqTermId('Neuron'), lqTermId('Synapse')]);
});

test('no log, junk in the log, and no storage at all all read as "nothing looked up"', () => {
  assert.deepEqual(lqSeenTerms(fakeStore()), []);
  assert.deepEqual(lqSeenTerms(fakeStore({ [LQ_SEEN_STORAGE]: '{{{' })), []);
  assert.deepEqual(lqSeenTerms(fakeStore({ [LQ_SEEN_STORAGE]: '[]' })), []);
  assert.deepEqual(lqSeenTerms(null), []);
  assert.deepEqual(lqSeenTermItems(null), []);
});

/* ---------- small helpers ---------- */

test('first sentence stops at the first full stop, but never returns a fragment', () => {
  assert.equal(lqFirstSentence('One thing happens here. Then another.'), 'One thing happens here.');
  assert.equal(lqFirstSentence('No full stop at all'), 'No full stop at all');
  assert.equal(lqFirstSentence('Ok. A much longer second sentence follows it.'),
    'Ok. A much longer second sentence follows it.', 'a two-word opener is not a sentence worth showing');
  assert.equal(lqFirstSentence(''), '');
});

test('short names drop the trailing parenthetical, or use it when it is the abbreviation', () => {
  assert.equal(lqShortName('Primary Visual Cortex (V1)'), 'V1');
  assert.equal(lqShortName('Hippocampus'), 'Hippocampus');
  assert.equal(lqShortName('Nucleus Accumbens (ventral striatum)'), 'Nucleus Accumbens');
});
