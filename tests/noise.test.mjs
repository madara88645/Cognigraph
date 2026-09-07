import test from 'node:test';
import assert from 'node:assert/strict';
import { createNoise3D, fbm3, mulberry32 } from '../src/lib/noise.js';

test('mulberry32 is deterministic per seed and stays in [0,1)', () => {
  const a = mulberry32(42), b = mulberry32(42), c = mulberry32(43);
  let differs = false;
  for (let i = 0; i < 500; i++) {
    const x = a(), y = b(), z = c();
    assert.equal(x, y);
    assert.ok(x >= 0 && x < 1, `out of range: ${x}`);
    if (x !== z) differs = true;
  }
  assert.ok(differs, 'different seeds produced an identical stream');
});

test('simplex noise is deterministic for a seed', () => {
  const a = createNoise3D(2026), b = createNoise3D(2026);
  for (let i = 0; i < 2000; i++) {
    const x = (i * 0.37) % 17 - 8, y = (i * 0.71) % 13 - 6, z = (i * 1.13) % 23 - 11;
    assert.equal(a(x, y, z), b(x, y, z));
  }
});

test('simplex noise output stays inside [-1, 1] and actually varies', () => {
  const n = createNoise3D(7);
  let min = Infinity, max = -Infinity, sumAbs = 0;
  const N = 60000;
  for (let i = 0; i < N; i++) {
    const v = n(Math.sin(i) * 30, Math.cos(i * 1.7) * 30, Math.sin(i * 0.31) * 30);
    assert.ok(Number.isFinite(v), 'non-finite noise');
    if (v < min) min = v;
    if (v > max) max = v;
    sumAbs += Math.abs(v);
  }
  assert.ok(min >= -1 && max <= 1, `range ${min}..${max}`);
  assert.ok(min < -0.5 && max > 0.5, `noise is too flat: ${min}..${max}`);
  assert.ok(sumAbs / N > 0.15, 'noise is nearly constant');
});

test('different seeds give different noise fields', () => {
  const a = createNoise3D(1), b = createNoise3D(2);
  let sum = 0;
  const N = 4000;
  for (let i = 0; i < N; i++) {
    const x = (i % 61) * 0.31, y = (i % 43) * 0.53, z = (i % 29) * 0.77;
    sum += Math.abs(a(x, y, z) - b(x, y, z));
  }
  assert.ok(sum / N > 0.1, `seeds are too correlated (mean |diff| = ${sum / N})`);
});

test('fbm3 is deterministic, bounded, and responds to its parameters', () => {
  assert.equal(fbm3(0.3, 0.4, 0.5, 4, 2, 0.5), fbm3(0.3, 0.4, 0.5, 4, 2, 0.5));
  let min = Infinity, max = -Infinity;
  for (let i = 0; i < 20000; i++) {
    const v = fbm3(Math.sin(i) * 12, Math.cos(i * 2.1) * 12, Math.sin(i * 0.7) * 12, 4, 2, 0.5);
    assert.ok(Number.isFinite(v));
    if (v < min) min = v; if (v > max) max = v;
  }
  assert.ok(min >= -1 && max <= 1, `fbm range ${min}..${max}`);
  assert.ok(min < -0.2 && max > 0.2, 'fbm is too flat');
  // a different octave count must change the field
  assert.notEqual(fbm3(1.1, 2.2, 3.3, 1, 2, 0.5), fbm3(1.1, 2.2, 3.3, 4, 2, 0.5));
  // an explicitly supplied sampler is used instead of the default
  const own = createNoise3D(99);
  assert.notEqual(fbm3(1.1, 2.2, 3.3, 3, 2, 0.5), fbm3(1.1, 2.2, 3.3, 3, 2, 0.5, own));
});
