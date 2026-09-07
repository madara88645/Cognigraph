// "Ask about this" is the one place in the app where a language model is allowed to sound like a
// source. These tests hold it to that: the prompt must carry the record and nothing else, every
// citation must resolve to an id that was actually given, and anything the app cannot trace has to
// come back flagged rather than dressed up. No real key, no real request — fetch is always a mock.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  askGrounded, askSystemPrompt, askContextIds, askContextJson, askNormaliseContext,
  askParseCitations, askValidateAnswer, askRegionRecord, askStepRecord, askScenarioRecord,
  ASK_CANT_TELL, ASK_MAX_SENTENCES,
} from '../src/llm/ask.js';
import { LLM_ENDPOINT, LLM_DEFAULT_MODEL } from '../src/llm/openrouter.js';
import { PATHWAYS } from '../src/data/pathways.js';

const KEY = 'sk-or-v1-TESTKEY-not-a-real-key';

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

const HIPPO = askRegionRecord('hippocampus');
const CTX = { label: 'Hippocampus', records: [HIPPO] };

/* ---------- context ---------- */

test('a record, an array and a {label, records} object are all the same context', () => {
  assert.deepEqual(askContextIds(HIPPO), ['hippocampus']);
  assert.deepEqual(askContextIds([HIPPO]), ['hippocampus']);
  assert.deepEqual(askContextIds(CTX), ['hippocampus']);
  assert.deepEqual(askContextIds(null), []);
  assert.deepEqual(askContextIds({ records: [] }), []);
  assert.equal(askNormaliseContext(undefined).records.length, 0);
});

test('the record builders produce citable ids in the documented shapes', () => {
  assert.equal(askRegionRecord('ffa').id, 'ffa');
  assert.equal(askRegionRecord('not_a_region'), null);

  const step = askStepRecord(PATHWAYS[0].id, 1);
  assert.equal(step.id, PATHWAYS[0].id + '#2', 'steps are cited 1-based, like the timeline shows them');
  assert.equal(step.kind, 'pathway_step');
  assert.equal(askStepRecord(PATHWAYS[0].id, 99), null);
  assert.equal(askStepRecord('nope', 0), null);

  const scenario = askScenarioRecord({
    title: 'Exam panic', source: 'llm', confidence: 0.5,
    steps: [{ region_ids: ['v1'], approx_ms: 55, what_happens: 'Edges.', broken: true }],
    neuromodulators: { cortisol: 0.8 },
  });
  assert.equal(scenario.id, 'scenario');
  assert.equal(scenario.steps[0].broken, true, 'a lesioned step stays marked in the context');
  assert.equal(askScenarioRecord(null), null);
});

test('the prompt carries the record JSON, the allowed ids and the refusal sentence', () => {
  const prompt = askSystemPrompt(CTX);
  assert.ok(prompt.indexOf(askContextJson(CTX)) > 0, 'the record travels in the prompt verbatim');
  assert.ok(prompt.indexOf('[hippocampus]') > 0, 'the id is offered as a citation');
  assert.ok(prompt.indexOf(ASK_CANT_TELL) > 0);
  assert.ok(/ONLY the JSON/i.test(prompt), 'the model is told the JSON is the only source');
  assert.ok(prompt.indexOf('Never invent an id') > 0);
  assert.ok(prompt.indexOf(String(ASK_MAX_SENTENCES)) > 0, 'the sentence cap is asked for');
});

/* ---------- citation parsing ---------- */

test('citations are the bracketed ids that exist; the rest are reported as invented', () => {
  const ids = ['hippocampus', 'recall_word#2'];
  assert.deepEqual(askParseCitations('It stores things [hippocampus].', ids),
    { citations: ['hippocampus'], unknown: [] });
  assert.deepEqual(askParseCitations('[recall_word#2] then [hippocampus] again [hippocampus].', ids),
    { citations: ['recall_word#2', 'hippocampus'], unknown: [] }, 'de-duplicated, order kept');
  assert.deepEqual(askParseCitations('As shown in [entorhinal_cortex].', ids),
    { citations: [], unknown: ['entorhinal_cortex'] });
  assert.deepEqual(askParseCitations('No brackets here.', ids), { citations: [], unknown: [] });
  assert.deepEqual(askParseCitations(null, ids), { citations: [], unknown: [] });
});

/* ---------- grounding ---------- */

test('an answer citing a real id is grounded', () => {
  const out = askValidateAnswer('The hippocampus binds an episode into one memory [hippocampus].', CTX);
  assert.equal(out.ok, true);
  assert.equal(out.ungrounded, false);
  assert.deepEqual(out.citations, ['hippocampus']);
  assert.equal(out.unknown.length, 0);
});

test('no citation, an invented citation, or "I can\'t tell" are all ungrounded', () => {
  const none = askValidateAnswer('It is the seat of the soul.', CTX);
  assert.equal(none.ungrounded, true);
  assert.deepEqual(none.citations, []);

  const invented = askValidateAnswer('It talks to the entorhinal cortex [entorhinal_cortex].', CTX);
  assert.equal(invented.ungrounded, true, 'a hallucinated id is not a citation');
  assert.deepEqual(invented.unknown, ['entorhinal_cortex']);

  const cant = askValidateAnswer(ASK_CANT_TELL + '.', CTX);
  assert.equal(cant.ungrounded, true);
  assert.equal(cant.cantTell, true);

  const mixed = askValidateAnswer('It binds episodes [hippocampus] and projects to [fornix].', CTX);
  assert.equal(mixed.ungrounded, true, 'one invented id spoils the whole answer');
});

test('answers are trimmed to three sentences and an empty answer is a failure', () => {
  const long = askValidateAnswer('One [hippocampus]. Two. Three. Four. Five.', CTX);
  assert.equal(long.answer, 'One [hippocampus]. Two. Three.');
  const empty = askValidateAnswer('   ', CTX);
  assert.equal(empty.ok, false);
  assert.equal(empty.ungrounded, true);
});

/* ---------- request shape ---------- */

test('posts one chat completion to OpenRouter with the key in the header and nothing else', async () => {
  const f = mockFetch(okReply('It binds an episode together [hippocampus].'));
  const out = await askGrounded('What does it do?', CTX, { key: KEY, model: 'openai/gpt-4o-mini', fetchImpl: f });

  assert.equal(f.calls.length, 1);
  const { url, init, body } = f.calls[0];
  assert.equal(url, LLM_ENDPOINT);
  assert.equal(init.method, 'POST');
  assert.equal(init.headers.Authorization, 'Bearer ' + KEY);
  assert.equal(body.model, 'openai/gpt-4o-mini');
  assert.equal(body.messages.length, 2);
  assert.equal(body.messages[0].role, 'system');
  assert.equal(body.messages[1].content, 'What does it do?');
  assert.ok(body.messages[0].content.indexOf('hippocampus') > 0);
  assert.equal(JSON.stringify(body).indexOf(KEY), -1, 'the key is never in the body');

  assert.equal(out.ok, true);
  assert.equal(out.ungrounded, false);
  assert.deepEqual(out.citations, ['hippocampus']);
  assert.equal(out.model, 'openai/gpt-4o-mini');
});

test('the model defaults to the app default and the question is capped', async () => {
  const f = mockFetch(okReply('Fine [hippocampus].'));
  await askGrounded('x'.repeat(2000), CTX, { key: KEY, fetchImpl: f });
  assert.equal(f.calls[0].body.model, LLM_DEFAULT_MODEL);
  assert.ok(f.calls[0].body.messages[1].content.length <= 400);
});

/* ---------- failures are values ---------- */

test('no key, no question and no selection each stop before any request', async () => {
  const f = mockFetch(okReply('never sent'));
  assert.equal((await askGrounded('q', CTX, { key: '', fetchImpl: f })).ok, false);
  assert.equal((await askGrounded('', CTX, { key: KEY, fetchImpl: f })).ok, false);
  assert.equal((await askGrounded('q', null, { key: KEY, fetchImpl: f })).ok, false);
  assert.equal(f.calls.length, 0, 'nothing left the page');
});

test('401 says the key was rejected, and other statuses each get their own sentence', async () => {
  const bad = await askGrounded('q', CTX, { key: KEY, fetchImpl: mockFetch(httpReply(401)) });
  assert.equal(bad.ok, false);
  assert.equal(bad.status, 401);
  assert.ok(/rejected the key/i.test(bad.reason), bad.reason);
  assert.equal(bad.reason.indexOf(KEY), -1, 'the key never appears in an error message');

  assert.ok(/no credit/i.test((await askGrounded('q', CTX, { key: KEY, fetchImpl: mockFetch(httpReply(402)) })).reason));
  assert.ok(/model id/i.test((await askGrounded('q', CTX, { key: KEY, fetchImpl: mockFetch(httpReply(404)) })).reason));
  assert.ok(/rate-limiting/i.test((await askGrounded('q', CTX, { key: KEY, fetchImpl: mockFetch(httpReply(429)) })).reason));
  assert.ok(/server error/i.test((await askGrounded('q', CTX, { key: KEY, fetchImpl: mockFetch(httpReply(503)) })).reason));
});

test('a timeout comes back as aborted, and a blocked request as blocked', async () => {
  const abort = async () => { const e = new Error('aborted'); e.name = 'AbortError'; throw e; };
  const timedOut = await askGrounded('q', CTX, { key: KEY, fetchImpl: abort });
  assert.equal(timedOut.ok, false);
  assert.equal(timedOut.aborted, true);

  const blocked = await askGrounded('q', CTX, { key: KEY, fetchImpl: async () => { throw new TypeError('Failed to fetch'); } });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.blocked, true);
  assert.ok(/blocked before it left the page|network is down/i.test(blocked.reason));
});

test('a reply with no message, or unreadable JSON, never throws', async () => {
  const noChoices = await askGrounded('q', CTX, {
    key: KEY, fetchImpl: mockFetch({ ok: true, status: 200, json: async () => ({ error: { message: 'upstream died' } }) }),
  });
  assert.equal(noChoices.ok, false);
  assert.ok(noChoices.reason.indexOf('upstream died') > 0);

  const notJson = await askGrounded('q', CTX, {
    key: KEY, fetchImpl: mockFetch({ ok: true, status: 200, json: async () => { throw new Error('nope'); } }),
  });
  assert.equal(notJson.ok, false);

  const garbage = await askGrounded('q', CTX, { key: KEY, fetchImpl: mockFetch({}) });
  assert.equal(garbage.ok, false);
});

test('an ungrounded model answer still resolves, flagged rather than hidden', async () => {
  const out = await askGrounded('What year was it discovered?', CTX, {
    key: KEY, fetchImpl: mockFetch(okReply('It was described in 1587 by Arantius.')),
  });
  assert.equal(out.ok, true, 'the app still shows it');
  assert.equal(out.ungrounded, true, 'but never as grounded');
  assert.deepEqual(out.citations, []);
});
