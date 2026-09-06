// Local scenario classifier (Worker B): pure, deterministic, no key, no network.
// Given a free-text moment it picks the closest of the 8 PATHWAYS (or composes a generic sequence)
// and derives a six-value neuromodulator profile from a small hand-written lexicon.
//
// This is a keyword heuristic, not a model of anything. It exists so Scenario mode works with no API
// key at all, and so the LLM path always has something honest to fall back to. Every result it returns
// says `source: 'local'` and carries the cues it matched, so the UI can show its working.
import { PATHWAYS } from '../data/pathways.js';
import { REGIONS } from '../data/regions.js';

/** The six modulator keys, in the fixed order the UI and the sliders use. */
export const LLM_MODULATORS = ['dopamine', 'acetylcholine', 'noradrenaline', 'serotonin', 'gaba', 'cortisol'];

/**
 * "Nothing in particular is going on" profile. Serotonin and GABA sit near 0.5 because they are tonic
 * systems; the phasic ones sit low. Dominance is always judged as a delta from this, never as a raw max.
 */
export const LLM_BASELINE = Object.freeze({
  dopamine: 0.25, acetylcholine: 0.30, noradrenaline: 0.35, serotonin: 0.45, gaba: 0.50, cortisol: 0.12,
});

const LLM_MAX_INPUT = 1200;     // characters we look at; longer text is truncated before scoring
const LLM_MAX_CONF = 0.7;       // a keyword heuristic never gets to sound sure
const LLM_MIN_SCORE = 1.6;      // below this no pathway is close enough and we compose a generic one

/* ---------- text helpers ---------- */

/** Lowercase, punctuation to spaces, single-spaced, with a leading/trailing space so ' word' matches. */
function llmNorm(s) {
  return ' ' + String(s == null ? '' : s).slice(0, LLM_MAX_INPUT).toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim() + ' ';
}

/**
 * Cue match, anchored on a word boundary at the LEFT and — for short cues — at the right too.
 *
 * Cues of 4+ characters are stems: 'focus' hits "focused"/"focusing", 'high stakes' hits
 * "high-stakes". Cues of 3 or fewer characters must be whole words, because a three-letter stem
 * matches far too much: 'gam' used to fire on "gamma", 'fun' on "functional", 'new' on "newborn",
 * so a sentence about infant EEG came back reward-dominant.
 */
function llmHas(norm, cue) {
  const stem = cue.length > 3;
  let i = norm.indexOf(' ' + cue);
  while (i >= 0) {
    if (stem || norm.charAt(i + 1 + cue.length) === ' ') return true;
    i = norm.indexOf(' ' + cue, i + 1);
  }
  return false;
}

function llmClamp01(x) { return x < 0 ? 0 : (x > 1 ? 1 : x); }

function llmRound(x, places = 2) {
  const f = Math.pow(10, places);
  return Math.round(x * f) / f;
}

const LLM_STOP = new Set([
  'about', 'after', 'again', 'against', 'because', 'been', 'before', 'being', 'between', 'both', 'came',
  'come', 'could', 'does', 'doing', 'down', 'during', 'each', 'even', 'ever', 'every', 'from', 'have',
  'having', 'here', 'into', 'just', 'like', 'made', 'make', 'more', 'most', 'much', 'must', 'never',
  'only', 'other', 'over', 'own', 'same', 'she', 'should', 'some', 'still', 'such', 'than', 'that',
  'their', 'them', 'then', 'there', 'these', 'they', 'this', 'those', 'through', 'time', 'under',
  'until', 'very', 'was', 'were', 'what', 'when', 'where', 'which', 'while', 'who', 'will', 'with',
  'without', 'would', 'your', 'yours', 'you', 'and', 'but', 'for', 'not', 'are', 'the', 'its', 'it',
]);

/* ---------- lexicons ---------- */

/**
 * Hand-written cues per pathway. A hit is worth a full point; the generic word-overlap below is worth
 * much less. Cues are prefixes, so 'recogni' covers recognize/recognise/recognition.
 */
const LLM_PATH_CUES = {
  recognize_face: ['face', 'recogni', 'friend', 'crowd', 'glance', 'someone', 'person', 'people',
    'familiar', 'party', 'smil', 'stranger', 'social', 'campfire', 'storytell', 'greet', 'meet'],
  recall_word: ['remember', 'forgot', 'forget', 'recall', 'name', 'memor', 'classmate', 'retriev',
    'answer', 'revis', 'blank', 'exam', 'quiz', 'idea', 'concept', 'brainstorm', 'creativ', 'imagin',
    'invent', 'story', 'associat', 'word for'],
  fear_response: ['snake', 'threat', 'scar', 'fear', 'afraid', 'danger', 'startl', 'panic', 'spider',
    'terrif', 'fright', 'anxi', 'nervous', 'stage', 'alarm', 'shadow', 'intrud'],
  making_decision: ['decid', 'decision', 'choos', 'choice', 'option', 'weigh', 'pick', 'vending',
    'snack', 'buy', 'purchas', 'prefer', 'dilemma', 'trade off', 'tradeoff', 'menu', 'either'],
  reading_sentence: ['read', 'sentence', 'book', 'paragraph', 'article', 'essay', 'writ', 'languag',
    'poem', 'subtitle', 'engross', 'focus', 'concentrat', 'algorithm', 'code', 'coding', 'software',
    'study', 'deep work', 'zone', 'proofread'],
  motor_skill_learning: ['practic', 'tennis', 'serve', 'skill', 'train', 'guitar', 'piano', 'drill',
    'repetition', 'workout', 'deadlift', 'gym', 'sport', 'muscle', 'movement', 'motor', 'typing',
    'bike', 'swim', 'danc', 'throw', 'lift', 'rehears'],
  attention_shift: ['attention', 'sudden', 'driv', 'ball', 'notic', 'distract', 'alert', 'vigilan',
    'react', 'spot', 'unexpected', 'multiplayer', 'opponent', 'track', 'fast paced', 'split second',
    'match', 'game', 'gaming', 'compet', 'reflex', 'emergency', 'brake', 'swerv', 'road', 'traffic', 'motorway',
    'highway', 'street', 'pedestrian', 'cyclist', 'crash', 'collid', 'horn', 'vehicl'],
  sleep_consolidation: ['sleep', 'slept', 'nap', 'night', 'dream', 'consolidat', 'overnight', 'tired',
    'rest', 'bed', 'insomnia', 'wake up', 'woke'],
};

/**
 * Neuromodulator lexicon. Each entry moves several values at once, scaled by how many of its cues hit.
 * These are directional teaching associations, not measurements — the UI says so on every result.
 */
const LLM_MOD_CUES = [
  {
    cue: 'threat and pressure',
    words: ['stress', 'exam', 'deadline', 'threat', 'panic', 'pressure', 'high stakes', 'fear',
      'afraid', 'scar', 'terrif', 'danger', 'anxi', 'nervous', 'fright', 'worri', 'overwhelm',
      'snake', 'emergency', 'crisis', 'fail', 'punish', 'judg', 'stage', 'interview'],
    mod: { cortisol: 0.45, noradrenaline: 0.20, serotonin: -0.10, gaba: -0.10 },
  },
  {
    cue: 'prolonged load',
    words: ['chronic', 'burnout', 'exhaust', 'weeks', 'months', 'every day', 'constant', 'sleepless',
      'insomnia', 'all night', 'overtrain', 'again and again', 'endless'],
    mod: { cortisol: 0.30, serotonin: -0.15, gaba: -0.05 },
  },
  {
    cue: 'reward and novelty',
    words: ['reward', 'win', 'prize', 'money', 'score', 'level up', 'excit', 'fun', 'game', 'gaming', 'play',
      'espresso', 'coffee', 'caffeine', 'crav', 'goal', 'achiev', 'novel', 'curious', 'surpris',
      'idea', 'brainstorm', 'creativ', 'new', 'treat', 'chocolate'],
    mod: { dopamine: 0.35, noradrenaline: 0.10 },
  },
  {
    cue: 'social warmth',
    words: ['friend', 'family', 'together', 'campfire', 'warm', 'laugh', 'hug', 'love', 'kind',
      'trust', 'safe', 'belong', 'storytell', 'chat', 'conversation', 'shar', 'cozy', 'grateful'],
    mod: { serotonin: 0.30, gaba: 0.15, cortisol: -0.10 },
  },
  {
    cue: 'sustained focus',
    words: ['focus', 'concentrat', 'attention', 'study', 'learn', 'read', 'writ', 'code', 'coding',
      'algorithm', 'detail', 'careful', 'engross', 'deep work', 'zone', 'practic', 'memor',
      'remember', 'recall', 'solv', 'think', 'analy', 'revis'],
    mod: { acetylcholine: 0.35 },
  },
  {
    cue: 'alertness and speed',
    words: ['sudden', 'alert', 'vigilan', 'fast', 'quick', 'react', 'split second', 'sharp', 'startl',
      'loud', 'driv', 'race', 'compet', 'opponent', 'multiplayer', 'track', 'rush', 'urgent'],
    mod: { noradrenaline: 0.30, gaba: -0.05 },
  },
  {
    cue: 'calm and rest',
    words: ['calm', 'relax', 'rest', 'sleep', 'nap', 'breath', 'meditat', 'quiet', 'slow', 'peace',
      'unwind', 'drowsy', 'bed', 'night', 'gentle', 'still'],
    mod: { gaba: 0.30, serotonin: 0.20, noradrenaline: -0.25, cortisol: -0.10 },
  },
  {
    cue: 'movement and effort',
    words: ['run', 'lift', 'deadlift', 'tennis', 'serve', 'guitar', 'piano', 'throw', 'swim', 'cycl',
      'gym', 'workout', 'danc', 'sport', 'typing', 'movement', 'muscle', 'walk', 'climb', 'kick'],
    mod: { dopamine: 0.15, noradrenaline: 0.15, acetylcholine: 0.10 },
  },
];

/* ---------- pathway scoring ---------- */

let llmBlobCache = null;

/** Normalized searchable text for every pathway: title + scenario sentence + all step prose. */
function llmPathwayBlobs() {
  if (llmBlobCache) return llmBlobCache;
  llmBlobCache = PATHWAYS.map((p) => ({
    id: p.id,
    pathway: p,
    blob: llmNorm([p.title, p.scenario_sentence,
      p.steps.map((s) => s.what_happens + ' ' + s.why_it_matters).join(' ')].join(' ')),
  }));
  return llmBlobCache;
}

/** Content words from the user's text: 4+ letters, not a stopword, de-duplicated, order preserved. */
function llmContentWords(norm) {
  const out = [];
  const seen = new Set();
  for (const w of norm.trim().split(' ')) {
    if (w.length < 4 || LLM_STOP.has(w) || seen.has(w)) continue;
    seen.add(w);
    out.push(w);
  }
  return out;
}

/**
 * Score every pathway. Curated cues dominate (1.0 each); shared content words with the pathway's own
 * prose add a little (0.3 each, capped) so an unusual but on-topic description still lands somewhere.
 */
function llmScorePathways(norm) {
  const words = llmContentWords(norm);
  return llmPathwayBlobs().map((entry) => {
    const cues = (LLM_PATH_CUES[entry.id] || []).filter((c) => llmHas(norm, c));
    let overlap = 0;
    for (const w of words) if (entry.blob.indexOf(' ' + w) >= 0) overlap++;
    const score = cues.length + Math.min(1.2, overlap * 0.3);
    return { id: entry.id, pathway: entry.pathway, cues, overlap, score };
  }).sort((a, b) => (b.score - a.score) || (a.id < b.id ? -1 : 1));   // ties break alphabetically: deterministic
}

/* ---------- modulator profile ---------- */

/** Cue-category strength: one hit is a hint, three or more is the category firing fully. */
function llmCueStrength(hits) {
  if (hits <= 0) return 0;
  return Math.min(1, 0.45 + 0.25 * (hits - 1));
}

function llmProfile(norm) {
  const profile = { ...LLM_BASELINE };
  const matched = [];
  for (const entry of LLM_MOD_CUES) {
    const hits = entry.words.filter((w) => llmHas(norm, w));
    if (!hits.length) continue;
    const strength = llmCueStrength(hits.length);
    for (const k of Object.keys(entry.mod)) profile[k] = profile[k] + entry.mod[k] * strength;
    matched.push({ cue: entry.cue, words: hits, strength });
  }
  for (const k of LLM_MODULATORS) profile[k] = llmRound(llmClamp01(profile[k]));
  return { profile, matched };
}

/** Which modulator moved furthest from its resting value (not which is numerically largest). */
export function llmDominantModulator(profile) {
  let best = null, bestDelta = 0;
  for (const k of LLM_MODULATORS) {
    const d = (profile && typeof profile[k] === 'number' ? profile[k] : LLM_BASELINE[k]) - LLM_BASELINE[k];
    if (Math.abs(d) > Math.abs(bestDelta) + 1e-9) { bestDelta = d; best = k; }
  }
  return { key: best, delta: llmRound(bestDelta) };
}

/* ---------- fallback sequence ---------- */

function llmRegionName(id) {
  const r = REGIONS.find((x) => x.id === id);
  return r ? r.name : id;
}

/**
 * When no pathway is close enough: a generic sensory -> relay -> parietal -> prefrontal sketch, with one
 * step inserted for whichever modulator system the lexicon flagged. Deliberately bland — it is a
 * placeholder for "we could not tell", not a claim about the described moment.
 */
function llmDefaultSteps(dominantKey) {
  const steps = [
    {
      region_ids: ['v1'], approx_ms: 60,
      what_happens: 'Whatever the moment looks like arrives in primary visual cortex, which pulls out edges, contrast and orientation before anything is recognised.',
      why_it_matters: 'Almost every everyday episode starts with sensory cortex, so this is the safe first step when the description does not name a specific task.',
    },
    {
      region_ids: ['thalamus'], approx_ms: 120,
      what_happens: 'The thalamus keeps relaying and gating what reaches cortex, letting some signals through and damping others.',
      why_it_matters: 'It is the traffic control point for nearly all sensory input, so its state shapes how much of the moment gets processed at all.',
    },
    {
      region_ids: ['ppc'], approx_ms: 220,
      what_happens: 'Posterior parietal cortex assembles the pieces into a spatial picture of where things are relative to the body.',
      why_it_matters: 'Orienting to a scene is a general-purpose step that shows up in most tasks, whether or not they involve movement.',
    },
    {
      region_ids: ['dlpfc'], approx_ms: 350,
      what_happens: 'Dorsolateral prefrontal cortex holds the result in mind and decides what, if anything, to do about it.',
      why_it_matters: 'This is where a perceived situation becomes something you can reason about, report or act on.',
    },
  ];
  const insert = {
    cortisol: {
      at: 1,
      step: {
        region_ids: ['amygdala', 'hypothalamus'], approx_ms: 90,
        what_happens: 'The amygdala tags the situation as significant and signals the hypothalamus, which starts the slow hormonal stress response.',
        why_it_matters: 'The description used stress words, so a salience-and-stress branch is more likely than a purely neutral pass.',
      },
    },
    noradrenaline: {
      at: 1,
      step: {
        region_ids: ['locus_coeruleus'], approx_ms: 100,
        what_happens: 'The locus coeruleus releases noradrenaline broadly across cortex, raising gain so strong signals stand out from weak ones.',
        why_it_matters: 'The description sounded urgent or fast, and this is the system usually invoked for that kind of vigilance.',
      },
    },
    dopamine: {
      at: 3,
      step: {
        region_ids: ['vta', 'nucleus_accumbens'], approx_ms: 300,
        what_happens: 'Midbrain dopamine neurons and the nucleus accumbens respond to something better (or newer) than expected, biasing you towards approaching it.',
        why_it_matters: 'The description mentioned reward or novelty, which is the usual trigger for this circuit in teaching examples.',
      },
    },
    acetylcholine: {
      at: 3,
      step: {
        region_ids: ['acc'], approx_ms: 300,
        what_happens: 'Anterior cingulate cortex tracks how much effort the task is costing and whether it is going wrong.',
        why_it_matters: 'The description was about focused effort, and effort monitoring usually rides alongside sustained attention.',
      },
    },
    serotonin: {
      at: 3,
      step: {
        region_ids: ['raphe_nuclei', 'vmpfc_ofc'], approx_ms: 320,
        what_happens: 'Raphe serotonin and ventromedial prefrontal cortex settle the overall tone of the episode rather than any single computation.',
        why_it_matters: 'The description was calm or social, which in teaching models is framed around slow, mood-setting systems.',
      },
    },
    gaba: {
      at: 3,
      step: {
        region_ids: ['raphe_nuclei'], approx_ms: 320,
        what_happens: 'Widespread inhibition keeps the network quiet and stable rather than letting activity spread.',
        why_it_matters: 'The description sounded restful, and inhibitory tone is the usual shorthand for a settled network.',
      },
    },
  }[dominantKey];
  if (insert) steps.splice(insert.at, 0, insert.step);
  return steps;
}

/* ---------- sensitive input ---------- */

/**
 * Turkish letters have no NFD decomposition for the dotless/dotted i pair, so those two are mapped by
 * hand; everything else (ö ü ğ ç ş, and any accented Latin) is stripped of its combining marks. The
 * result goes through llmNorm, so "kendimi öldürmek" and "KENDIMI OLDURMEK" score identically.
 */
function llmFold(s) {
  return String(s == null ? '' : s)
    .replace(/İ/g, 'I').replace(/ı/g, 'i')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/** Self-harm / suicidal-ideation cues, English and Turkish. Matched with llmHas word boundaries. */
const LLM_CRISIS_CUES = [
  'suicide', 'suicidal', 'kill myself', 'killing myself', 'killed myself', 'end my life',
  'ending my life', 'take my own life', 'want to die', 'wanna die', 'wish i was dead',
  'self harm', 'selfharm', 'hurt myself', 'hurting myself', 'harm myself', 'harming myself',
  'cut myself', 'cutting myself', 'no reason to live', 'better off dead',
  'intihar', 'kendimi oldur', 'kendimi olduru', 'olmek istiyorum', 'kendime zarar',
  'yasamak istemiyorum',
];

/** Diagnostic / prescribing requests that fire on their own, English and Turkish. */
const LLM_MEDICAL_CUES = [
  'diagnose', 'diagnosis', 'diagnostic', 'diagnosed with', 'prescribe', 'prescription',
  'medication for', 'medicine for', 'pills for', 'am i depressed', 'am i bipolar',
  'am i autistic', 'am i schizophrenic', 'is this a disorder', 'is it a disorder',
  'teshis', 'tani koy', 'hastaligim var mi', 'hastaligim mi var', 'ilac',
];

/**
 * "Do I have X?" is only a medical question when X is a condition. Asking it about a condition is a
 * diagnosis request; asking "do I have time before the exam" is a scenario, so the frame alone is
 * never enough.
 */
const LLM_DIAG_FRAMES = ['do i have', 'have i got', 'am i', 'bende var mi', 'bende', 'bana ne oluyor'];
const LLM_DIAG_CONDITIONS = [
  'depress', 'bipolar', 'adhd', 'autis', 'asperger', 'ocd', 'ptsd', 'schizophren', 'psychosis',
  'psychotic', 'dementia', 'alzheimer', 'parkinson', 'epilep', 'seizure', 'tumour', 'tumor',
  'cancer', 'concussion', 'stroke', 'disorder', 'disease', 'illness', 'syndrome',
  'depresyon', 'hastalik', 'hastaligi', 'bozuklugu', 'bozukluk',
];

/**
 * Flag text that should never be turned into a brain animation: a person describing self-harm, or a
 * person asking this app to diagnose or medicate them. Purely lexical, English + Turkish, case- and
 * diacritic-insensitive. It is a coarse net on purpose — Scenario mode uses it to stop and say what it
 * cannot do, which is cheap to be wrong about in this direction and expensive in the other.
 *
 * @param {string} text
 * @returns {{crisis:boolean, medical:boolean, cues:string[]}}
 */
export function llmDetectSensitive(text) {
  const norm = llmNorm(llmFold(text));
  const cues = [];

  for (const c of LLM_CRISIS_CUES) if (llmHas(norm, c)) cues.push(c);
  const crisis = cues.length > 0;

  const medCues = [];
  for (const c of LLM_MEDICAL_CUES) if (llmHas(norm, c)) medCues.push(c);
  if (LLM_DIAG_FRAMES.some((f) => llmHas(norm, f))) {
    for (const c of LLM_DIAG_CONDITIONS) if (llmHas(norm, c)) medCues.push(c);
  }
  for (const c of medCues) if (cues.indexOf(c) < 0) cues.push(c);

  return { crisis, medical: medCues.length > 0, cues };
}

/* ---------- lesions ---------- */

/**
 * Mark, never remove. A step that runs through a lesioned region is still part of the story the
 * heuristic tells — the honest thing is to show it and say it is broken, not to quietly delete it and
 * leave a sequence that looks like it works.
 *
 * The neuromodulator profile is deliberately untouched: nothing in this app models what a lesion does
 * to a modulatory system, and inventing a shift would be a claim, not a simplification.
 *
 * @param {Array} steps    ScenarioResult steps
 * @param {Array<string>} lesions  lesioned region ids (app.lesions)
 * @returns {Array} the same steps, with `broken:true` and `broken_ids` on the affected ones
 */
export function llmMarkLesionedSteps(steps, lesions) {
  const list = Array.isArray(steps) ? steps : [];
  const set = new Set((Array.isArray(lesions) ? lesions : []).filter((x) => typeof x === 'string' && x));
  if (!set.size) return list;
  return list.map((s) => {
    const ids = Array.isArray(s.region_ids) ? s.region_ids.filter((id) => set.has(id)) : [];
    return ids.length ? Object.assign({}, s, { broken: true, broken_ids: ids }) : s;
  });
}

/** Which lesioned ids actually turn up in a sequence (for the "these are lesioned" line). */
export function llmLesionedInSteps(steps, lesions) {
  const out = [];
  for (const s of llmMarkLesionedSteps(steps, lesions)) {
    for (const id of (s.broken_ids || [])) if (out.indexOf(id) < 0) out.push(id);
  }
  return out;
}

/* ---------- public API ---------- */

/**
 * Classify a free-text moment with keywords only.
 * @param {string} text
 * @param {object} [opts] {lesions: string[]} — region ids lesioned in Atlas
 * @returns {object} ScenarioResult with source 'local'. Always ok:true — it has no way to fail.
 */
export function classifyLocal(text, opts = {}) {
  const raw = String(text == null ? '' : text);
  const norm = llmNorm(raw);
  const empty = norm.trim().length === 0;

  const { profile, matched } = llmProfile(norm);
  const dominant = llmDominantModulator(profile);
  const ranked = empty ? [] : llmScorePathways(norm);
  const best = ranked[0];
  const usePathway = !!best && best.score >= LLM_MIN_SCORE;

  let title, steps, pathwayId;
  if (usePathway) {
    const p = best.pathway;
    pathwayId = p.id;
    title = p.title;
    steps = p.steps.map((s) => ({
      region_ids: s.region_ids.slice(),
      approx_ms: p.timeline === 'ms' ? s.approx_ms : null,   // schematic pathways have no honest ms
      what_happens: s.what_happens,
      why_it_matters: s.why_it_matters,
    }));
  } else {
    pathwayId = null;
    title = empty ? 'Nothing to work with yet' : 'A general cortical response';
    steps = llmDefaultSteps(dominant.key);
  }

  const cueWords = [];
  if (usePathway) for (const c of best.cues) cueWords.push(c);
  for (const m of matched) for (const w of m.words) if (cueWords.indexOf(w) < 0) cueWords.push(w);

  const maxDelta = Math.max(...LLM_MODULATORS.map((k) => Math.abs(profile[k] - LLM_BASELINE[k])));
  const intensity = llmRound(llmClamp01(0.2 + maxDelta * 1.3));

  let confidence;
  if (empty) confidence = 0.1;
  else if (!usePathway) confidence = llmRound(Math.min(0.3, 0.15 + (best ? best.score : 0) * 0.05));
  else confidence = llmRound(Math.min(LLM_MAX_CONF, 0.25 + best.cues.length * 0.1 + Math.min(0.1, best.overlap * 0.02)));

  const rationale = llmRationale({ empty, usePathway, best, matched, dominant, cueWords, steps });

  const lesions = Array.isArray(opts.lesions) ? opts.lesions : [];
  const marked = llmMarkLesionedSteps(steps, lesions);

  return {
    ok: true,
    source: 'local',
    title,
    pathway_id: pathwayId,
    steps: marked,
    lesioned: llmLesionedInSteps(marked, lesions),
    neuromodulators: profile,
    intensity,
    rationale,
    confidence,
    cues: cueWords.slice(0, 12),
    dominant: dominant.key,
  };
}

function llmRationale({ empty, usePathway, best, matched, dominant, cueWords, steps }) {
  if (empty) {
    return 'There was nothing to read, so this is the default sketch: sensory cortex, thalamic relay, '
      + 'parietal orienting, prefrontal control, with every neuromodulator left at its resting value. '
      + 'Type a moment — a few sentences is plenty — and the cues in it will change both halves.';
  }
  const cueList = cueWords.slice(0, 6).map((c) => '"' + c + '"').join(', ');
  const modList = matched.map((m) => m.cue).join(', ');
  const where = usePathway
    ? 'Those words look closest to the built-in pathway "' + best.pathway.title + '", so its steps are replayed as written.'
    : 'Nothing matched a built-in pathway closely enough, so the steps are a generic '
      + steps.map((s) => llmRegionName(s.region_ids[0]).replace(/\s*\([^()]*\)\s*$/, '')).join(' → ')
      + ' sketch rather than a claim about this particular moment.';
  const mods = matched.length
    ? 'The modulator profile moved because of ' + modList + ' cues, with ' + (dominant.key || 'nothing')
      + ' shifted furthest from its resting value.'
    : 'No modulator cues fired, so the profile is left at its resting values.';
  return 'Matched on ' + (cueList || 'no specific keywords') + '. ' + where + ' ' + mods
    + ' This is keyword matching, not a model of your brain.';
}
