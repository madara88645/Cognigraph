// "How this simulation works" drawer content (Worker B): timing model, neuron equations,
// metaphor-vs-physiology, and the A-Z glossary. Registered by both PathwaysMode and NeuronsMode.
//
// NOTE: html is exposed through getters. In the built single file every module shares one scope and
// this file is concatenated before data/neuro.js, so building the strings eagerly at top level would
// touch NEUROMOD_DEFS before it is initialised. Getters make that lazy and keep {id,label,html} shape.
import { NEUROMOD_DEFS, NEURON_PRESETS, ACCURACY_PITFALLS, NEURON_MODEL } from './neuro.js';
import { GLOSSARY } from './glossary.js';
import { registerDrawerTab } from '../ui/panels.js';

function howEsc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Honesty rating for one neuromodulator mapping, derived from the (long) confidence prose in
 * NEUROMOD_DEFS. ok = mechanism is well-supported, mid = simplified but directional, low = metaphor.
 */
export function neuroConfidenceBadge(confidence) {
  const t = String(confidence || '').toLowerCase();
  if (t.startsWith('low') || t.includes('pedagogical metaphor')) {
    return { cls: 'low', label: 'Illustrative metaphor' };
  }
  if (t.includes('weaker mapping') || t.includes('must be labeled a metaphor')) {
    return { cls: 'mid', label: 'Simplified, direction only' };
  }
  if (t.includes('well-supported / direct') || t.includes('direct mechanism')) {
    return { cls: 'ok', label: 'Direct mechanism' };
  }
  if (t.startsWith('well-supported')) return { cls: 'ok', label: 'Well-supported mechanism' };
  return { cls: 'mid', label: 'Simplified but directional' };
}

/**
 * Short two-part copy for each slider, condensed from NEUROMOD_DEFS. `modulator` keys back into
 * NEUROMOD_DEFS for the full explanation and the confidence rating.
 */
export const NEUROMOD_UI = [
  {
    key: 'da', modulator: 'Dopamine (DA)', name: 'Dopamine', param: 'da',
    short: 'Steady extra current into one labelled group of 30, plus stronger excitation inside it.',
    real: 'Dopamine from the VTA and substantia nigra changes how excitable and how responsive target neurons are, with an inverted-U dose response — more is not simply better.',
    sim: 'adds a small steady depolarising current to one labelled group of 30 excitatory neurons, and boosts excitatory connections inside that group by up to 1.3x. No reward, no prediction error, no learning rule of any kind.',
  },
  {
    key: 'ach', modulator: 'Acetylcholine (ACh)', name: 'Acetylcholine', param: 'achD + achEE',
    short: 'Less spike-frequency adaptation, weaker recurrent excitatory-to-excitatory synapses.',
    real: 'Acetylcholine from the basal forebrain suppresses slow adaptation potassium currents, so neurons keep firing under sustained input, and it damps recurrent cortical synapses more than incoming sensory ones (Hasselmo).',
    sim: 'lowers the after-spike jump d by up to half (less adaptation) and scales recurrent excitatory-to-excitatory weights down to 60% while leaving the background drive alone.',
  },
  {
    key: 'gainNE', modulator: 'Noradrenaline / Norepinephrine (NE)', name: 'Noradrenaline', param: 'gainNE',
    short: 'Gain on each neuron\u2019s net current up, background-noise amplitude down.',
    real: 'Locus coeruleus noradrenaline is classically modelled as raising neural gain: it steepens the input-output curve so strong inputs are amplified more than weak ones, raising signal-to-noise (Servan-Schreiber, Printz & Cohen, 1990).',
    sim: 'multiplies each neuron’s net current by 0.75-1.25x and moves the background-noise amplitude the other way. It is a gain knob, not an arousal or explore/exploit state.',
  },
  {
    key: 'sero', modulator: 'Serotonin (5-HT)', name: 'Serotonin', param: 'sero',
    short: 'Tilts excitatory-onto-inhibitory against inhibitory-onto-excitatory weights.',
    real: 'Serotonin fine-tunes the excitation/inhibition balance of cortical circuits through several receptor subtypes whose net direction depends on context — 5-HT1A tends to hyperpolarise, 5-HT2A can excite some interneurons.',
    sim: 'nudges excitatory-onto-inhibitory and inhibitory-onto-excitatory weights in opposite directions around baseline. Mood, wellbeing and SSRI pharmacology are not modelled here at all.',
  },
  {
    key: 'gaba', modulator: 'GABA tone (overall inhibitory strength)', name: 'GABA tone', param: 'gaba',
    short: 'Multiplies every inhibitory synaptic weight \u2014 the most literal knob here.',
    real: 'GABA-A receptor inhibition is what interneurons (roughly 20-30% of cortical neurons) actually do to their targets; changing its strength moves a network between irregular firing, suppression and oscillation.',
    sim: 'multiplies every inhibitory synaptic weight by the slider value. This is the most literal knob in the set — the simulated parameter is the same quantity the biology names.',
  },
  {
    key: 'cortisol', modulator: 'Cortisol / acute stress', name: 'Cortisol / stress', param: 'cortisol',
    short: 'More background noise; two labelled groups pushed in opposite directions.',
    real: 'Glucocorticoid effects are biphasic (fast non-genomic, then slow genomic) and region-specific: basolateral amygdala neurons can become more excitable while hippocampal circuits respond differently and over different timescales.',
    sim: 'raises background noise and pushes two labelled subgroups in opposite directions. It is a gesture at "stress reweights circuits differently", not a stress model — treat it as the least literal slider here.',
  },
];

/* ---------- tab bodies ---------- */

function howTiming() {
  return `
    <h3>What the millisecond numbers mean</h3>
    <p>Every Pathways step carries an <strong>approximate latency</strong>: how long after the triggering
    event (a face appearing, a word being read) that stage is typically engaged. They are
    <strong>group averages</strong> pulled from specific laboratory paradigms — averaged over dozens of
    trials and dozens of people, in simplified tasks — not constants that a brain obeys.</p>
    <p>The same event in the same person varies by tens of milliseconds from trial to trial. A number like
    "~170 ms" for the <span class="term" data-term="N170">N170</span> marks the centre of a window, not a
    checkpoint, and it indexes detecting face-like structure rather than knowing <em>who</em> the face is.</p>

    <h3>Where each number comes from</h3>
    <p>Each step names its own evidence in the "How we know" line: an ERP component, an intracranial
    recording, a single-unit study in monkeys, or an explicit statement that the timing is
    <em>estimated</em> rather than measured. Steps whose latency is inferred say so. Read that line before
    trusting the number.</p>

    <h3>Schematic pathways</h3>
    <p>Two journeys — <em>Learning a New Motor Skill</em> and <em>Sleep and Memory Consolidation</em> —
    unfold over minutes, nights and weeks. Their step values are a <strong>schematic order</strong> for the
    animation only. The timeline shows "schematic" instead of a number, and the readout never claims
    milliseconds for them.</p>

    <h3>How the animation maps time</h3>
    <p>Playback is <strong>not</strong> real time. Each step is held on screen for a duration derived from
    the gap to the next step, clamped between 0.9 and 2.5 seconds so that a 40 ms hop is still watchable
    and a 300 ms one does not stall; schematic steps use a flat 1.8 seconds. So roughly a hundred
    milliseconds of brain time is stretched across a second or two of screen time, and the ratio is not
    constant between steps. The bar positions are honest about the real spacing even when the dwell time
    is not: markers sit at their true latency along the track (evenly spaced for schematic pathways).</p>

    <h3>What the animation is not</h3>
    <p>Regions do not switch on and off. A step lighting up means "this hub is strongly engaged around
    now"; earlier steps stay dimly lit because they are still active. Nothing here shows one signal
    physically travelling along one wire — the travelling dot is a visual link between two hubs, not a
    modelled action potential.</p>`;
}

function howEquations() {
  const eq = 'dv/dt = 0.04 v² + 5 v + 140 − u + I\ndu/dt = a (b v − u)\nif v ≥ 30 mV:   v ← c,   u ← u + d';
  const presets = Object.keys(NEURON_PRESETS).map((k) => {
    const p = NEURON_PRESETS[k];
    return `<li><strong>${howEsc(k)}</strong> — ${howEsc(p.name)}: a=${p.a}, b=${p.b}, c=${p.c}, d=${p.d}. <span class="muted">${howEsc(p.note)}</span></li>`;
  }).join('');
  return `
    <h3>The model</h3>
    <p>The Neurons mode runs 150 point neurons on the <strong>Izhikevich (2003)</strong> two-variable
    model. Two equations per neuron, and one reset rule:</p>
    <div class="eq">${howEsc(eq)}</div>

    <h3>Every term in plain English</h3>
    <ul>
      <li><strong>v</strong> — membrane potential in millivolts: the neuron's voltage state. When it
      crosses +30 mV that counts as a <span class="term" data-term="Action potential">spike</span>, an
      all-or-none event rather than a graded signal.</li>
      <li><strong>u</strong> — the recovery variable: an abstract slow negative feedback standing in for
      sodium-channel inactivation plus slow potassium activation combined. It is <em>not</em> "the
      potassium current". As u grows it drags v down and makes the next spike harder — the closest plain
      word is tiredness.</li>
      <li><strong>I</strong> — everything driving the neuron: the background current (think of an
      experimenter's electrode), the synaptic current arriving from the other simulated neurons, and a
      Gaussian noise term standing in for the thousands of real inputs we do not simulate one by one.</li>
      <li><strong>0.04 v² + 5 v + 140</strong> — an empirically fitted quadratic, not derived from any ion
      channel. It exists because it makes the spike upstroke look right near threshold, and it is exactly
      the term that makes the equations awkward to integrate.</li>
      <li><strong>a</strong> — how fast u chases v. Small a means slow recovery (bursting, adaptation);
      larger a means fast-spiking with little adaptation.</li>
      <li><strong>b</strong> — how strongly sub-threshold voltage wobbles recruit u; larger b gives
      low-threshold, resonant behaviour.</li>
      <li><strong>c</strong> — the voltage v snaps back to after a spike (the afterhyperpolarisation).</li>
      <li><strong>d</strong> — how big a jump u takes after each spike. Larger d means each spike makes the
      next one harder: more spike-frequency adaptation.</li>
    </ul>

    <h3>Named cell types are just four numbers</h3>
    <p>The whole "zoo" of cortical firing personalities comes from one recipe with different (a, b, c, d):</p>
    <ul>${presets}</ul>

    <h3>How it is integrated</h3>
    <p>Each 1 ms tick is split into <strong>two 0.5 ms half-steps</strong> for v, with u updated once per
    full tick — Izhikevich's own recommendation for taming the v² term, which will happily diverge under a
    naive 1 ms Euler step. The <strong>threshold is tested after every sub-step</strong>, not once per
    frame, so spike times are not biased late. v is floored at −100 mV, and every value is checked with
    <code>isFinite</code>; if any neuron still goes non-finite it is quietly reset to rest rather than
    letting NaN spread into the plots. Synaptic currents decay exponentially (5 ms for excitatory, 10 ms
    for inhibitory) and always arrive one tick after the spike that caused them — zero delay in a
    recurrent network produces lockstep synchrony that is a numerical artefact, not biology.</p>

    <h3>Fitted, not biophysical</h3>
    <p>This matters more than any of the above: the Izhikevich model is
    <strong>phenomenological</strong>. Unlike Hodgkin-Huxley it is not built from measured ion-channel
    conductances; v and u are abstractions tuned to reproduce the right spike patterns cheaply. It buys
    150 live neurons at 60 fps in a browser, and the price is that no variable in it maps one-to-one onto
    a real current.</p>
    <p class="muted">${howEsc(String(NEURON_MODEL.default_params.description).split('Population:')[0].trim())}</p>`;
}

function howMetaphor() {
  const sliders = NEUROMOD_UI.map((m) => {
    const def = NEUROMOD_DEFS.find((d) => d.modulator === m.modulator) || {};
    const badge = neuroConfidenceBadge(def.confidence);
    return `<div class="how-mod">
      <div class="how-mod-head"><strong>${howEsc(m.name)}</strong><span class="badge ${badge.cls}">${howEsc(badge.label)}</span></div>
      <p><span class="muted">In real circuits:</span> ${howEsc(m.real)}</p>
      <p><span class="muted">In this simulation:</span> the slider ${howEsc(m.sim)}</p>
      <p class="muted">${howEsc(def.confidence || '')}</p>
    </div>`;
  }).join('');
  const pitfalls = ACCURACY_PITFALLS.map((p) => `<li>${howEsc(p)}</li>`).join('');
  return `
    <h3>The six sliders, rated honestly</h3>
    <p>Not every knob is equally well grounded. GABA tone changes the same quantity biology names;
    the stress slider is a gesture. The badges say which is which, and they are not decoration.</p>
    ${sliders}

    <h3>What this simulation is not</h3>
    <p>The 150 neurons are a generic toy population. They are not wired like any named circuit, so nothing
    in the raster is an amygdala, a memory, a decision or a feeling. Activity there illustrates a
    mechanism; it never <em>is</em> the thing the mechanism is named after. The brain in the other two
    modes is a schematic solid, not an anatomical scan, and the coloured hubs are simplified
    representatives of distributed networks.</p>

    <h3>Common misconceptions this project tries not to repeat</h3>
    <ul class="how-pitfalls">${pitfalls}</ul>`;
}

function howGlossary() {
  const sorted = GLOSSARY.slice().sort((a, b) => a.term.localeCompare(b.term, 'en'));
  const items = sorted.map((g) => `<div class="gl-entry"><dt>${howEsc(g.term)}</dt><dd>${howEsc(g.plain_definition)}</dd></div>`).join('');
  return `
    <h3>Glossary (${sorted.length} terms)</h3>
    <p class="muted">Every one of these is clickable wherever it appears in the app — the dotted underline
    opens a definition without losing your place.</p>
    <dl class="gl-list" data-nolink>${items}</dl>`;
}

function howScenario() {
  return `
    <h3>Two engines, one button</h3>
    <ul>
      <li><strong>Keyword heuristic</strong> (no key, no network): string matching against the eight
      Pathways and a small emotion/arousal lexicon. English only. The rationale lists the words it matched.</li>
      <li><strong>Language model</strong> (your OpenRouter key): one request with the 28 region ids,
      strict JSON, 3–6 ordered steps, six 0–1 modulator values, a hedged rationale and a confidence.</li>
    </ul>
    <h3>What is checked</h3>
    <ul>
      <li>Structure: unknown region ids dropped, numbers clamped, text truncated, broken JSON recovered or rejected.</li>
      <li>Wording: diagnostic or advice-like phrasing gets an extra warning.</li>
      <li>Not checked: whether the content is true. Every result is labelled <em>not evidence</em>.</li>
    </ul>
    <h3>What never runs</h3>
    <p>Text about self-harm, suicide, or a request to diagnose or medicate (English or Turkish) stops the
    mode with a short card. Nothing is sent, the key is not even read.</p>
    <h3>What gets sent</h3>
    <p>One POST to openrouter.ai: the system prompt, your sentence, the model id. Nothing else, ever.
    If the request is blocked (sandbox, no network) the status line says so and the heuristic runs.</p>`;
}

/** The five drawer tabs owned by Worker B. `html` is built on access (see the note at the top). */
export const HOW_TABS = [
  { id: 'timing', label: 'Timing model', get html() { return howTiming(); } },
  { id: 'equations', label: 'Neuron equations', get html() { return howEquations(); } },
  { id: 'metaphor', label: 'Metaphor vs physiology', get html() { return howMetaphor(); } },
  { id: 'scenario', label: 'Scenario & LLM', get html() { return howScenario(); } },
  { id: 'glossary', label: 'Glossary', get html() { return howGlossary(); } },
];

/** Idempotent: registerDrawerTab replaces a tab with the same id. Called from both modes' enter(). */
export function registerHowTabs() {
  if (typeof registerDrawerTab !== 'function') return;
  for (const t of HOW_TABS) registerDrawerTab(t.id, t.label, t.html);
}
