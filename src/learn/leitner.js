// Leitner scheduler (Worker Q): three boxes, pure functions, one localStorage key.
//
// Everything about *when* an item comes back lives here and nowhere else, so it can be tested without
// a browser. The UI only ever asks two questions: what is due now, and what happens when the answer
// was right or wrong.
//
// Boxes: 1 = due immediately, 2 = due in a day, 3 = due in four days. A right answer moves an item up
// one box; a wrong answer sends it straight back to box 1. There is no box 0 and no graduation — an
// item in box 3 that keeps being right just keeps coming back every four days.
//
// No streaks, no timers, no scores. The only state kept per item is the box, when it is next due, and
// two counters the progress line uses.

export const LT_STORAGE = 'cg.learn.v1';
export const LT_VERSION = 1;
export const LT_BOXES = 3;
export const LT_DAY_MS = 86400000;

/** Delay before an item in box n is due again, indexed by box (index 0 is unused). */
export const LT_DELAY_MS = [0, 0, LT_DAY_MS, 4 * LT_DAY_MS];

/* ---------- shapes ---------- */

function ltInt(v, fallback) {
  const n = typeof v === 'number' ? v : parseInt(v, 10);
  return Number.isFinite(n) ? Math.round(n) : fallback;
}

function ltClampBox(v) {
  const n = ltInt(v, 1);
  return n < 1 ? 1 : (n > LT_BOXES ? LT_BOXES : n);
}

/** A never-seen item behaves exactly like a box-1 item that is due now. */
export function ltFresh() {
  return { box: 1, due: 0, right: 0, wrong: 0, seen: 0 };
}

export function ltEmptyState() {
  return { v: LT_VERSION, items: {} };
}

/**
 * Turn whatever was in localStorage into a state object. Anything unrecognised is dropped rather than
 * repaired: a corrupted entry is not worth guessing at, and losing one item's box is cheap.
 */
export function ltNormalise(raw) {
  const state = ltEmptyState();
  const obj = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : null;
  if (!obj) return state;
  const items = (obj.items && typeof obj.items === 'object' && !Array.isArray(obj.items)) ? obj.items : {};
  for (const id of Object.keys(items)) {
    const e = items[id];
    if (!e || typeof e !== 'object') continue;
    state.items[id] = {
      box: ltClampBox(e.box),
      due: Math.max(0, ltInt(e.due, 0)),
      right: Math.max(0, ltInt(e.right, 0)),
      wrong: Math.max(0, ltInt(e.wrong, 0)),
      seen: Math.max(0, ltInt(e.seen, 0)),
    };
  }
  return state;
}

/* ---------- storage (browser only; every access is guarded) ---------- */

function ltStore(store) {
  if (store) return store;
  try { return (typeof localStorage !== 'undefined') ? localStorage : null; } catch (err) { return null; }
}

/** Read the saved state, or an empty one. Never throws, never returns null. */
export function ltLoad(store) {
  const s = ltStore(store);
  if (!s) return ltEmptyState();
  let text = '';
  try { text = s.getItem(LT_STORAGE) || ''; } catch (err) { return ltEmptyState(); }
  if (!text) return ltEmptyState();
  try { return ltNormalise(JSON.parse(text)); } catch (err) { return ltEmptyState(); }
}

/** @returns {boolean} whether it actually got written (private mode and full quotas both say false). */
export function ltSave(state, store) {
  const s = ltStore(store);
  if (!s) return false;
  try { s.setItem(LT_STORAGE, JSON.stringify(ltNormalise(state))); return true; } catch (err) { return false; }
}

export function ltClear(store) {
  const s = ltStore(store);
  if (!s) return false;
  try { s.removeItem(LT_STORAGE); return true; } catch (err) { return false; }
}

/* ---------- scheduling ---------- */

/** The entry for an id, or a fresh one. Never a reference into the state. */
export function ltEntry(state, id) {
  const e = state && state.items ? state.items[id] : null;
  return e ? { ...e } : ltFresh();
}

/**
 * The whole scheduler, in one pure function.
 * @param {object} entry   current entry (or undefined for a new item)
 * @param {boolean} correct
 * @param {number} now     epoch ms
 * @returns {object} the next entry — the argument is never modified
 */
export function ltSchedule(entry, correct, now) {
  const e = entry && typeof entry === 'object' ? entry : ltFresh();
  const box = ltClampBox(e.box);
  const t = ltInt(now, 0);
  const next = correct ? Math.min(LT_BOXES, box + 1) : 1;
  return {
    box: next,
    due: t + LT_DELAY_MS[next],
    right: Math.max(0, ltInt(e.right, 0)) + (correct ? 1 : 0),
    wrong: Math.max(0, ltInt(e.wrong, 0)) + (correct ? 0 : 1),
    seen: t,
  };
}

/** Record one answer. Returns a NEW state; the argument is left alone. */
export function ltRate(state, id, correct, now) {
  const base = ltNormalise(state);
  base.items[id] = ltSchedule(ltEntry(base, id), !!correct, now);
  return base;
}

function ltDueAt(state, id) {
  const e = state && state.items ? state.items[id] : null;
  return e ? Math.max(0, ltInt(e.due, 0)) : 0;   // never seen: due since the beginning of time
}

/**
 * The ids that are due, oldest-due first. Ties keep the order of `ids`, so the queue is stable
 * between reloads instead of reshuffling every time the page is opened.
 */
export function ltDue(state, ids, now) {
  const t = ltInt(now, 0);
  const list = Array.isArray(ids) ? ids : [];
  return list
    .map((id, i) => ({ id, i, due: ltDueAt(state, id) }))
    .filter((x) => x.due <= t)
    .sort((a, b) => (a.due - b.due) || (a.i - b.i))
    .map((x) => x.id);
}

/** The next id to ask, or null when nothing is due. */
export function ltNext(state, ids, now) {
  const due = ltDue(state, ids, now);
  return due.length ? due[0] : null;
}

/** How many of `ids` sit in each box. Never-seen items count as box 1, which is where they start. */
export function ltCounts(state, ids) {
  const out = { 1: 0, 2: 0, 3: 0 };
  for (const id of (Array.isArray(ids) ? ids : [])) {
    const e = state && state.items ? state.items[id] : null;
    out[e ? ltClampBox(e.box) : 1]++;
  }
  return out;
}
