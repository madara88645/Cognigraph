// The OpenRouter client is the app's only network call. These tests pin the request shape, prove the
// hardening layer treats model output as hostile, and prove every failure path is a value, not a throw.
// No real key and no real request: fetch is always a local mock.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyWithOpenRouter, validateScenarioResult, llmSystemPrompt, llmRegionCatalogue, llmMaskKey,
  llmScreenText,
  LLM_ENDPOINT, LLM_MODELS, LLM_DEFAULT_MODEL, LLM_KEY_STORAGE, LLM_MODEL_STORAGE,
} from '../src/llm/openrouter.js';
import { LLM_MODULATORS, LLM_BASELINE } from '../src/llm/classify-local.js';
import { REGIONS } from '../src/data/regions.js';

const KEY = 'sk-or-v1-TESTKEY-not-a-real-key';

/** A fetch stand-in that records its calls and returns whatever the test hands it. */
function mockFetch(reply) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init, body: init && init.body ? JSON.parse(init.body) : null });
    if (typeof reply === 'function') return reply(url, init);
    return reply;
  };
  fn.calls = calls;
  return fn;
}

function okReply(content) {
  return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content } }] }) };
}

function httpReply(status) {
  return { ok: false, status, json: async () => ({ error: { message: 'nope' } }) };
}

const GOOD = {
  title: 'Spotting a friend',
  steps: [
    { region_ids: ['v1'], approx_ms: 55, what_happens: 'Edges arrive.', why_it_matters: 'Vision starts here.' },
    { region_ids: ['ffa'], approx_ms: 170, what_happens: 'Face structure.', why_it_matters: 'Face specialisation.' },
    { region_ids: ['hippocampus', 'amygdala'], approx_ms: 300, what_happens: 'Identity match.', why_it_matters: 'Who, not what.' },
  ],
  neuromodulators: { dopamine: 0.4, acetylcholine: 0.5, noradrenaline: 0.3, serotonin: 0.6, gaba: 0.5, cortisol: 0.1 },
  intensity: 0.55,
  rationale: 'Likely a ventral-stream face sequence. Timings are typical group averages.',
  confidence: 0.6,
};

/* ---------- request shape ---------- */

test('posts exactly one JSON-mode request to the OpenRouter completions endpoint', async () => {
  const f = mockFetch(okReply(JSON.stringify(GOOD)));
  await classifyWithOpenRouter('a friend in a crowd', { key: KEY, model: 'openai/gpt-4o-mini', fetchImpl: f });

  assert.equal(f.calls.length, 1, 'exactly one request per run');
  const { url, init, body } = f.calls[0];
  assert.equal(url, LLM_ENDPOINT);
  assert.equal(url, 'https://openrouter.ai/api/v1/chat/completions');
  assert.equal(init.method, 'POST');
  assert.equal(init.headers.Authorization, 'Bearer ' + KEY);
  assert.equal(init.headers['X-Title'], 'CogniGraph');
  assert.equal(init.headers['Content-Type'], 'application/json');

  assert.equal(body.model, 'openai/gpt-4o-mini');
  assert.deepEqual(body.response_format, { type: 'json_object' });
  assert.equal(body.temperature, 0.3);
  assert.ok(body.max_tokens >= 1200 && body.max_tokens <= 2000, `max_tokens ${body.max_tokens}`);
  assert.equal(body.messages.length, 2);
  assert.equal(body.messages[0].role, 'system');
  assert.equal(body.messages[1].role, 'user');
  assert.equal(body.messages[1].content, 'a friend in a crowd');
});

test('there is no HTTP-Referer header when there is no page origin (node, file://)', async () => {
  const f = mockFetch(okReply(JSON.stringify(GOOD)));
  await classifyWithOpenRouter('x', { key: KEY, fetchImpl: f });
  assert.equal(f.calls[0].init.headers['HTTP-Referer'], undefined);
});

test('the model defaults to the cheap one and long input is truncated before sending', async () => {
  const f = mockFetch(okReply(JSON.stringify(GOOD)));
  await classifyWithOpenRouter('y'.repeat(9000), { key: KEY, fetchImpl: f });
  assert.equal(f.calls[0].body.model, LLM_DEFAULT_MODEL);
  assert.equal(LLM_DEFAULT_MODEL, 'openai/gpt-4o-mini');
  assert.ok(f.calls[0].body.messages[1].content.length <= 1200);
});

test('the settings menu offers four models including Haiku 4.5 and Gemini 2.5 Flash', () => {
  assert.equal(LLM_MODELS.length, 4);
  const ids = LLM_MODELS.map((m) => m.id);
  assert.ok(ids.includes('openai/gpt-4o-mini'));
  assert.ok(ids.includes('anthropic/claude-haiku-4.5'));
  assert.ok(ids.includes('google/gemini-2.5-flash'));
  for (const m of LLM_MODELS) assert.ok(m.label && m.label.length > 4, `${m.id} has no label`);
});

test('the key and model live under the documented localStorage names and are never logged whole', () => {
  assert.equal(LLM_KEY_STORAGE, 'cg.openrouter.key');
  assert.equal(LLM_MODEL_STORAGE, 'cg.openrouter.model');
  const masked = llmMaskKey(KEY);
  assert.ok(!masked.includes('TESTKEY'), `mask leaked the key: ${masked}`);
  assert.ok(masked.startsWith('sk-or-v1'));
  assert.equal(llmMaskKey(''), '');
  assert.equal(llmMaskKey(null), '');
});

/* ---------- system prompt ---------- */

test('the system prompt lists every region id and keeps the cortisol regime rule', () => {
  const p = llmSystemPrompt();
  for (const r of REGIONS) assert.ok(p.includes('\n  ' + r.id + ' — '), `prompt is missing region ${r.id}`);
  assert.equal(llmRegionCatalogue().split('\n').length, REGIONS.length);
  assert.ok(/0\.5 or below means acute/i.test(p), 'the acute-vs-chronic cortisol rule must survive');
  assert.ok(/above 0\.5 means chronic/i.test(p));
  assert.ok(/educational visualisation, not medical software/i.test(p));
  assert.ok(/[Nn]ever diagnose/.test(p));
  assert.ok(p.includes('3 to 6'), 'the step-count rule must be explicit');
  for (const k of LLM_MODULATORS) assert.ok(p.includes(k), `prompt does not mention ${k}`);
});

/* ---------- parsing and hardening ---------- */

test('happy path: a clean JSON reply becomes a ScenarioResult tagged llm', async () => {
  const f = mockFetch(okReply(JSON.stringify(GOOD)));
  const r = await classifyWithOpenRouter('a friend', { key: KEY, model: 'anthropic/claude-haiku-4.5', fetchImpl: f });
  assert.equal(r.ok, true);
  assert.equal(r.source, 'llm');
  assert.equal(r.model, 'anthropic/claude-haiku-4.5');
  assert.equal(r.title, 'Spotting a friend');
  assert.equal(r.steps.length, 3);
  assert.equal(r.steps[0].approx_ms, 55);
  assert.deepEqual(r.steps[2].region_ids, ['hippocampus', 'amygdala']);
  assert.equal(r.rationale, GOOD.rationale);
  assert.equal(r.confidence, 0.6);
});

test('JSON wrapped in code fences, or buried in chatter, is still recovered', () => {
  const fenced = '```json\n' + JSON.stringify(GOOD) + '\n```';
  assert.equal(validateScenarioResult(fenced).ok, true);
  assert.equal(validateScenarioResult('```\n' + JSON.stringify(GOOD) + '\n```').ok, true);
  const chatty = 'Sure! Here is the object:\n' + JSON.stringify(GOOD) + '\nHope that helps.';
  const r = validateScenarioResult(chatty);
  assert.equal(r.ok, true);
  assert.equal(r.title, 'Spotting a friend');
});

test('a brace inside a string does not confuse the extractor', () => {
  const tricky = { ...GOOD, title: 'a { brace } and a "quote"' };
  const r = validateScenarioResult('noise ' + JSON.stringify(tricky) + ' more noise');
  assert.equal(r.ok, true);
  assert.equal(r.title, 'a { brace } and a "quote"');
});

test('unknown region ids are dropped and steps left empty by that are dropped with them', () => {
  const r = validateScenarioResult({
    ...GOOD,
    steps: [
      { region_ids: ['v1', 'prefrontal_cortex', 'v1'], approx_ms: 55, what_happens: 'a', why_it_matters: 'b' },
      { region_ids: ['limbic_system', 'not_a_region'], approx_ms: 100, what_happens: 'c', why_it_matters: 'd' },
      { region_ids: ['dlpfc'], approx_ms: 300, what_happens: 'e', why_it_matters: 'f' },
    ],
  });
  assert.equal(r.ok, true);
  assert.equal(r.steps.length, 2, 'the all-unknown step must be gone');
  assert.deepEqual(r.steps[0].region_ids, ['v1'], 'the duplicate and the invented id are both gone');
  assert.deepEqual(r.steps[1].region_ids, ['dlpfc']);
  assert.equal(r.dropped.region_ids, 3);
  assert.equal(r.dropped.malformed, 1, 'the all-unknown step is malformed, not capped');
  assert.equal(r.dropped.capped, 0, 'nothing hit the six-step cap here');
});

test('numbers are clamped, missing modulators are defaulted, and text is capped', () => {
  const r = validateScenarioResult({
    title: 'x'.repeat(500),
    steps: [{ region_ids: ['v1'], approx_ms: -12, what_happens: 'w'.repeat(900), why_it_matters: 'y'.repeat(900) }],
    neuromodulators: { dopamine: 9, cortisol: -4, serotonin: 'high' },
    intensity: 42,
    confidence: -1,
    rationale: 'r'.repeat(2000),
  });
  assert.equal(r.ok, true);
  assert.ok(r.title.length <= 120);
  assert.equal(r.steps[0].approx_ms, null, 'a negative latency is not a latency');
  assert.ok(r.steps[0].what_happens.length <= 400);
  assert.ok(r.steps[0].why_it_matters.length <= 400);
  assert.ok(r.rationale.length <= 700);
  assert.equal(r.neuromodulators.dopamine, 1);
  assert.equal(r.neuromodulators.cortisol, 0);
  assert.equal(r.neuromodulators.serotonin, LLM_BASELINE.serotonin, 'unparseable values fall back to rest');
  assert.equal(r.neuromodulators.gaba, LLM_BASELINE.gaba, 'missing values fall back to rest');
  assert.equal(r.intensity, 1);
  assert.equal(r.confidence, 0);
});

test('no more than six steps survive, however many the model sends', () => {
  const many = Array.from({ length: 20 }, (_, i) => ({
    region_ids: ['v1'], approx_ms: i * 10, what_happens: 'step ' + i, why_it_matters: 'because',
  }));
  const r = validateScenarioResult({ ...GOOD, steps: many });
  assert.equal(r.steps.length, 6);
  assert.equal(r.dropped.capped, 14, 'a long-but-valid reply is capped, never "malformed"');
  assert.equal(r.dropped.malformed, 0);
});

test('cap truncation and malformed drops are counted separately when both happen', () => {
  const steps = [
    ...Array.from({ length: 8 }, (_, i) => ({
      region_ids: ['v1'], approx_ms: i * 10, what_happens: 'step ' + i, why_it_matters: 'because',
    })),
  ];
  steps.splice(1, 0, { region_ids: ['not_a_region'], what_happens: 'x', why_it_matters: 'y' });
  steps.splice(3, 0, null);
  const r = validateScenarioResult({ ...GOOD, steps });
  assert.equal(r.steps.length, 6);
  assert.equal(r.dropped.malformed, 2, 'one all-unknown step and one non-object');
  assert.equal(r.dropped.capped, 2, 'the two valid steps past the cap');
});

test('garbage never throws — it comes back as ok:false with a reason', () => {
  for (const junk of ['', 'I am afraid I cannot do that.', '{', '[1,2,3]', 'null', null, undefined, 42, [], {}]) {
    const r = validateScenarioResult(junk);
    assert.equal(r.ok, false, `${JSON.stringify(junk)} should not validate`);
    assert.ok(typeof r.reason === 'string' && r.reason.length > 10, 'a failure must explain itself');
  }
});

test('a reply whose every region id is invented is rejected rather than shown empty', () => {
  const r = validateScenarioResult({ ...GOOD, steps: [{ region_ids: ['left_brain'], what_happens: 'a', why_it_matters: 'b' }] });
  assert.equal(r.ok, false);
  assert.match(r.reason, /region ids/i);
});

/* ---------- transport failures ---------- */

test('401, 402, 404, 429 and 500 each come back as a friendly ok:false', async () => {
  const cases = [[401, /rejected the key/i], [402, /credit/i], [404, /model id/i], [429, /rate-limit/i], [500, /server error/i]];
  for (const [status, re] of cases) {
    const r = await classifyWithOpenRouter('x', { key: KEY, fetchImpl: mockFetch(httpReply(status)) });
    assert.equal(r.ok, false);
    assert.equal(r.status, status);
    assert.match(r.reason, re, `HTTP ${status}: ${r.reason}`);
    assert.ok(!r.reason.includes(KEY), 'a failure message must never echo the key');
  }
});

test('a network error is reported as blocked, not thrown', async () => {
  const boom = async () => { throw new TypeError('Failed to fetch'); };
  const r = await classifyWithOpenRouter('x', { key: KEY, fetchImpl: boom });
  assert.equal(r.ok, false);
  assert.equal(r.blocked, true);
  assert.match(r.reason, /openrouter\.ai/);
});

test('an AbortSignal is forwarded to fetch and an abort is reported as such', async () => {
  const ctl = new AbortController();
  const f = mockFetch(async (url, init) => {
    assert.equal(init.signal, ctl.signal, 'the signal must reach fetch');
    ctl.abort();
    const err = new Error('aborted');
    err.name = 'AbortError';
    throw err;
  });
  const r = await classifyWithOpenRouter('x', { key: KEY, fetchImpl: f, signal: ctl.signal });
  assert.equal(r.ok, false);
  assert.equal(r.aborted, true);
  assert.match(r.reason, /cancelled or timed out/i);
});

test('a reply that is not JSON, or has no message, fails cleanly', async () => {
  const notJson = { ok: true, status: 200, json: async () => { throw new SyntaxError('nope'); } };
  assert.equal((await classifyWithOpenRouter('x', { key: KEY, fetchImpl: mockFetch(notJson) })).ok, false);

  const empty = { ok: true, status: 200, json: async () => ({ choices: [] }) };
  const r = await classifyWithOpenRouter('x', { key: KEY, fetchImpl: mockFetch(empty) });
  assert.equal(r.ok, false);
  assert.match(r.reason, /no message content|error/i);

  const apiErr = { ok: true, status: 200, json: async () => ({ error: { message: 'model is down' } }) };
  const r2 = await classifyWithOpenRouter('x', { key: KEY, fetchImpl: mockFetch(apiErr) });
  assert.equal(r2.ok, false);
  assert.match(r2.reason, /model is down/);
});

test('with no key, or no text, nothing is sent at all', async () => {
  const f = mockFetch(okReply(JSON.stringify(GOOD)));
  const noKey = await classifyWithOpenRouter('something', { key: '', fetchImpl: f });
  assert.equal(noKey.ok, false);
  assert.match(noKey.reason, /No OpenRouter key/);

  const noText = await classifyWithOpenRouter('   ', { key: KEY, fetchImpl: f });
  assert.equal(noText.ok, false);
  assert.equal(f.calls.length, 0, 'the network must not be touched without a key and some text');
});

/* ---------- wording screen ---------- */

test('llmScreenText flags diagnostic and prescribing phrasing', () => {
  const flagged = [
    'It is likely you have attention deficit hyperactivity disorder.',
    'People diagnosed with depression show this pattern.',
    'You should take a break from stimulants.',
    'A clinician might prescribe something for this.',
    'Medication changes how this circuit behaves.',
    'This is common if you suffer from anxiety.',
    'Your condition would explain the delay.',
  ];
  for (const t of flagged) {
    const r = llmScreenText(t);
    assert.equal(r.flagged, true, `should have been flagged: ${t}`);
    assert.ok(typeof r.reason === 'string' && r.reason.length > 0, 'a flag must name the phrase');
  }
});

test('llmScreenText leaves ordinary mechanism prose alone', () => {
  const clean = [
    'The fusiform face area responds to face-like structure about 170 ms after onset.',
    'Noradrenaline from the locus coeruleus raises gain across cortex.',
    'You haven\'t seen this face before, so the hippocampus has nothing to match.',
    'Typically the amygdala tags the scene as significant first.',
    '', null, undefined, 42,
  ];
  for (const t of clean) {
    assert.equal(llmScreenText(t).flagged, false, `should not have been flagged: ${t}`);
  }
});

test('validateScenarioResult reports which fields the screen flagged, and edits none of them', () => {
  const drifted = {
    ...GOOD,
    steps: [
      { region_ids: ['v1'], approx_ms: 55, what_happens: 'Edges arrive.', why_it_matters: 'Vision starts here.' },
      { region_ids: ['dlpfc'], approx_ms: 300, what_happens: 'This is what happens when you have ADHD.', why_it_matters: 'Fine.' },
    ],
    rationale: 'A clinician would prescribe something here.',
  };
  const r = validateScenarioResult(drifted);
  assert.equal(r.ok, true);
  assert.equal(r.screened.flagged, true);
  assert.deepEqual(r.screened.fields, ['steps[1].what_happens', 'rationale']);
  assert.equal(r.steps[1].what_happens, 'This is what happens when you have ADHD.', 'flagged text is shown, not rewritten');
  assert.equal(r.rationale, 'A clinician would prescribe something here.');
});

test('a clean reply reports screened:{flagged:false} rather than nothing at all', () => {
  const r = validateScenarioResult(GOOD);
  assert.equal(r.ok, true);
  assert.equal(r.screened.flagged, false);
  assert.deepEqual(r.screened.fields, []);
});

test('the request asks for enough tokens to carry six steps plus a rationale', () => {
  const f = mockFetch(okReply(JSON.stringify(GOOD)));
  return classifyWithOpenRouter('x', { key: KEY, fetchImpl: f }).then(() => {
    assert.ok(f.calls[0].body.max_tokens >= 1500,
      `max_tokens ${f.calls[0].body.max_tokens}: six steps of prose were being truncated at 900`);
  });
});

/* ---------- lesions ---------- */

test('the system prompt names the lesioned regions and asks the model to route around them', () => {
  const plain = llmSystemPrompt();
  assert.equal(plain.indexOf('lesioned'), -1, 'no lesion line when nothing is lesioned');

  const p = llmSystemPrompt(['ffa', 'hippocampus']);
  assert.ok(p.indexOf('These regions are lesioned and cannot contribute: ffa, hippocampus') > 0, p.slice(0, 400));
  assert.ok(p.indexOf('route the sequence around them where plausible and say so in the rationale') > 0);
  assert.ok(p.indexOf(llmRegionCatalogue()) > 0, 'the region catalogue is still there in full');
  assert.equal(llmSystemPrompt([]).indexOf('lesioned'), -1);
  assert.equal(llmSystemPrompt('nonsense').indexOf('lesioned'), -1, 'a non-array is ignored, not crashed on');
});

test('a lesioned region the model used anyway comes back flagged, not dropped', () => {
  const out = validateScenarioResult(GOOD, { lesions: ['ffa'] });
  assert.equal(out.ok, true);
  assert.equal(out.steps.length, GOOD.steps.length, 'the step is kept');
  const broken = out.steps.filter((s) => s.broken);
  assert.equal(broken.length, 1);
  assert.deepEqual(broken[0].region_ids, ['ffa']);
  assert.deepEqual(broken[0].broken_ids, ['ffa']);
  assert.deepEqual(out.lesioned, ['ffa']);
  assert.equal(out.dropped.region_ids, 0, 'a lesion is not a validation failure');
});

test('a reply that did route around the lesion carries no broken flags', () => {
  const out = validateScenarioResult(GOOD, { lesions: ['cerebellum'] });
  assert.equal(out.steps.some((s) => s.broken), false);
  assert.deepEqual(out.lesioned, []);
});

test('lesions travel from the caller into both the prompt and the validated result', async () => {
  const f = mockFetch(okReply(JSON.stringify(GOOD)));
  const out = await classifyWithOpenRouter('a friend in a crowd', {
    key: KEY, fetchImpl: f, lesions: ['ffa', 'not_a_region_id'],
  });
  const system = f.calls[0].body.messages[0].content;
  assert.ok(system.indexOf('These regions are lesioned and cannot contribute: ffa, not_a_region_id') > 0);
  assert.equal(out.ok, true);
  assert.deepEqual(out.lesioned, ['ffa']);
  assert.equal(out.steps.filter((s) => s.broken).length, 1);
});

test('no lesion list at all leaves every existing result untouched', () => {
  const a = validateScenarioResult(GOOD);
  const b = validateScenarioResult(GOOD, {});
  assert.deepEqual(a, b);
  assert.equal(a.steps.some((s) => s.broken), false);
  assert.deepEqual(a.lesioned, []);
});
