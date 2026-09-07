// LLM hardening fuzz: validateScenarioResult() and askValidateAnswer() are the two places an LLM's
// raw text response gets turned into something the app trusts enough to render and highlight regions
// from. Both must treat the model's output as hostile: 200 structurally-random payloads (strings,
// numbers, deeply nested objects, prototype-pollution attempts, NaN/Infinity, garbage JSON, huge
// strings) must never throw, never produce an unknown region id, and never claim `ok:true` without at
// least one usable step/citation. A seeded PRNG keeps the run deterministic and reproducible.
import test from 'node:test';
import assert from 'node:assert/strict';
import { validateScenarioResult } from '../src/llm/openrouter.js';
import { askValidateAnswer, askRegionRecord } from '../src/llm/ask.js';
import { REGIONS } from '../src/data/regions.js';

const KNOWN_REGION_IDS = new Set(REGIONS.map((r) => r.id));
const N = 200;

// Deterministic PRNG (LCG) so a failure is reproducible without recording every payload.
function makeRng(seed) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1103515245) + 12345) >>> 0; return s / 0xffffffff; };
}

function makeGarbageFactory(rng) {
  const pick = (a) => a[Math.floor(rng() * a.length)];
  function garbage(depth = 0) {
    const kinds = ['str', 'num', 'bool', 'null', 'undef', 'arr', 'obj', 'proto', 'nan', 'date', 'deep'];
    const k = depth > 4 ? pick(['str', 'num', 'null']) : pick(kinds);
    switch (k) {
      case 'str': return pick([
        '', 'x'.repeat(5000), '{"steps":[]}', '```json\n{}\n```', '{',
        JSON.stringify({ steps: [{ region_ids: ['v1'], what_happens: 'a' }] }),
        '<script>alert(1)</script>', '� [31m', 'null', '[]', '{"a":',
      ]);
      case 'num': return pick([0, -1, 1e308, -1e308, 1e-308, Number.MAX_SAFE_INTEGER, 0.5, -0]);
      case 'bool': return rng() < 0.5;
      case 'null': return null;
      case 'undef': return undefined;
      case 'arr': return Array.from({ length: Math.floor(rng() * 5) }, () => garbage(depth + 1));
      case 'obj': {
        const o = {};
        for (let i = 0; i < Math.floor(rng() * 6); i++) {
          o[pick(['steps', 'title', 'rationale', 'neuromodulators', 'confidence', 'intensity',
            '__proto__', 'constructor', 'toString', 'region_ids', 'approx_ms', 'what_happens'])] = garbage(depth + 1);
        }
        return o;
      }
      case 'proto': return JSON.parse('{"__proto__":{"polluted":true},"steps":[{"region_ids":["v1"],"what_happens":"x"}]}');
      case 'nan': return pick([NaN, Infinity, -Infinity]);
      case 'date': return new Date(0);
      case 'deep': { let o = { steps: [] }; for (let i = 0; i < 60; i++) o = { steps: [o] }; return o; }
    }
  }
  return garbage;
}

test(`validateScenarioResult: ${N} garbage payloads never throw, never unknown ids, never ok:true with no steps`, () => {
  const rng = makeRng(12345);
  const garbage = makeGarbageFactory(rng);
  const lesionOptions = [[], ['v1'], ['nope'], null, 'x'];
  let checked = 0;
  for (let i = 0; i < N; i++) {
    const payload = garbage();
    const lesions = lesionOptions[Math.floor(rng() * lesionOptions.length)];
    const call = callSafely(() => validateScenarioResult(payload, { lesions }));
    if (call.threw) assert.fail(`threw on payload #${i}: ${safeSnippet(payload)}\n  ${call.error && call.error.message}`);
    const r = call.value;
    checked++;
    if (r.ok) {
      assert.ok(Array.isArray(r.steps) && r.steps.length >= 1, `ok:true with no steps, payload #${i}`);
      for (const step of r.steps) {
        assert.ok(Array.isArray(step.region_ids) && step.region_ids.length >= 1, `step with no region_ids, payload #${i}`);
        for (const id of step.region_ids) {
          assert.ok(KNOWN_REGION_IDS.has(id), `unknown region id "${id}" survived validation, payload #${i}`);
        }
        assert.ok(step.approx_ms === null || (Number.isFinite(step.approx_ms) && step.approx_ms >= 0),
          `bad approx_ms ${step.approx_ms}, payload #${i}`);
        assert.equal(typeof step.what_happens, 'string');
      }
      for (const [k, v] of Object.entries(r.neuromodulators)) {
        assert.ok(Number.isFinite(v) && v >= 0 && v <= 1, `modulator ${k}=${v} out of range, payload #${i}`);
      }
      assert.ok(Number.isFinite(r.confidence), `bad confidence, payload #${i}`);
      assert.ok(Number.isFinite(r.intensity), `bad intensity, payload #${i}`);
      assert.equal(typeof r.title, 'string');
      assert.ok(r.title.length > 0, `empty title, payload #${i}`);
    } else {
      assert.equal(typeof r.reason, 'string');
      assert.ok(r.reason.length > 0, `ok:false with no reason, payload #${i}`);
    }
  }
  assert.equal(checked, N);
  assert.equal({}.polluted, undefined, 'prototype pollution reached Object.prototype');
});

test(`askValidateAnswer: ${N} garbage payloads never throw and keep a well-typed shape`, () => {
  const rng = makeRng(67890);
  const garbage = makeGarbageFactory(rng);
  const contexts = [
    { label: 'x', records: [askRegionRecord('v1')] },
    null, undefined, [], { records: [{}] },
  ];
  for (let i = 0; i < N; i++) {
    const payload = garbage();
    const context = contexts[Math.floor(rng() * contexts.length)];
    const call = callSafely(() => askValidateAnswer(payload, context));
    if (call.threw) assert.fail(`threw on payload #${i}: ${safeSnippet(payload)}\n  ${call.error && call.error.message}`);
    const a = call.value;
    assert.equal(typeof a, 'object');
    assert.equal(typeof a.ok, 'boolean');
    if (a.ok) {
      assert.equal(typeof a.answer, 'string', `payload #${i}`);
      assert.ok(Array.isArray(a.citations), `payload #${i}`);
      for (const c of a.citations) assert.equal(typeof c, 'string', `non-string citation, payload #${i}`);
      if (a.citations.length) assert.equal(typeof a.ungrounded, 'boolean', `missing ungrounded flag, payload #${i}`);
    }
  }
  assert.equal({}.polluted, undefined, 'prototype pollution reached Object.prototype');
});

function safeSnippet(v) {
  try { return String(JSON.stringify(v)).slice(0, 150); } catch (err) { /* fall through */ }
  try { return Object.prototype.toString.call(v); } catch (err) { return '<unprintable payload>'; }
}

/** Like assert.doesNotThrow, but the failure message is only built (via safeSnippet, which can
 * itself choke on sufficiently exotic garbage) after something has actually gone wrong. */
function callSafely(fn) {
  try { return { value: fn(), threw: false }; } catch (err) { return { threw: true, error: err }; }
}
