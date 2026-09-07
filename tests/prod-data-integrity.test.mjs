// Cross-file data integrity that the per-owner test files (data-counts, pathways-data, glossary,
// parcellation, scene-contract) do not already cover. Those files already assert: every PATHWAYS
// step's region_ids exist in REGIONS, glossary terms are unique, every pathway step has an
// evidence_tier + tier_reason, and the 13 cortical + 15 subcortical ids equal REGIONS exactly. This
// file adds the remaining "a silent data typo ships to production" gaps: classify-local's own
// static templates, the NEUROMOD_DEFS <-> NEUROMOD_UI key alignment neurons-ui.js depends on by
// `.find()` (a typo there would silently show a blank slider description forever), and the
// "How this works" drawer tabs actually rendering usable HTML.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { REGIONS } from '../src/data/regions.js';
import { NEUROMOD_DEFS, NEURON_PRESETS } from '../src/data/neuro.js';
import { NEUROMOD_UI, HOW_TABS } from '../src/data/howitworks.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('classify-local\'s built-in scenario templates only ever cite real region ids', () => {
  const src = readFileSync(path.join(root, 'src/llm/classify-local.js'), 'utf8');
  const known = new Set(REGIONS.map((r) => r.id));
  const bad = [];
  for (const m of src.matchAll(/region_ids:\s*\[([^\]]*)\]/g)) {
    for (const idm of m[1].matchAll(/'([^']+)'/g)) if (!known.has(idm[1])) bad.push(idm[1]);
  }
  assert.deepEqual(bad, [], `unknown region id(s) in classify-local templates: ${bad.join(', ')}`);
});

test('every NEUROMOD_UI slider has a matching NEUROMOD_DEFS entry (and vice versa), 1:1', () => {
  const defNames = NEUROMOD_DEFS.map((d) => d.modulator);
  const uiNames = NEUROMOD_UI.map((u) => u.modulator);
  assert.equal(uiNames.length, 6, `expected 6 sliders, found ${uiNames.length}`);
  assert.equal(defNames.length, 6, `expected 6 NEUROMOD_DEFS, found ${defNames.length}`);
  for (const name of uiNames) {
    assert.ok(defNames.includes(name), `NEUROMOD_UI "${name}" has no NEUROMOD_DEFS match — nsModDef() would return {}`);
  }
  assert.deepEqual([...uiNames].sort(), [...defNames].sort(), 'the two lists must name exactly the same six modulators');
  // every UI entry's own required fields are non-empty strings (nsModDef lookup succeeding is not
  // enough if the entry itself is half-written)
  for (const u of NEUROMOD_UI) {
    for (const k of ['key', 'name', 'param', 'caution', 'short', 'real', 'sim']) {
      assert.ok(typeof u[k] === 'string' && u[k].trim(), `NEUROMOD_UI ${u.modulator || '?'} missing ${k}`);
    }
  }
});

test('the "How this works" drawer tabs (Worker B\'s 5) each render substantial, junk-free HTML', () => {
  assert.equal(HOW_TABS.length, 5, `expected 5 tabs, found ${HOW_TABS.length}`);
  const ids = HOW_TABS.map((t) => t.id);
  assert.deepEqual([...ids].sort(), ['equations', 'glossary', 'metaphor', 'scenario', 'timing']);
  for (const t of HOW_TABS) {
    assert.ok(typeof t.label === 'string' && t.label.trim(), `${t.id} has no label`);
    const html = t.html;
    assert.ok(typeof html === 'string' && html.length >= 50, `${t.id} tab is empty or too short (${html && html.length})`);
    // "undefined" / "[object Object]" can only ever be a bug (a bad interpolation); "NaN" is not
    // banned outright because the equations tab legitimately *discusses* the model's own NaN
    // guard in prose ("reset to rest rather than spreading NaN") — see the finite-number checks
    // below for the actual place a real NaN could leak into this tab's HTML.
    assert.ok(!/undefined/.test(html), `"undefined" leaked into the ${t.id} tab`);
    assert.ok(!/\[object Object\]/.test(html), `"[object Object]" leaked into the ${t.id} tab`);
  }
});

test('the neuron-preset a/b/c/d values the "equations" tab interpolates raw (no escaping, since they are numbers) are all finite', () => {
  // howEquations() builds `a=${p.a}, b=${p.b}, c=${p.c}, d=${p.d}` directly from NEURON_PRESETS with
  // no Number.isFinite guard — the guard has to live at the data layer. This is the concrete case
  // the generic "no NaN in drawer HTML" instinct above was reaching for, checked at its source
  // instead of by regexing prose that is allowed to say the word "NaN".
  for (const [name, p] of Object.entries(NEURON_PRESETS)) {
    for (const k of ['a', 'b', 'c', 'd']) {
      assert.ok(Number.isFinite(p[k]), `NEURON_PRESETS.${name}.${k} = ${p[k]} is not finite`);
    }
  }
});
