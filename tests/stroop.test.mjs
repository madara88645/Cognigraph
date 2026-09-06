import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LAB_COLORS, LAB_PRACTICE, LAB_RESPONSE_MS, LAB_STROOP_KEY, LAB_TRIALS,
  labMakeTrials, labMeasureUsable, labRng, labScoreStroop,
} from '../src/lab/stroop.js';

const trial = (o) => ({ practice: false, congruent: true, rt: 500, correct: true, timeout: false, ...o });

test('the task is 24 scored trials, 4 practice, 4 colours on distinct keys', () => {
  assert.equal(LAB_TRIALS, 24);
  assert.equal(LAB_PRACTICE, 4);
  assert.equal(LAB_RESPONSE_MS, 1500);
  assert.equal(LAB_STROOP_KEY, 'cg.measure.stroop');
  assert.equal(LAB_COLORS.length, 4);
  assert.equal(new Set(LAB_COLORS.map((c) => c.key)).size, 4);
  assert.deepEqual(LAB_COLORS.map((c) => c.key), ['d', 'f', 'j', 'k']);
});

test('the trial list is balanced: 12 congruent, 12 incongruent, practice up front', () => {
  const trials = labMakeTrials(42);
  assert.equal(trials.length, LAB_PRACTICE + LAB_TRIALS);
  assert.equal(trials.slice(0, LAB_PRACTICE).every((t) => t.practice), true);
  const scored = trials.slice(LAB_PRACTICE);
  assert.equal(scored.every((t) => !t.practice), true);
  assert.equal(scored.filter((t) => t.congruent).length, 12);
  assert.equal(scored.filter((t) => !t.congruent).length, 12);
  for (const t of scored) {
    const ink = LAB_COLORS.find((c) => c.id === t.ink);
    assert.ok(ink, `unknown ink ${t.ink}`);
    if (t.congruent) assert.equal(t.word, ink.word);
    else assert.notEqual(t.word, ink.word);
  }
});

test('the same seed gives the same trial list', () => {
  assert.deepEqual(labMakeTrials(9), labMakeTrials(9));
  assert.notDeepEqual(labMakeTrials(9), labMakeTrials(10));
  const rnd = labRng(3);
  for (let i = 0; i < 50; i++) { const v = rnd(); assert.ok(v >= 0 && v < 1); }
});

test('scoring is pure and returns the documented shape', () => {
  const trials = [trial({ congruent: true, rt: 400 }), trial({ congruent: false, rt: 600 })];
  const frozen = JSON.stringify(trials);
  const r = labScoreStroop(trials, 1234);
  assert.deepEqual(Object.keys(r).sort(),
    ['accuracy', 'at', 'interference', 'meanRtCongruent', 'meanRtIncongruent', 'n'].sort());
  assert.equal(r.meanRtCongruent, 400);
  assert.equal(r.meanRtIncongruent, 600);
  assert.equal(r.interference, 200);
  assert.equal(r.accuracy, 1);
  assert.equal(r.n, 2);
  assert.equal(r.at, 1234);
  assert.equal(JSON.stringify(trials), frozen, 'scoring must not mutate its input');
  assert.deepEqual(labScoreStroop(trials, 1234), r, 'same input, same output');
});

test('practice trials are excluded from every number', () => {
  const r = labScoreStroop([
    trial({ practice: true, congruent: true, rt: 10 }),
    trial({ practice: true, congruent: false, rt: 20 }),
    trial({ congruent: true, rt: 400 }),
    trial({ congruent: false, rt: 700 }),
  ], 0);
  assert.equal(r.n, 2);
  assert.equal(r.meanRtCongruent, 400);
  assert.equal(r.meanRtIncongruent, 700);
  assert.equal(r.accuracy, 1);
});

test('a timeout is an error and contributes no reaction time', () => {
  const r = labScoreStroop([
    trial({ congruent: true, rt: 400 }),
    trial({ congruent: true, rt: null, correct: false, timeout: true }),
    trial({ congruent: false, rt: 800 }),
    trial({ congruent: false, rt: 900, correct: false }),
  ], 0);
  assert.equal(r.n, 4);
  assert.equal(r.meanRtCongruent, 400, 'the timed-out trial must not enter the mean');
  assert.equal(r.meanRtIncongruent, 800, 'the wrong-key trial must not enter the mean');
  assert.equal(r.accuracy, 0.5);
});

test('an empty or all-wrong run reports null rather than a fake interference', () => {
  const empty = labScoreStroop([], 0);
  assert.equal(empty.n, 0);
  assert.equal(empty.interference, null);
  assert.equal(empty.accuracy, 0);
  assert.equal(labScoreStroop(null, 0).n, 0);
  const half = labScoreStroop([trial({ congruent: true, rt: 400 })], 0);
  assert.equal(half.meanRtIncongruent, null);
  assert.equal(half.interference, null, 'one side missing means no interference number');
});

test('usability gate: a result is only shown when it has trials and reasonable accuracy', () => {
  assert.equal(labMeasureUsable(null), false);
  assert.equal(labMeasureUsable({ interference: 80, n: 24, accuracy: 0.9 }), true);
  assert.equal(labMeasureUsable({ interference: 80, n: 24, accuracy: 0.4 }), false);
  assert.equal(labMeasureUsable({ interference: null, n: 24, accuracy: 1 }), false);
  assert.equal(labMeasureUsable({ interference: 80, n: 0, accuracy: 1 }), false);
});
