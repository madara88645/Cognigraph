// Which pathway steps speed up or slow down when a neuromodulator sits away from its baseline.
//
// This is a DIRECTION model, not a quantitative one. Textbooks agree on the sign of these effects
// (stress hurts recall, alerting speeds orienting); nobody has published the millisecond conversion.
// So each rule carries a strength that is deliberately small, and every rule states its own honesty
// badge and one-sentence reason, which the Pathways step card shows verbatim.
//
// Serotonin has no rule on purpose: its effect on the speed of these steps is not agreed even in sign.
// Schematic pathways (motor_skill_learning, sleep_consolidation) have no rules either — their numbers
// are an animation order, so scaling them would be scaling nothing.

/** Slider defaults in main.js — the point at which every rule's factor is exactly 1. */
export const MOD_BASELINE = {
  dopamine: 0.25,
  acetylcholine: 0.3,
  noradrenaline: 0.3,
  serotonin: 0.5,
  gaba: 0.5,
  cortisol: 0.2,
};

/** A whole step never moves more than this, however many rules stack on it. */
export const MOD_MIN_FACTOR = 0.6;
export const MOD_MAX_FACTOR = 1.6;

/** Half the 0..1 slider range: the distance from baseline that counts as "one unit" of change. */
export const MOD_SPAN = 0.5;

/** How far from baseline a level must sit before the card calls it high or low. */
const MOD_WORD_EPS = 0.08;

export const MOD_BADGE_LABEL = { ok: 'Well supported', mid: 'Simplified', low: 'Estimated' };

/**
 * {pathway_id, step_index, modulator, direction, strength, badge, why}
 * direction 'faster' = above baseline shortens the step (and below baseline lengthens it);
 * 'slower' = above baseline lengthens it. strength is the fraction of the step's time moved by
 * one full half-range of slider travel.
 */
export const MODULATION = [
  /* --- noradrenaline: phasic locus coeruleus gain, the "jolt of alertness" ------------------- */
  // The locus coeruleus step itself carries no rule: it is where the noradrenaline burst is generated,
  // not a latency the burst shortens, and its own onset is an animal-derived number (Aston-Jones &
  // Cohen, 2005). What the burst is thought to speed up is the cortical response downstream of it.
  {
    pathway_id: 'attention_shift', step_index: 2, modulator: 'noradrenaline', direction: 'faster',
    strength: 0.25, badge: 'mid',
    why: 'A phasic locus coeruleus burst raises cortical gain, so the parietal attention-capture response it drives arrives sooner.',
  },
  {
    pathway_id: 'attention_shift', step_index: 4, modulator: 'noradrenaline', direction: 'faster',
    strength: 0.15, badge: 'low',
    why: 'Being alert shortens braking reaction times, but the split between deciding and moving is estimated here.',
  },
  {
    pathway_id: 'making_decision', step_index: 3, modulator: 'noradrenaline', direction: 'faster',
    strength: 0.12, badge: 'low',
    why: 'Higher arousal raises the gain on evidence accumulation, so the decision threshold is crossed a little earlier.',
  },

  /* --- acetylcholine: sensory sharpening, signal-to-noise in cortex -------------------------- */
  {
    pathway_id: 'recognize_face', step_index: 1, modulator: 'acetylcholine', direction: 'faster',
    strength: 0.15, badge: 'mid',
    why: 'Cholinergic tone sharpens sensory tuning and improves signal-to-noise in visual cortex.',
  },
  {
    pathway_id: 'recognize_face', step_index: 2, modulator: 'acetylcholine', direction: 'faster',
    strength: 0.12, badge: 'mid',
    why: 'Attention-linked cholinergic gain speeds category-selective responses in the ventral stream.',
  },
  {
    pathway_id: 'reading_sentence', step_index: 1, modulator: 'acetylcholine', direction: 'faster',
    strength: 0.12, badge: 'mid',
    why: 'The same sharpening helps the visual word form step lock onto a familiar letter string.',
  },
  {
    pathway_id: 'reading_sentence', step_index: 0, modulator: 'acetylcholine', direction: 'faster',
    strength: 0.08, badge: 'low',
    why: 'Cholinergic effects on the earliest cortical response are small and come mostly from animal recordings.',
  },

  /* --- cortisol: acute stress and memory retrieval -------------------------------------------- */
  {
    pathway_id: 'recall_word', step_index: 1, modulator: 'cortisol', direction: 'slower',
    strength: 0.3, badge: 'ok',
    why: 'Acute cortisol reliably impairs hippocampal retrieval, which is why recall stalls under stress.',
  },
  {
    pathway_id: 'recall_word', step_index: 3, modulator: 'cortisol', direction: 'slower',
    strength: 0.22, badge: 'mid',
    why: 'Stress hits detailed recollection harder than plain familiarity, so the later parietal step drags most.',
  },
  {
    pathway_id: 'recall_word', step_index: 4, modulator: 'cortisol', direction: 'slower',
    strength: 0.15, badge: 'low',
    why: 'Tip-of-the-tongue blocks cluster at this word-form step under stress, but the delay is estimated.',
  },

  /* --- dopamine: striatal vigour and movement initiation -------------------------------------- */
  {
    pathway_id: 'making_decision', step_index: 3, modulator: 'dopamine', direction: 'faster',
    strength: 0.2, badge: 'mid',
    why: 'Striatal dopamine sets how vigorously an action is selected, so low tone slows the choice itself.',
  },
  {
    pathway_id: 'making_decision', step_index: 4, modulator: 'dopamine', direction: 'faster',
    strength: 0.15, badge: 'mid',
    why: "Low nigrostriatal dopamine delays movement initiation, the bradykinesia seen in Parkinson's disease.",
  },

  /* --- GABA: inhibitory tone slows things a little across the board --------------------------- */
  {
    pathway_id: 'fear_response', step_index: 1, modulator: 'gaba', direction: 'slower',
    strength: 0.2, badge: 'low',
    why: 'Benzodiazepines acting on amygdala GABA-A receptors blunt how big the threat response is, so treating that as a delay is an extrapolation.',
  },
  {
    pathway_id: 'making_decision', step_index: 2, modulator: 'gaba', direction: 'slower',
    strength: 0.12, badge: 'low',
    why: 'Raising inhibitory tone makes working memory and conflict monitoring sluggish, by an amount nobody has pinned down.',
  },
];

function modClamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

/** Every rule that applies to one step. */
export function modRulesFor(pathwayId, stepIndex) {
  return MODULATION.filter((r) => r.pathway_id === pathwayId && r.step_index === stepIndex);
}

/**
 * One rule's multiplier on a step's duration. 1 at baseline; below 1 means the step is faster.
 * @param {object} rule a MODULATION entry
 * @param {object} modulators {dopamine, acetylcholine, ...} 0..1
 */
export function modFactor(rule, modulators) {
  if (!rule || !modulators) return 1;
  const base = MOD_BASELINE[rule.modulator];
  const raw = modulators[rule.modulator];
  const level = typeof raw === 'number' && isFinite(raw) ? modClamp(raw, 0, 1) : base;
  if (typeof base !== 'number') return 1;
  const delta = (level - base) / MOD_SPAN;
  const sign = rule.direction === 'faster' ? -1 : 1;
  return 1 + sign * rule.strength * delta;
}

/** 'high' / 'low' / 'typical' — how the card names the slider's position. */
export function modLevelWord(modulator, modulators) {
  const base = MOD_BASELINE[modulator];
  const raw = modulators ? modulators[modulator] : undefined;
  const level = typeof raw === 'number' && isFinite(raw) ? modClamp(raw, 0, 1) : base;
  if (level > base + MOD_WORD_EPS) return 'high';
  if (level < base - MOD_WORD_EPS) return 'low';
  return 'typical';
}

/** The weakest badge among the rules in play — a card must never look better supported than its worst claim. */
export function modWorstBadge(rules) {
  const order = { ok: 0, mid: 1, low: 2 };
  let worst = 'ok';
  for (const r of rules) if (order[r.badge] > order[worst]) worst = r.badge;
  return worst;
}

/**
 * Effective duration of one step under the current sliders.
 * @returns {{ms:number, baseMs:number, factor:number, clamped:boolean, changed:boolean, active:object[]}}
 */
export function modTiming(pathwayId, stepIndex, approxMs, modulators) {
  const baseMs = typeof approxMs === 'number' && isFinite(approxMs) ? approxMs : 0;
  const rules = modRulesFor(pathwayId, stepIndex);
  const active = [];
  let raw = 1;
  for (const rule of rules) {
    const f = modFactor(rule, modulators);
    raw *= f;
    if (Math.abs(f - 1) >= 0.005) active.push({ rule, factor: f, level: modLevelWord(rule.modulator, modulators) });
  }
  const factor = modClamp(raw, MOD_MIN_FACTOR, MOD_MAX_FACTOR);
  const ms = Math.max(0, Math.round(baseMs * factor));
  return {
    ms, baseMs, factor,
    clamped: Math.abs(factor - raw) > 1e-9,
    changed: active.length > 0 && ms !== baseMs,
    active,
  };
}
