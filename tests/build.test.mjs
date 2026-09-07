import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
test('build.py produces a single-file bundle with no local imports/exports left', () => {
  execFileSync('python3', [path.join(root, 'build.py')], { stdio: 'pipe' });
  const html = readFileSync(path.join(root, 'dist/index.html'), 'utf8');
  assert.ok(html.includes('<script type="importmap">'));
  assert.ok(!/^\s*import .* from ['"]\./m.test(html), 'local import survived');
  assert.ok(!/^\s*export /m.test(html), 'export survived');
  assert.ok(!html.includes('<!doctype') && !html.includes('<html'), 'must be body-only for the Artifact wrapper');
  assert.ok(html.length < 16 * 1024 * 1024);
});

test('bundle parses and has no duplicate top-level declarations (single shared scope)', () => {
  const html = readFileSync(path.join(root, 'dist/index.html'), 'utf8');
  const m = html.match(/<script type="module">\n([\s\S]*?)\n<\/script>\s*$/);
  assert.ok(m, 'module script not found');
  const js = m[1];
  const tmp = path.join(root, 'dist', '.bundle-check.mjs');
  require('node:fs').writeFileSync(tmp, js);
  execFileSync('node', ['--check', tmp], { stdio: 'pipe' });
  require('node:fs').unlinkSync(tmp);
  const names = new Map();
  for (const line of js.split('\n')) {
    const d = line.match(/^(?:async\s+)?(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/);
    if (d) names.set(d[1], (names.get(d[1]) || 0) + 1);
  }
  const dups = [...names].filter(([, n]) => n > 1).map(([k]) => k);
  assert.deepEqual(dups, [], `duplicate top-level names: ${dups.join(', ')}`);
  assert.ok(names.size > 100, `only ${names.size} top-level declarations found — detector broken?`);
});

test('build.py collapses multi-line local imports (no import survives)', () => {
  const html = readFileSync(path.join(root, 'dist/index.html'), 'utf8');
  assert.ok(!/^\s*import\s*\{[^}]*$/m.test(html), 'a multi-line import survived into the bundle');
});
