// Quiz fuzz: tests/quiz.test.mjs already checks every item id at one fixed seed. This file amplifies
// that across many seeds (enough to generate >= 500 question instances total) so a shuffle bug that
// only shows up for certain seeds — e.g. an option array that occasionally collides after Fisher-
// Yates, or an answer index that only goes out of range for specific RNG draws — has a real chance to
// surface. For every question generated: exactly one correct option, four distinct options, and the
// source record it claims to be drawn from actually exists in the data.
import test from 'node:test';
import assert from 'node:assert/strict';
import { lqItemIds, lqQuestion, LQ_OPTIONS } from '../src/learn/quiz.js';
import { REGIONS } from '../src/data/regions.js';
import { PATHWAYS } from '../src/data/pathways.js';
import { GLOSSARY } from '../src/data/glossary.js';

const ITEM_IDS = lqItemIds();
const MIN_QUESTIONS = 500;
const SEEDS_NEEDED = Math.max(1, Math.ceil(MIN_QUESTIONS / ITEM_IDS.length));

const REGION_IDS = new Set(REGIONS.map((r) => r.id));
const PATHWAY_IDS = new Set(PATHWAYS.map((p) => p.id));
const GLOSSARY_TERMS = new Set(GLOSSARY.map((g) => g.term));

/** The question claims to be drawn from a real record: a region, a pathway step, or a glossary term. */
function sourceRecordExists(q) {
  if (q.type === 'region_role' || q.type === 'lesion') return REGION_IDS.has(q.regionId) && q.source && REGIONS.some((r) => r.name === q.source.title);
  if (q.type === 'next_step') return q.source && PATHWAY_IDS.has(q.source.pathwayId || extractPathwayId(q));
  if (q.type === 'term') return q.source && GLOSSARY_TERMS.has(q.source.title);
  return !!q.source;
}

function extractPathwayId(q) {
  // next_step ids are 'path:<pathwayId>#<i>'; fall back to parsing the id if source lacks the field.
  const m = /^path:([^#]+)#/.exec(q.id || '');
  return m ? m[1] : null;
}

test(`${SEEDS_NEEDED} seeds x ${ITEM_IDS.length} items (>= ${MIN_QUESTIONS} questions): exactly one correct, 4 distinct options, source record exists`, () => {
  let total = 0;
  for (let seed = 1; seed <= SEEDS_NEEDED; seed++) {
    for (const id of ITEM_IDS) {
      const q = lqQuestion(id, seed);
      assert.ok(q, `seed ${seed}: ${id} produced no question`);
      total++;

      assert.equal(q.options.length, LQ_OPTIONS, `seed ${seed}, ${id}: expected ${LQ_OPTIONS} options`);
      const normalised = q.options.map((o) => String(o).trim().toLowerCase());
      assert.equal(new Set(normalised).size, LQ_OPTIONS, `seed ${seed}, ${id}: duplicate option among ${JSON.stringify(q.options)}`);

      assert.ok(Number.isInteger(q.answer) && q.answer >= 0 && q.answer < LQ_OPTIONS,
        `seed ${seed}, ${id}: answer index ${q.answer} out of range`);
      // exactly one option equals the answer text (guards against a shuffle bug that duplicates the
      // correct text into a distractor, which the distinct-options check above would not catch if
      // the duplicate happened to collide with itself at the answer index only)
      const correctText = q.options[q.answer];
      const matches = q.options.filter((o) => o === correctText).length;
      assert.equal(matches, 1, `seed ${seed}, ${id}: correct text "${correctText}" appears ${matches} times`);

      assert.ok(q.prompt && q.prompt.trim().length > 5, `seed ${seed}, ${id}: prompt missing/too short`);
      assert.ok(sourceRecordExists(q), `seed ${seed}, ${id}: source record does not exist for type ${q.type}`);
    }
  }
  assert.ok(total >= MIN_QUESTIONS, `only generated ${total} questions`);
});

test('an unknown item id never produces a fake question, across many seeds', () => {
  for (let seed = 1; seed <= 20; seed++) {
    assert.equal(lqQuestion('region:not_a_region:role', seed), null);
    assert.equal(lqQuestion('totally-bogus-id', seed), null);
  }
});
