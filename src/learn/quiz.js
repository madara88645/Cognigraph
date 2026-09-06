// Quiz generation (Worker Q): every question is built from the data files, never written by hand.
//
// Four question types, all four-choice:
//   region_role  "Which region does this?"          one_liner       -> 4 region names
//   next_step    "What comes next?"                 a pathway step  -> 4 region names
//   lesion       "What breaks if X is damaged?"     lesion_effects  -> 4 first sentences
//   term         "Which term is this?"              a definition    -> 4 glossary terms
//
// Nothing here is random at runtime: `lqQuestion(itemId, seed)` is a pure function of its arguments,
// so the same seed always produces the same distractors in the same order. That matters because the
// Leitner boxes key on the item id — an item you got wrong yesterday must come back as the same
// question, not as a fresh roll of the dice.
//
// The answer is never marked in the data handed to the UI beyond `answer` (an index), and the source
// record travels with the question so the app can show what it was drawn from.
import { REGIONS } from '../data/regions.js';
import { PATHWAYS } from '../data/pathways.js';
import { GLOSSARY } from '../data/glossary.js';

export const LQ_OPTIONS = 4;
export const LQ_SEEN_STORAGE = 'cg.glossary.seen';

export const LQ_KICKERS = {
  region_role: 'Which region does this?',
  next_step: 'What comes next?',
  lesion: 'What breaks if this is damaged?',
  term: 'Which term is this?',
};

/* ---------- deterministic randomness ---------- */

/** FNV-1a over a string, so an item id can seed its own generator. */
function lqHash(str) {
  let h = 2166136261 >>> 0;
  const s = String(str == null ? '' : str);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** mulberry32 — same generator the neuron network uses, kept local so nothing is shared by accident. */
function lqRandom(seed) {
  let s = (seed >>> 0) || 1;
  return function next() {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function lqShuffle(list, rnd) {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const tmp = out[i]; out[i] = out[j]; out[j] = tmp;
  }
  return out;
}

/* ---------- text helpers ---------- */

/** First sentence only; falls back to the whole string when there is no sentence break. */
export function lqFirstSentence(text) {
  const t = String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
  const m = t.match(/^[\s\S]*?[.!?](?=\s|$)/);
  const first = m ? m[0].trim() : t;
  return (first.length >= 20 || !t) ? first : t;
}

/** "Primary Visual Cortex (V1)" -> "V1"; "Broca's Area" -> "Broca's Area". */
export function lqShortName(name) {
  const n = String(name == null ? '' : name).trim();
  const paren = n.match(/\(([^()]{1,14})\)\s*$/);
  if (paren) return paren[1];
  return n.replace(/\s*\([^()]*\)\s*$/, '');
}

function lqRegion(id) { return REGIONS.find((r) => r.id === id) || null; }
function lqPathway(id) { return PATHWAYS.find((p) => p.id === id) || null; }

function lqTermSlug(term) {
  return String(term == null ? '' : term).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function lqTermBySlug(slug) {
  return GLOSSARY.find((g) => lqTermSlug(g.term) === slug) || null;
}

/* ---------- item ids ---------- */

export function lqRegionRoleId(id) { return 'region:' + id + ':role'; }
export function lqLesionId(id) { return 'region:' + id + ':lesion'; }
export function lqStepId(pathwayId, i) { return 'path:' + pathwayId + '#' + i; }
export function lqTermId(term) { return 'term:' + lqTermSlug(term); }

let lqItemCache = null;

/**
 * Every item this app can ask about, in a fixed order.
 * @returns {Array<{id:string, type:string, regionId?:string, pathwayId?:string, step?:number, term?:string}>}
 */
export function lqItems() {
  if (lqItemCache) return lqItemCache;
  const out = [];
  for (const r of REGIONS) {
    if (r.one_liner) out.push({ id: lqRegionRoleId(r.id), type: 'region_role', regionId: r.id });
  }
  for (const r of REGIONS) {
    if (r.lesion_effects) out.push({ id: lqLesionId(r.id), type: 'lesion', regionId: r.id });
  }
  for (const p of PATHWAYS) {
    for (let i = 0; i < p.steps.length - 1; i++) {
      out.push({ id: lqStepId(p.id, i), type: 'next_step', pathwayId: p.id, step: i });
    }
  }
  for (const g of GLOSSARY) {
    if (g.term && g.plain_definition) out.push({ id: lqTermId(g.term), type: 'term', term: g.term });
  }
  lqItemCache = out;
  return out;
}

export function lqItemIds(type) {
  const all = lqItems();
  return (type ? all.filter((x) => x.type === type) : all).map((x) => x.id);
}

export function lqItem(id) {
  return lqItems().find((x) => x.id === id) || null;
}

/* ---------- distractors ---------- */

/**
 * Pick three wrong answers. Candidates are offered in preference order (same lobe first, say) and the
 * generator takes the first three distinct ones, so a question is hard for a reason rather than by
 * luck. Duplicate text is rejected: two options that read the same are not a question.
 */
function lqPickDistractors(correct, preferred, fallback, rnd) {
  const out = [];
  const seen = new Set([String(correct).trim().toLowerCase()]);
  for (const pool of [preferred, fallback]) {
    for (const cand of lqShuffle(pool, rnd)) {
      if (out.length >= LQ_OPTIONS - 1) break;
      const key = String(cand).trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(cand);
    }
  }
  return out.length === LQ_OPTIONS - 1 ? out : null;
}

function lqFinish(base, correct, distractors, rnd) {
  const options = lqShuffle([correct].concat(distractors), rnd);
  const answer = options.indexOf(correct);
  if (answer < 0) return null;
  return Object.assign({ options, answer }, base);
}

/* ---------- the four generators ---------- */

function lqRegionRoleQ(item, rnd) {
  const r = lqRegion(item.regionId);
  if (!r || !r.one_liner) return null;
  const same = REGIONS.filter((x) => x.id !== r.id && x.group === r.group).map((x) => x.name);
  const rest = REGIONS.filter((x) => x.id !== r.id && x.group !== r.group).map((x) => x.name);
  const d = lqPickDistractors(r.name, same, rest, rnd);
  if (!d) return null;
  return lqFinish({
    id: item.id, type: item.type, kicker: LQ_KICKERS.region_role,
    prompt: r.one_liner,
    regionId: r.id,
    source: {
      title: r.name,
      badge: 'from the region card',
      lines: [r.one_liner, 'Group: ' + r.group, 'Connects with: ' + (r.key_connections || []).join(', ')],
    },
  }, r.name, d, rnd);
}

function lqLesionQ(item, rnd) {
  const r = lqRegion(item.regionId);
  if (!r || !r.lesion_effects) return null;
  const correct = lqFirstSentence(r.lesion_effects);
  const short = lqShortName(r.name).toLowerCase();
  // A distractor that names the region in the question would give the answer away by elimination.
  const others = REGIONS.filter((x) => x.id !== r.id && x.lesion_effects)
    .map((x) => lqFirstSentence(x.lesion_effects))
    .filter((s) => s.toLowerCase().indexOf(short) < 0);
  const same = REGIONS.filter((x) => x.id !== r.id && x.group === r.group && x.lesion_effects)
    .map((x) => lqFirstSentence(x.lesion_effects))
    .filter((s) => s.toLowerCase().indexOf(short) < 0);
  const d = lqPickDistractors(correct, same, others, rnd);
  if (!d) return null;
  return lqFinish({
    id: item.id, type: item.type, kicker: LQ_KICKERS.lesion,
    prompt: 'What breaks if ' + r.name + ' is damaged?',
    regionId: r.id,
    source: {
      title: r.name,
      badge: 'from the region card',
      lines: [r.lesion_effects, r.famous_case_or_evidence || ''].filter(Boolean),
    },
  }, correct, d, rnd);
}

function lqNextStepQ(item, rnd) {
  const p = lqPathway(item.pathwayId);
  if (!p) return null;
  const here = p.steps[item.step];
  const next = p.steps[item.step + 1];
  if (!here || !next || !next.region_ids || !next.region_ids.length) return null;
  const target = lqRegion(next.region_ids[0]);
  const hereRegion = lqRegion(here.region_ids[0]);
  if (!target || !hereRegion) return null;
  const inPathway = p.steps
    .flatMap((s) => s.region_ids)
    .filter((id) => next.region_ids.indexOf(id) < 0)
    .map((id) => (lqRegion(id) || {}).name)
    .filter(Boolean);
  const rest = REGIONS.filter((x) => next.region_ids.indexOf(x.id) < 0).map((x) => x.name);
  const d = lqPickDistractors(target.name, inPathway, rest, rnd);
  if (!d) return null;
  return lqFinish({
    id: item.id, type: item.type, kicker: LQ_KICKERS.next_step,
    prompt: 'In "' + p.title + '", step ' + (item.step + 1) + ' is ' + hereRegion.name + ': '
      + lqFirstSentence(here.what_happens) + ' Which region does the next step use?',
    regionId: target.id,
    source: {
      title: p.title + ' — step ' + (item.step + 2),
      badge: 'from the pathway',
      lines: [
        target.name + (typeof next.approx_ms === 'number' && p.timeline === 'ms' ? ' · ~' + next.approx_ms + ' ms' : ''),
        next.what_happens,
        next.why_it_matters,
      ].filter(Boolean),
    },
  }, target.name, d, rnd);
}

function lqTermQ(item, rnd) {
  const slug = String(item.id).slice('term:'.length);
  const g = lqTermBySlug(slug);
  if (!g) return null;
  const others = GLOSSARY.filter((x) => x.term !== g.term).map((x) => x.term);
  const d = lqPickDistractors(g.term, [], others, rnd);
  if (!d) return null;
  return lqFinish({
    id: item.id, type: item.type, kicker: LQ_KICKERS.term,
    prompt: g.plain_definition,
    regionId: null,
    source: { title: g.term, badge: 'from the glossary', lines: [g.plain_definition] },
  }, g.term, d, rnd);
}

/* ---------- public API ---------- */

/**
 * Build the question for one item.
 * @param {string} itemId  an id from lqItems()
 * @param {number} [seed]  same seed + same id => identical question, every time
 * @returns {object|null}  {id, type, kicker, prompt, options[4], answer, regionId, source}
 */
export function lqQuestion(itemId, seed = 1) {
  const item = lqItem(itemId);
  if (!item) return null;
  const rnd = lqRandom((lqHash(itemId) ^ Math.imul(lqHash(String(seed)), 2654435761)) >>> 0);
  if (item.type === 'region_role') return lqRegionRoleQ(item, rnd);
  if (item.type === 'lesion') return lqLesionQ(item, rnd);
  if (item.type === 'next_step') return lqNextStepQ(item, rnd);
  if (item.type === 'term') return lqTermQ(item, rnd);
  return null;
}

/* ---------- "terms you looked up" ---------- */

function lqStore(store) {
  if (store) return store;
  try { return (typeof localStorage !== 'undefined') ? localStorage : null; } catch (err) { return null; }
}

/**
 * The glossary terms this browser has actually opened, most recently first.
 * Written by src/ui/glossary.js when the popover opens; missing or corrupt data reads as "none".
 */
export function lqSeenTerms(store) {
  const s = lqStore(store);
  if (!s) return [];
  let raw = '';
  try { raw = s.getItem(LQ_SEEN_STORAGE) || ''; } catch (err) { return []; }
  if (!raw) return [];
  let obj = null;
  try { obj = JSON.parse(raw); } catch (err) { return []; }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return [];
  return Object.keys(obj)
    .map((term) => ({ term, at: Number(obj[term] && obj[term].at) || 0 }))
    .sort((a, b) => b.at - a.at)
    .map((x) => x.term);
}

/** Item ids for the terms this browser looked up, in the order they were looked up. */
export function lqSeenTermItems(store) {
  const known = new Set(lqItemIds('term'));
  const out = [];
  for (const term of lqSeenTerms(store)) {
    const id = lqTermId(term);
    if (known.has(id) && out.indexOf(id) < 0) out.push(id);
  }
  return out;
}
