import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LLM_DEFAULT_MODEL, LLM_RETIRING_MODELS, LLM_MODELS, LLM_MODEL_STORAGE, LLM_KEY_STORAGE,
  llmStoredModel, llmSetStoredModel, llmResolveModel, classifyWithOpenRouter,
} from '../src/llm/openrouter.js';
import { askGrounded } from '../src/llm/ask.js';

const RETIRING = [
  'openai/gpt-4o', 'openai/gpt-4o-2024-05-13', 'openai/gpt-4o-2024-08-06',
  'openai/gpt-4o-2024-11-20', 'openai/gpt-4o-mini', 'openai/gpt-4o-mini-2024-07-18',
  'openai/gpt-4.1', 'openai/gpt-4.1-mini',
];

test('every notified id migrates on read and write without touching the stored key', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const values = new Map([[LLM_KEY_STORAGE, 'test-key']]);
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: k => values.get(k) ?? null,
    setItem: (k, v) => values.set(k, v),
    removeItem: k => values.delete(k),
  } });
  try {
    assert.deepEqual(LLM_RETIRING_MODELS, RETIRING);
    for (const id of RETIRING) {
      values.set(LLM_MODEL_STORAGE, ' ' + id + ' ');
      assert.equal(llmStoredModel(), LLM_DEFAULT_MODEL);
      assert.equal(values.get(LLM_MODEL_STORAGE), LLM_DEFAULT_MODEL);
      assert.equal(llmStoredModel(), LLM_DEFAULT_MODEL, 'migration is idempotent');
      assert.equal(llmSetStoredModel(id), true);
      assert.equal(llmStoredModel(), LLM_DEFAULT_MODEL);
      assert.equal(values.get(LLM_KEY_STORAGE), 'test-key');
    }
    for (const id of ['anthropic/claude-haiku-4.5', 'custom/valid-model', 'openai/gpt-4o-custom']) {
      values.set(LLM_MODEL_STORAGE, id);
      assert.equal(llmStoredModel(), id);
      assert.equal(values.get(LLM_MODEL_STORAGE), id, 'valid stored choices are not rewritten');
    }
  } finally {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else delete globalThis.localStorage;
  }
});

test('migration works when storage writes fail, reads fail, or storage is unavailable', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  try {
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
      getItem: () => 'openai/gpt-4o-mini', setItem: () => { throw Error('quota'); },
    } });
    assert.equal(llmStoredModel(), LLM_DEFAULT_MODEL);
    assert.equal(llmStoredModel(), LLM_DEFAULT_MODEL);
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw Error('denied'); } });
    assert.equal(llmStoredModel(), LLM_DEFAULT_MODEL);
    delete globalThis.localStorage;
    assert.equal(llmStoredModel(), LLM_DEFAULT_MODEL);
  } finally {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else delete globalThis.localStorage;
  }
});

test('Scenario and Ask use Luna-compatible parameters for defaults and migrated explicit ids', async () => {
  const ctx = { id: 'hippocampus', name: 'Hippocampus' };
  for (const model of [undefined, ...RETIRING]) {
    const bodies = [];
    const fetchImpl = async (_url, init) => {
      bodies.push(JSON.parse(init.body));
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'Answer [hippocampus].' } }] }) };
    };
    await classifyWithOpenRouter('A friend', { key: 'test-key', model, fetchImpl });
    await askGrounded('What does it do?', ctx, { key: 'test-key', model, fetchImpl });
    assert.equal(bodies.length, 2);
    for (const body of bodies) {
      assert.equal(body.model, 'openai/gpt-6-luna');
      assert.ok(!('temperature' in body));
      assert.deepEqual(body.reasoning, { effort: 'none' });
    }
    assert.deepEqual(bodies[0].response_format, { type: 'json_object' });
    assert.equal(bodies[0].max_tokens, 1500);
    assert.equal(bodies[1].max_tokens, 400);
    assert.ok(!('response_format' in bodies[1]), 'Ask still expects prose');
  }
});

test('custom model ids retain their sampling parameters and are never prefix-migrated', async () => {
  for (const model of ['anthropic/claude-haiku-4.5', 'openai/gpt-4o-custom']) {
    assert.equal(llmResolveModel(model), model);
    const bodies = [];
    const fetchImpl = async (_url, init) => {
      bodies.push(JSON.parse(init.body));
      return { ok: false, status: 404 };
    };
    await classifyWithOpenRouter('A friend', { key: 'test-key', model, fetchImpl });
    await askGrounded('What?', { id: 'hippocampus' }, { key: 'test-key', model, fetchImpl });
    assert.equal(bodies[0].temperature, 0.3);
    assert.equal(bodies[1].temperature, 0.1);
    for (const body of bodies) {
      assert.equal(body.model, model);
      assert.ok(!('reasoning' in body));
    }
  }
  assert.ok(LLM_MODELS.every(m => !RETIRING.includes(m.id)));
});
