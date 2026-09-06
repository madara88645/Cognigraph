// The local heuristic must be pure, deterministic, and honest about how little it knows.
import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyLocal, llmDetectSensitive, llmDominantModulator, LLM_MODULATORS, LLM_BASELINE } from '../src/llm/classify-local.js';
import { PATHWAYS } from '../src/data/pathways.js';
import { REGIONS } from '../src/data/regions.js';

const REGION_IDS = new Set(REGIONS.map((r) => r.id));
const PATHWAY_IDS = new Set(PATHWAYS.map((p) => p.id));

/** The six presets the first CogniGraph shipped with, plus the pathway/modulator each should land on. */
const PRESETS = [
  { label: 'Academic Exam Stress', text: 'Struggling to remember answers during a high-stakes final exam under extreme time pressure.', pathway: 'recall_word', dominant: 'cortisol' },
  { label: 'Deep Focus Study Session', text: 'Engrossed in writing a complex software algorithm, completely in the zone and ignoring distractions.', pathway: 'reading_sentence', dominant: 'acetylcholine' },
  { label: 'Creative Brainstorming', text: 'Generating a flood of novel ideas for a new sci-fi story, jumping from concept to concept.', pathway: 'recall_word', dominant: 'dopamine' },
  { label: 'Public Speaking Anxiety', text: 'Stepping onto a stage in front of a thousand people, feeling a sudden surge of stage fright.', pathway: 'fear_response', dominant: 'cortisol' },
  { label: 'Competitive Gaming Focus', text: 'Playing a fast-paced multiplayer match, tracking multiple opponents and making split-second tactical decisions.', pathway: 'attention_shift', dominant: 'noradrenaline' },
  { label: 'Social Campfire', text: 'Engaging in warm, relaxed storytelling with close friends around a campfire.', pathway: 'recognize_face', dominant: 'serotonin' },
];

function assertShape(r) {
  assert.equal(r.ok, true);
  assert.equal(r.source, 'local');
  assert.equal(typeof r.title, 'string');
  assert.ok(r.title.length > 0);
  assert.ok(Array.isArray(r.steps) && r.steps.length >= 3 && r.steps.length <= 6, `steps: ${r.steps && r.steps.length}`);
  for (const s of r.steps) {
    assert.ok(Array.isArray(s.region_ids) && s.region_ids.length >= 1);
    for (const id of s.region_ids) assert.ok(REGION_IDS.has(id), `unknown region id ${id}`);
    assert.ok(s.approx_ms === null || (typeof s.approx_ms === 'number' && isFinite(s.approx_ms) && s.approx_ms >= 0));
    assert.ok(typeof s.what_happens === 'string' && s.what_happens.length > 10);
    assert.ok(typeof s.why_it_matters === 'string' && s.why_it_matters.length > 10);
  }
  for (const k of LLM_MODULATORS) {
    const v = r.neuromodulators[k];
    assert.equal(typeof v, 'number', `${k} is not a number`);
    assert.ok(v >= 0 && v <= 1, `${k} out of range: ${v}`);
  }
  assert.ok(r.intensity >= 0 && r.intensity <= 1);
  assert.ok(r.confidence >= 0 && r.confidence <= 1);
  assert.ok(typeof r.rationale === 'string' && r.rationale.length > 40);
}

test('every result has the ScenarioResult shape, whatever goes in', () => {
  for (const s of [...PRESETS.map((p) => p.text), '', '   ', 'qwx zzz frob', 'ünïcödé 漢字 ???', 'a'.repeat(5000)]) {
    assertShape(classifyLocal(s));
  }
});

test('the six original CogniGraph presets land on a sensible pathway', () => {
  for (const p of PRESETS) {
    const r = classifyLocal(p.text);
    assert.ok(PATHWAY_IDS.has(r.pathway_id), `${p.label}: no pathway matched (got ${r.pathway_id})`);
    assert.equal(r.pathway_id, p.pathway, `${p.label} mapped to ${r.pathway_id}`);
    assert.ok(r.confidence > 0.3, `${p.label}: a confident keyword match should score above the noise floor`);
  }
});

test('the six presets get the neuromodulator profile the old product described', () => {
  for (const p of PRESETS) {
    const r = classifyLocal(p.text);
    const dom = llmDominantModulator(r.neuromodulators);
    assert.equal(dom.key, p.dominant, `${p.label}: dominant was ${dom.key}, expected ${p.dominant}`);
    assert.ok(r.neuromodulators[p.dominant] > LLM_BASELINE[p.dominant],
      `${p.label}: ${p.dominant} should be above its resting value`);
  }
});

test('exam panic reads as chronic load and campfire does not raise cortisol at all', () => {
  const exam = classifyLocal(PRESETS[0].text);
  // The old backend's rule: cortisol > 0.5 is the chronic/toxic-load regime.
  assert.ok(exam.neuromodulators.cortisol > 0.5, `exam cortisol was ${exam.neuromodulators.cortisol}`);
  const fire = classifyLocal(PRESETS[5].text);
  assert.ok(fire.neuromodulators.cortisol <= LLM_BASELINE.cortisol);
  assert.ok(fire.neuromodulators.serotonin > fire.neuromodulators.cortisol);
});

test('a matched pathway replays that pathway\'s own steps, and schematic ones claim no milliseconds', () => {
  const r = classifyLocal(PRESETS[0].text);
  const p = PATHWAYS.find((x) => x.id === r.pathway_id);
  assert.deepEqual(r.steps.map((s) => s.region_ids), p.steps.map((s) => s.region_ids));
  assert.deepEqual(r.steps.map((s) => s.what_happens), p.steps.map((s) => s.what_happens));

  const slow = classifyLocal('I practiced my tennis serve over several training sessions in the gym.');
  const sp = PATHWAYS.find((x) => x.id === slow.pathway_id);
  assert.equal(sp.timeline, 'schematic', 'this description should reach a schematic pathway');
  for (const s of slow.steps) assert.equal(s.approx_ms, null, 'schematic pathways must not export millisecond values');
});

test('empty and gibberish input fall back to the default sequence with low confidence', () => {
  for (const junk of ['', '    ', '\n\t', 'qwx zzz frob', '??? !!! ...', '1234 5678']) {
    const r = classifyLocal(junk);
    assert.equal(r.pathway_id, null, `"${junk}" should match no pathway`);
    assert.ok(r.confidence <= 0.3, `"${junk}" confidence was ${r.confidence}`);
    assert.ok(r.steps.length >= 3 && r.steps.length <= 5);
    const ids = r.steps.map((s) => s.region_ids[0]);
    assert.ok(ids.includes('v1') && ids.includes('thalamus') && ids.includes('dlpfc'),
      `default sequence should be the V1 -> thalamus -> dlPFC sketch, got ${ids.join(',')}`);
  }
});

test('empty input leaves every modulator at its resting value', () => {
  const r = classifyLocal('');
  for (const k of LLM_MODULATORS) assert.equal(r.neuromodulators[k], LLM_BASELINE[k], `${k} moved with no input`);
  assert.equal(r.confidence, 0.1);
});

test('null and undefined are treated as empty rather than throwing', () => {
  for (const v of [null, undefined, 0, {}]) {
    const r = classifyLocal(v);
    assert.equal(r.ok, true);
  }
});

test('the rationale names the cues that were actually matched', () => {
  const r = classifyLocal('The deadline is tomorrow and I am panicking about the exam.');
  assert.ok(Array.isArray(r.cues) && r.cues.length > 0);
  for (const cue of r.cues.slice(0, 3)) {
    assert.ok(r.rationale.toLowerCase().includes(cue) || r.rationale.includes('Matched on'),
      `cue "${cue}" is not visible in the rationale`);
  }
  assert.ok(/keyword matching, not a model of your brain/i.test(r.rationale),
    'the rationale must always say what it is');
});

test('identical input gives byte-identical output, every time', () => {
  for (const p of PRESETS) {
    const a = classifyLocal(p.text);
    const b = classifyLocal(p.text);
    const c = classifyLocal(p.text);
    assert.deepEqual(a, b);
    assert.deepEqual(b, c);
    assert.equal(JSON.stringify(a), JSON.stringify(c));
  }
});

test('case, punctuation and surrounding whitespace do not change the answer', () => {
  const base = classifyLocal('A snake on the path startled me.');
  const loud = classifyLocal('   A SNAKE, ON THE PATH -- STARTLED ME!!!   ');
  assert.equal(loud.pathway_id, base.pathway_id);
  assert.deepEqual(loud.neuromodulators, base.neuromodulators);
});

test('llmDominantModulator measures distance from rest, not raw size', () => {
  // GABA rests at 0.50 and dopamine at 0.25: an unmoved GABA must never beat a raised dopamine.
  const profile = { ...LLM_BASELINE, dopamine: 0.45 };
  assert.equal(llmDominantModulator(profile).key, 'dopamine');
  assert.equal(llmDominantModulator({ ...LLM_BASELINE }).key, null);
  assert.equal(llmDominantModulator(null).key, null);
});

test('confidence never claims certainty, however many cues hit', () => {
  const r = classifyLocal('exam exam exam remember remember recall name classmate memory answer revise quiz');
  assert.ok(r.confidence <= 0.7, `confidence was ${r.confidence}`);
});

/* ---------- cue boundaries ---------- */

test('three-letter cues are whole words, so a neuroscience abstract is not reward-dominant', () => {
  // 'gam' used to fire on "gamma", 'fun' on "functional" and 'new' on "newborn": three hits in the
  // reward-and-novelty category, and a paper about infant EEG came back looking like a slot machine.
  const r = classifyLocal('gamma waves and functional connectivity in the newborn brain');
  const dom = llmDominantModulator(r.neuromodulators);
  assert.notEqual(dom.key, 'dopamine', `dominant was dopamine (${r.neuromodulators.dopamine})`);
  assert.equal(r.neuromodulators.dopamine, LLM_BASELINE.dopamine,
    'no reward cue is really present, so dopamine must not move at all');
  assert.ok(!r.cues.includes('gam') && !r.cues.includes('fun') && !r.cues.includes('new'),
    `stem cues leaked into the match: ${r.cues.join(', ')}`);
});

test('the whole-word rule does not cost the words those cues were meant to catch', () => {
  const game = classifyLocal('A tense ranked game, one round from winning the whole thing.');
  assert.ok(game.cues.includes('game'), `"game" should still match: ${game.cues.join(', ')}`);
  const fun = classifyLocal('It was pure fun, nothing at stake.');
  assert.ok(fun.cues.includes('fun'), `"fun" should still match: ${fun.cues.join(', ')}`);
  const novel = classifyLocal('A flood of novelty and new angles on an old problem.');
  assert.ok(novel.cues.includes('novel'), `"novel" should stem-match "novelty": ${novel.cues.join(', ')}`);
});

/* ---------- sensitive input ---------- */

test('llmDetectSensitive catches self-harm language in English and Turkish', () => {
  const crisis = [
    'I want to kill myself',
    'I have been thinking about suicide',
    'sometimes I just want to die',
    'I keep hurting myself when it gets bad',
    'self-harm is the only thing that helps',
    'intihar etmeyi düşünüyorum',
    'kendimi öldürmek istiyorum',
    'ölmek istiyorum artık',
    'kendime zarar veriyorum',
    'KENDIMI OLDURMEK ISTIYORUM',
  ];
  for (const t of crisis) {
    const r = llmDetectSensitive(t);
    assert.equal(r.crisis, true, `missed: ${t}`);
    assert.ok(r.cues.length > 0, 'a detection must name the cue that fired');
  }
});

test('llmDetectSensitive catches diagnosis and prescription requests, English and Turkish', () => {
  const medical = [
    'diagnose my depression',
    'do I have ADHD',
    'am I autistic',
    'am I depressed or just tired',
    'what medication for this',
    'can you prescribe something',
    'bende depresyon var mi',
    'teşhis koyar mısın',
    'hangi ilacı kullanmalıyım',
  ];
  for (const t of medical) {
    const r = llmDetectSensitive(t);
    assert.equal(r.medical, true, `missed: ${t}`);
  }
});

test('llmDetectSensitive leaves ordinary scenarios alone', () => {
  const fine = [
    ...PRESETS.map((p) => p.text),
    'I walked into the exam hall and my mind went blank.',
    'Do I have time to revise before the exam starts?',
    'The fear response when a snake crosses the path.',
    'Sabah koşusundan sonra kahve içiyorum.',
    'A tennis serve I have practised a thousand times.',
    'gamma waves and functional connectivity in the newborn brain',
    '', '   ', null, undefined,
  ];
  for (const t of fine) {
    const r = llmDetectSensitive(t);
    assert.equal(r.crisis, false, `false crisis on: ${t}`);
    assert.equal(r.medical, false, `false medical on: ${t}`);
    assert.deepEqual(r.cues, [], `false cue on: ${t}`);
  }
});

test('llmDetectSensitive is a pure function of the text, never throwing', () => {
  for (const v of [null, undefined, 0, {}, [], 'a'.repeat(5000)]) {
    const r = llmDetectSensitive(v);
    assert.equal(typeof r.crisis, 'boolean');
    assert.equal(typeof r.medical, 'boolean');
    assert.ok(Array.isArray(r.cues));
  }
  assert.deepEqual(llmDetectSensitive('I want to die'), llmDetectSensitive('I want to die'));
});
