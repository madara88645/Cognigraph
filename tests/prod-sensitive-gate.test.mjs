// Sensitive-input gate, exercised at the same seam a real user hits: Scenario mode's scRun(), with
// a key stored (so the LLM path is otherwise eligible to run) and a mocked fetch. classify-local's
// own llmDetectSensitive() already has direct unit coverage in tests/classify-local.test.mjs; this
// file is the integration check CONTRACTS.md actually cares about — that scRun() stops BEFORE either
// engine runs and BEFORE the key is ever read, for real crisis/diagnostic phrasings, so the network
// is provably never touched. 12 phrasings: EN + TR, crisis + diagnostic, with casing and punctuation
// variety, since the matching is meant to be case- and diacritic-insensitive.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadFullScope, fakeDocument, fakeStorage } from './helpers/full-bundle.mjs';

const PHRASES = [
  { text: 'I want to kill myself', kind: 'crisis' },
  { text: 'I WANT TO KILL MYSELF right now.', kind: 'crisis' },
  { text: "i've been thinking i'm better off dead...", kind: 'crisis' },
  { text: 'kendimi öldürmek istiyorum', kind: 'crisis' },
  { text: 'KENDİMİ ÖLDÜRMEK İSTİYORUM!!!', kind: 'crisis' },
  { text: 'Artık yaşamak istemiyorum.', kind: 'crisis' },
  { text: 'sometimes I think about hurting myself.', kind: 'crisis' },
  { text: 'Can you diagnose me with anxiety?', kind: 'medical' },
  { text: 'AM I DEPRESSED??', kind: 'medical' },
  { text: 'Do I have ADHD?', kind: 'medical' },
  { text: 'bende depresyon var mı', kind: 'medical' },
  { text: 'Bende ADHD Var Mı?', kind: 'medical' },
];

/** Fresh scRun/sc/explain scope with a fake DOM, a fake localStorage pre-loaded with an API key
 * (so a non-sensitive control phrase WOULD hit the network — proving the gate, not a missing key,
 * is what stops the sensitive ones), and a fetch mock that must never be called for these phrases. */
function makeScope() {
  const doc = fakeDocument();
  let fetchCalls = 0;
  const store = fakeStorage({ 'cg.openrouter.key': 'sk-or-v1-TESTKEY' });
  const sandbox = {
    document: doc,
    window: { innerWidth: 1200, innerHeight: 800, addEventListener() {}, removeEventListener() {}, devicePixelRatio: 1 },
    localStorage: store,
    fetch(...args) { fetchCalls++; return Promise.resolve({ ok: true, status: 200, json: async () => ({ choices: [] }) }); },
    location: { origin: 'null', href: 'about:blank', reload() {} },
    AbortController, setTimeout, clearTimeout, setInterval, clearInterval,
    performance: { now: () => Date.now() },
    requestAnimationFrame() { return 0; }, cancelAnimationFrame() {},
  };
  const scope = loadFullScope(['scRun', 'sc', 'SC_PRESETS', 'SC_REFUSALS'], sandbox);
  scope.sc.app = {
    scene: {
      clearHighlights() {}, highlight() {}, setLesion() {}, clearLesions() {},
      flyTo() {}, resetView() {}, pulse: async () => {}, centroid: () => ({ x: 0, y: 0, z: 0 }),
      addOverlay() {}, removeOverlay() {}, setIdleRotate() {}, regionIds: [],
    },
    lesions: new Set(), modulators: {}, measure: {}, modes: {}, mode: null,
  };
  return { scope, doc, getCalls: () => fetchCalls };
}

test('all 12 crisis/diagnostic phrasings stop before the LLM path — fetch is never called', async () => {
  for (const { text, kind } of PHRASES) {
    const { scope, getCalls } = makeScope();
    await scope.scRun(text);
    assert.equal(getCalls(), 0, `fetch was called for ${kind} phrase: ${JSON.stringify(text)}`);
  }
});

test('each refusal shows the calm "not something to simulate" card, not a pathway result', async () => {
  for (const { text } of PHRASES) {
    const { scope, doc } = makeScope();
    await scope.scRun(text);
    const title = doc.getElementById('explain-title').textContent;
    const body = doc.getElementById('explain-body').innerHTML;
    assert.equal(title, 'This isn’t something to simulate', `unexpected title for ${JSON.stringify(text)}: ${title}`);
    assert.ok(body.includes('sc-refusal'), `refusal card not shown for ${JSON.stringify(text)}`);
    // no leftover scenario result state from a run that should never have happened
    assert.equal(scope.sc.result, null, `sc.result was set for ${JSON.stringify(text)}`);
  }
});

test('crisis text gets the wellbeing copy, diagnostic text gets the "does not diagnose" copy', async () => {
  for (const { text, kind } of PHRASES) {
    const { scope, doc } = makeScope();
    await scope.scRun(text);
    const body = doc.getElementById('explain-body').innerHTML;
    if (kind === 'crisis') {
      assert.ok(/struggling|helpline|trust/.test(body), `crisis copy missing for ${JSON.stringify(text)}`);
    } else {
      assert.ok(/does not diagnose|advise on health/.test(body), `medical copy missing for ${JSON.stringify(text)}`);
    }
  }
});

test('control: an ordinary sentence with a key stored DOES attempt the network (the gate is selective, not a blanket block)', async () => {
  const { scope, getCalls } = makeScope();
  await scope.scRun('I recognised a friend in a crowd at a party.');
  assert.ok(getCalls() > 0, 'an ordinary scenario with a stored key should have attempted fetch');
});

test('the gate itself never throws, whatever the input', async () => {
  const junk = ['', '   ', null, undefined, 'x'.repeat(6000), '🙂'.repeat(50), '<script>alert(1)</script>'];
  for (const text of junk) {
    const { scope } = makeScope();
    await assert.doesNotReject(() => scope.scRun(text), `scRun threw on ${JSON.stringify(text)}`);
  }
});
