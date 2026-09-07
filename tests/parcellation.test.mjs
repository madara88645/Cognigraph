import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CORTICAL_IDS, CORTICAL_PATCHES, LOBE_IDS,
  patchCenter, regionIdForDirection, lobeForDirection,
} from '../src/brain/parcellation.js';
import { REGIONS } from '../src/data/regions.js';

const LEFT_ONLY = new Set(['wernicke', 'broca']);

function sphereDirections(n, seed = 12345) {
  // deterministic quasi-uniform sphere sampling (golden-angle spiral + jitter-free)
  const out = [];
  const ga = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (2 * (i + 0.5)) / n;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const th = ga * (i + seed % 7);
    out.push({ x: r * Math.cos(th), y, z: r * Math.sin(th) });
  }
  return out;
}

test('there are 13 cortical patches and they are all REGIONS ids', () => {
  assert.equal(CORTICAL_IDS.length, 13);
  assert.equal(new Set(CORTICAL_IDS).size, 13);
  const known = new Set(REGIONS.map((r) => r.id));
  for (const id of CORTICAL_IDS) assert.ok(known.has(id), `${id} is not a REGIONS id`);
});

test('lobe fallback ids are NOT REGIONS ids (so picking there resolves to null)', () => {
  const known = new Set(REGIONS.map((r) => r.id));
  for (const id of LOBE_IDS) assert.ok(!known.has(id), `${id} must not be a REGIONS id`);
});

test('patch centres are unit vectors and patchCenter() round-trips', () => {
  for (const p of CORTICAL_PATCHES) {
    const c = patchCenter(p.id);
    assert.ok(c, `no centre for ${p.id}`);
    assert.ok(Math.abs(Math.hypot(c.x, c.y, c.z) - 1) < 1e-9, `${p.id} centre is not unit length`);
    assert.ok(p.radius > 0.1 && p.radius < 1.2, `${p.id} radius ${p.radius} out of sane range`);
  }
  assert.equal(patchCenter('not_a_region'), null);
});

test('every cortical id appears when sampling the hemisphere (except Broca/Wernicke on the right)', () => {
  const dirs = sphereDirections(5000);
  for (const side of ['left', 'right']) {
    const seen = new Map();
    for (const d of dirs) {
      const id = regionIdForDirection(d, side);
      seen.set(id, (seen.get(id) || 0) + 1);
    }
    for (const id of CORTICAL_IDS) {
      if (side === 'right' && LEFT_ONLY.has(id)) {
        assert.ok(!seen.has(id), `${id} must not appear on the right hemisphere`);
      } else {
        assert.ok(seen.get(id) > 0, `${side}: ${id} never appeared`);
      }
    }
    // the fallback must be reachable too, and only ever a lobe id
    for (const id of seen.keys()) {
      assert.ok(CORTICAL_IDS.includes(id) || LOBE_IDS.includes(id), `unexpected id ${id}`);
    }
    for (const lobe of LOBE_IDS) assert.ok(seen.get(lobe) > 0, `${side}: lobe ${lobe} never used`);
  }
});

test('patches mirror between the sides — only the language patches differ', () => {
  const dirs = sphereDirections(5000, 3);
  let diffs = 0;
  for (const d of dirs) {
    const l = regionIdForDirection(d, 'left');
    const r = regionIdForDirection(d, 'right');
    if (l === r) continue;
    diffs++;
    // the ONLY reason the two sides may disagree is a left-only language patch:
    // on the right that territory is unassigned and falls to whatever is next nearest.
    assert.ok(LEFT_ONLY.has(l), `left/right differ at a non-language patch: ${l} vs ${r}`);
    assert.ok(!LEFT_ONLY.has(r), `${r} must not exist on the right hemisphere`);
  }
  assert.ok(diffs > 0, 'the language patches never showed up');
  // outside the language territory the two sides are identical
  for (const d of dirs) {
    const l = regionIdForDirection(d, 'left');
    if (LEFT_ONLY.has(l)) continue;
    assert.equal(regionIdForDirection(d, 'right'), l, 'non-language territory is not mirrored');
  }
});

test('every direction resolves to something, and lobeForDirection covers the sphere', () => {
  for (const d of sphereDirections(3000, 5)) {
    const id = regionIdForDirection(d, 'left');
    assert.ok(typeof id === 'string' && id.length, 'no id returned');
    assert.ok(LOBE_IDS.includes(lobeForDirection(d)), 'lobe fallback returned an unknown id');
  }
  // non-unit input must behave like its normalised version
  assert.equal(regionIdForDirection({ x: 0, y: 0, z: -7 }, 'left'), regionIdForDirection({ x: 0, y: 0, z: -1 }, 'left'));
});

test('each patch owns its own centre direction', () => {
  for (const p of CORTICAL_PATCHES) {
    const side = p.leftOnly ? 'left' : 'right';
    assert.equal(regionIdForDirection(p.center, side), p.id, `${p.id} does not own its centre`);
  }
});
