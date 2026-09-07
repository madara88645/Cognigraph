// The Leitner scheduler decides when a missed item comes back, which is the only thing Learn mode
// promises. These tests pin the box arithmetic, the due ordering, and the fact that hostile or absent
// storage degrades to an empty state instead of throwing.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ltEmptyState, ltFresh, ltNormalise, ltLoad, ltSave, ltClear, ltEntry,
  ltSchedule, ltRate, ltDue, ltNext, ltCounts,
  LT_STORAGE, LT_DAY_MS, LT_DELAY_MS, LT_BOXES,
} from '../src/learn/leitner.js';

/** A localStorage stand-in with the same three methods and the same throwing habits on demand. */
function fakeStore(initial, opts = {}) {
  const map = new Map(Object.entries(initial || {}));
  return {
    getItem: (k) => { if (opts.throwOnGet) throw new Error('blocked'); return map.has(k) ? map.get(k) : null; },
    setItem: (k, v) => { if (opts.throwOnSet) throw new Error('quota'); map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
    _map: map,
  };
}

const NOW = 1757000000000;

/* ---------- boxes ---------- */

test('a new item starts in box 1 and is due immediately', () => {
  const state = ltEmptyState();
  assert.deepEqual(ltEntry(state, 'region:v1:role'), ltFresh());
  assert.equal(ltEntry(state, 'anything').box, 1);
  assert.equal(ltEntry(state, 'anything').due, 0);
  assert.deepEqual(ltDue(state, ['a', 'b'], NOW), ['a', 'b']);
});

test('right moves up one box and pushes the due date out; wrong drops straight to box 1', () => {
  let e = ltSchedule(ltFresh(), true, NOW);
  assert.equal(e.box, 2);
  assert.equal(e.due, NOW + LT_DAY_MS);
  assert.equal(e.right, 1);

  e = ltSchedule(e, true, NOW);
  assert.equal(e.box, 3);
  assert.equal(e.due, NOW + 4 * LT_DAY_MS);

  e = ltSchedule(e, true, NOW);
  assert.equal(e.box, LT_BOXES, 'box 3 is the top; it does not graduate');
  assert.equal(e.due, NOW + LT_DELAY_MS[3]);

  const missed = ltSchedule(e, false, NOW);
  assert.equal(missed.box, 1, 'one miss undoes every promotion');
  assert.equal(missed.due, NOW, 'and it comes back this session');
  assert.equal(missed.wrong, 1);
  assert.equal(missed.right, 3, 'the counters keep the history');
});

test('ltSchedule does not modify the entry it was given', () => {
  const before = ltFresh();
  const copy = { ...before };
  ltSchedule(before, true, NOW);
  assert.deepEqual(before, copy);
});

test('ltRate returns a new state and leaves the old one alone', () => {
  const a = ltEmptyState();
  const b = ltRate(a, 'term:neuron', true, NOW);
  assert.deepEqual(a.items, {}, 'the input state is untouched');
  assert.equal(b.items['term:neuron'].box, 2);
});

/* ---------- ordering ---------- */

test('the queue is the due items, oldest due first, ties in pool order', () => {
  let s = ltEmptyState();
  s = ltRate(s, 'b', true, NOW - LT_DAY_MS - 5000);   // due 5 s ago
  s = ltRate(s, 'c', true, NOW);                      // due tomorrow
  s = ltRate(s, 'd', false, NOW - 1000);              // wrong: due 1 s ago
  const pool = ['a', 'b', 'c', 'd'];

  const due = ltDue(s, pool, NOW);
  assert.deepEqual(due, ['a', 'b', 'd'], 'c is not due for another day');
  assert.equal(ltNext(s, pool, NOW), 'a', 'never-seen items sort first, then oldest due');

  // and the same call an hour later still excludes c
  assert.equal(ltDue(s, pool, NOW + 3600000).indexOf('c'), -1);
  assert.ok(ltDue(s, pool, NOW + LT_DAY_MS + 1000).indexOf('c') >= 0, 'c returns once its day is up');
});

test('ltNext is null when nothing is due', () => {
  let s = ltEmptyState();
  s = ltRate(s, 'a', true, NOW);
  assert.equal(ltNext(s, ['a'], NOW), null);
  assert.equal(ltNext(ltEmptyState(), [], NOW), null);
});

test('counts cover every id in the pool, with unseen items counted in box 1', () => {
  let s = ltEmptyState();
  s = ltRate(s, 'a', true, NOW);          // box 2
  s = ltRate(s, 'b', true, NOW);
  s = ltRate(s, 'b', true, NOW);          // box 3
  assert.deepEqual(ltCounts(s, ['a', 'b', 'c', 'd']), { 1: 2, 2: 1, 3: 1 });
});

/* ---------- persistence ---------- */

test('a saved state survives a reload and keeps its due dates', () => {
  const store = fakeStore();
  let s = ltRate(ltEmptyState(), 'region:ffa:lesion', true, NOW);
  s = ltRate(s, 'term:synapse', false, NOW);
  assert.equal(ltSave(s, store), true);
  assert.equal(store._map.has(LT_STORAGE), true, 'written under the documented key');

  const back = ltLoad(store);
  assert.equal(back.items['region:ffa:lesion'].box, 2);
  assert.equal(back.items['region:ffa:lesion'].due, NOW + LT_DAY_MS);
  assert.equal(back.items['term:synapse'].box, 1);
  assert.deepEqual(ltDue(back, ['region:ffa:lesion', 'term:synapse'], NOW), ['term:synapse']);
});

test('missing, corrupt and hostile storage all read as an empty state', () => {
  assert.deepEqual(ltLoad(fakeStore()), ltEmptyState());
  assert.deepEqual(ltLoad(fakeStore({ [LT_STORAGE]: 'not json' })), ltEmptyState());
  assert.deepEqual(ltLoad(fakeStore({ [LT_STORAGE]: '[1,2,3]' })), ltEmptyState());
  assert.deepEqual(ltLoad(fakeStore({}, { throwOnGet: true })), ltEmptyState());
  assert.deepEqual(ltLoad(null), ltEmptyState(), 'no localStorage at all (this test runner)');
});

test('out-of-range boxes and junk entries are clamped or dropped, never trusted', () => {
  const raw = { v: 1, items: { a: { box: 99, due: -5 }, b: { box: 0 }, c: 'nope', d: null } };
  const s = ltNormalise(raw);
  assert.equal(s.items.a.box, LT_BOXES);
  assert.equal(s.items.a.due, 0);
  assert.equal(s.items.b.box, 1);
  assert.equal(Object.prototype.hasOwnProperty.call(s.items, 'c'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(s.items, 'd'), false);
});

test('a browser that refuses to write says so instead of throwing', () => {
  assert.equal(ltSave(ltEmptyState(), fakeStore({}, { throwOnSet: true })), false);
  assert.equal(ltSave(ltEmptyState(), null), false);
});

test('clearing removes the key and nothing else', () => {
  const store = fakeStore({ other: 'keep' });
  ltSave(ltRate(ltEmptyState(), 'a', true, NOW), store);
  assert.equal(ltClear(store), true);
  assert.equal(store._map.has(LT_STORAGE), false);
  assert.equal(store._map.get('other'), 'keep');
});
