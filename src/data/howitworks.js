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
    return { cls: 'low', label: 'Metaphor' };
  }
  if (t.includes('weaker mapping') || t.includes('must be labeled a metaphor')) {
    return { cls: 'mid', label: 'Simplified' };
  }
  if (t.includes('well-supported / direct') || t.includes('direct mechanism')) {
    return { cls: 'ok', label: 'Direct mechanism' };
  }
  if (t.startsWith('well-supported')) return { cls: 'ok', label: 'Well supported' };
  return { cls: 'mid', label: 'Simplified' };
}

/**
 * Short two-part copy for each slider, condensed from NEUROMOD_DEFS. `modulator` keys back into
 * NEUROMOD_DEFS for the full explanation and the confidence rating.
 */
export const NEUROMOD_UI = [
  {
    key: 'da', modulator: 'Dopamine (DA)', name: 'Dopamine', param: 'da',
    caution: 'Direction is well supported, but there is no reward or learning loop here.',
    short: 'Steady extra current into one labelled group of 30, plus stronger excitation inside it.',
    real: 'Dopamine from the VTA and substantia nigra changes how excitable and how responsive target neurons are, with an inverted-U dose response — more is not simply better.',
    sim: 'adds a small steady depolarising current to one labelled group of 30 excitatory neurons, and boosts excitatory connections inside that group by up to 1.3x. No reward, no prediction error, no learning rule of any kind.',
  },
  {
    key: 'ach', modulator: 'Acetylcholine (ACh)', name: 'Acetylcholine', param: 'achD + achEE',
    caution: 'One of the more faithful sliders: both effects are documented mechanisms.',
    short: 'Less spike-frequency adaptation, weaker recurrent excitatory-to-excitatory synapses.',
    real: 'Acetylcholine from the basal forebrain suppresses slow adaptation potassium currents, so neurons keep firing under sustained input, and it damps recurrent cortical synapses more than incoming sensory ones (Hasselmo).',
    sim: 'lowers the after-spike jump d by up to half (less adaptation) and scales recurrent excitatory-to-excitatory weights down to 60% while leaving the background drive alone.',
  },
  {
    key: 'gainNE', modulator: 'Noradrenaline / Norepinephrine (NE)', name: 'Noradrenaline', param: 'gainNE',
    caution: 'The gain effect is well grounded; arousal and explore/exploit are not modelled.',
    short: 'Gain on each neuron\u2019s net current up, background-noise amplitude down.',
    real: 'Locus coeruleus noradrenaline is classically modelled as raising neural gain: it steepens the input-output curve so strong inputs are amplified more than weak ones, raising signal-to-noise (Servan-Schreiber, Printz & Cohen, 1990).',
    sim: 'multiplies each neuron’s net current by 0.75-1.25x and moves the background-noise amplitude the other way. It is a gain knob, not an arousal or explore/exploit state.',
  },
  {
    key: 'sero', modulator: 'Serotonin (5-HT)', name: 'Serotonin', param: 'sero',
    caution: 'E/I tuning is supported; mood, depression and SSRIs are not modelled at all.',
    short: 'Tilts excitatory-onto-inhibitory against inhibitory-onto-excitatory weights.',
    real: 'Serotonin fine-tunes the excitation/inhibition balance of cortical circuits through several receptor subtypes whose net direction depends on context — 5-HT1A tends to hyperpolarise, 5-HT2A can excite some interneurons.',
    sim: 'nudges excitatory-onto-inhibitory and inhibitory-onto-excitatory weights in opposite directions around baseline. Mood, wellbeing and SSRI pharmacology are not modelled here at all.',
  },
  {
    key: 'gaba', modulator: 'GABA tone (overall inhibitory strength)', name: 'GABA tone', param: 'gaba',
    caution: 'The most literal slider here: it moves the quantity biology names.',
    short: 'Multiplies every inhibitory synaptic weight \u2014 the most literal knob here.',
    real: 'GABA-A receptor inhibition is what interneurons (roughly 20-30% of cortical neurons) actually do to their targets; changing its strength moves a network between irregular firing, suppression and oscillation.',
    sim: 'multiplies every inhibitory synaptic weight by the slider value. This is the most literal knob in the set — the simulated parameter is the same quantity the biology names.',
  },
  {
    key: 'cortisol', modulator: 'Cortisol / acute stress', name: 'Cortisol / stress', param: 'cortisol',
    caution: 'The weakest mapping in the set — illustrative only, not a stress model.',
    short: 'More background noise; two labelled groups pushed in opposite directions.',
    real: 'Glucocorticoid effects are biphasic (fast non-genomic, then slow genomic) and region-specific: basolateral amygdala neurons can become more excitable while hippocampal circuits respond differently and over different timescales.',
    sim: 'raises background noise and pushes two labelled subgroups in opposite directions. It is a gesture at "stress reweights circuits differently", not a stress model — treat it as the least literal slider here.',
  },
];

/* ---------- tab bodies ---------- */

function howTiming() {
  return `
    <p>Every Pathways step carries an <strong>approximate latency</strong>: how long after the trigger
    that stage is typically engaged.</p>
    <ul>
      <li>They are <strong>group averages</strong> from specific lab paradigms, not constants a brain obeys.</li>
      <li>The same person varies by tens of milliseconds from trial to trial.</li>
      <li>Each step's <em>How we know</em> line names its evidence, or says the timing is estimated.</li>
      <li>Two journeys (motor learning, sleep) run over minutes to nights and are marked <strong>schematic</strong>.</li>
      <li>Playback is not real time: each step is held 0.9-2.5 s on screen, schematic steps a flat 1.8 s.</li>
      <li>Markers still sit at their true latency along the track, even when the dwell time does not match.</li>
      <li>Regions do not switch on and off, and the travelling dot links two hubs — it is not a spike.</li>
    </ul>`;
}

function howEquations() {
  const eq = 'dv/dt = 0.04 v² + 5 v + 140 − u + I\ndu/dt = a (b v − u)\nif v ≥ 30 mV:   v ← c,   u ← u + d';
  const presets = Object.keys(NEURON_PRESETS).map((k) => {
    const p = NEURON_PRESETS[k];
    return `<li><strong>${howEsc(k)}</strong> — ${howEsc(p.name)}: a=${p.a}, b=${p.b}, c=${p.c}, d=${p.d}. <span class="muted">${howEsc(p.note)}</span></li>`;
  }).join('');
  return `
    <p>Neurons mode runs 150 point neurons on the <strong>Izhikevich (2003)</strong> model: two equations
    per neuron, plus one reset rule.</p>
    <div class="eq">${howEsc(eq)}</div>
    <ul>
      <li><strong>v</strong> — membrane voltage in mV. Crossing +30 mV counts as a <span class="term" data-term="Action potential">spike</span>.</li>
      <li><strong>u</strong> — a slow negative feedback term. Plainest word for it: tiredness.</li>
      <li><strong>I</strong> — everything driving the cell: background current, synapses, noise.</li>
      <li><strong>0.04 v² + 5 v + 140</strong> — a curve fit, not an ion channel.</li>
      <li><strong>a</strong> — how fast u chases v. Small = bursting, large = fast spiking.</li>
      <li><strong>b</strong> — how strongly sub-threshold wobbles recruit u.</li>
      <li><strong>c</strong> — the voltage v snaps back to after a spike.</li>
      <li><strong>d</strong> — how big a jump u takes per spike, so how much it adapts.</li>
    </ul>
    <div class="note">This model is <strong>phenomenological</strong>: unlike Hodgkin-Huxley it is fitted to
    reproduce spike patterns cheaply, so no variable in it maps onto a measured ion current.</div>
    <details class="how-fold">
      <summary>Named cell types are just four numbers</summary>
      <ul>${presets}</ul>
    </details>
    <details class="how-fold">
      <summary>How it is integrated</summary>
      <p>Each 1 ms tick is split into two 0.5 ms half-steps for v, with u updated once per tick —
      Izhikevich's own trick for taming the v² term. The threshold is tested after every sub-step, v is
      floored at −100 mV, and any non-finite value is reset to rest rather than spreading NaN.</p>
      <p>Synaptic currents decay exponentially (5 ms excitatory, 10 ms inhibitory) and always arrive one
      tick late: zero delay in a recurrent network produces lockstep synchrony that is a numerical
      artefact, not biology.</p>
      <p class="muted">${howEsc(String(NEURON_MODEL.default_params.description).split('Population:')[0].trim())}</p>
    </details>`;
}

function howMetaphor() {
  const sliders = NEUROMOD_UI.map((m) => {
    const def = NEUROMOD_DEFS.find((d) => d.modulator === m.modulator) || {};
    const badge = neuroConfidenceBadge(def.confidence);
    return `<div class="how-mod">
      <div class="how-mod-head"><strong>${howEsc(m.name)}</strong><span class="badge ${badge.cls}">${howEsc(badge.label)}</span></div>
      <p>${howEsc(m.caution)}</p>
      <details class="how-fold">
        <summary>Real circuits vs this simulation</summary>
        <p><span class="muted">In real circuits:</span> ${howEsc(m.real)}</p>
        <p><span class="muted">Here:</span> the slider ${howEsc(m.sim)}</p>
        <p class="muted">${howEsc(def.confidence || '')}</p>
      </details>
    </div>`;
  }).join('');
  const pitfalls = ACCURACY_PITFALLS.map((p) => `<li>${howEsc(p)}</li>`).join('');
  return `
    <p>Not every knob is equally well grounded. The badges say which is which, and they are not decoration.</p>
    ${sliders}
    <h3>What this is not</h3>
    <ul>
      <li>The 150 neurons are a generic toy population, not any named circuit.</li>
      <li>Nothing in the raster is an amygdala, a memory, a decision or a feeling.</li>
      <li>The 3D brain is a schematic solid, not an anatomical scan.</li>
    </ul>
    <details class="how-fold">
      <summary>Misconceptions this project tries not to repeat (${ACCURACY_PITFALLS.length})</summary>
      <ul class="how-pitfalls">${pitfalls}</ul>
    </details>`;
}

function howGlossary() {
  const sorted = GLOSSARY.slice().sort((a, b) => a.term.localeCompare(b.term, 'en'));
  const items = sorted.map((g) => `<div class="gl-entry"><dt>${howEsc(g.term)}</dt><dd>${howEsc(g.plain_definition)}</dd></div>`).join('');
  return `
    <h3>Glossary (${sorted.length} terms)</h3>
    <p class="muted">Every term here is clickable wherever it appears in the app.</p>
    <dl class="gl-list" data-nolink>${items}</dl>`;
}

function howScenario() {
  return `
    <ul>
      <li><strong>No key:</strong> a keyword heuristic matches your words against the eight Pathways and a
      small emotion lexicon. English only; the rationale lists the words it matched.</li>
      <li><strong>With your OpenRouter key:</strong> one request, strict JSON, 3-6 ordered steps, six 0-1
      values, a hedged rationale and a confidence.</li>
      <li><strong>Checked:</strong> unknown region ids dropped, numbers clamped, text truncated, broken
      JSON recovered or rejected. Diagnostic-sounding wording gets an extra warning.</li>
      <li><strong>Not checked:</strong> whether any of it is true. Every result is labelled <em>not evidence</em>.</li>
      <li><strong>Never runs:</strong> text about self-harm or a request to diagnose stops the mode before
      the key is even read.</li>
      <li><strong>What is sent:</strong> one POST to openrouter.ai with the system prompt, your sentence and
      the model id. Nothing else, ever.</li>
    </ul>`;
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
