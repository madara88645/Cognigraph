// Production-only failure modes for dist/index.html itself: things a passing unit test on the
// source files cannot catch because they only show up once everything is concatenated into one
// file and shipped. build.test.mjs already checks "no local import/export survived" and "no
// duplicate top-level names" — this file adds the invariants CONTRACTS.md promises on top of that:
// exactly one <script type="module">, no top-level DOM/THREE side effects across the WHOLE tree
// (not just the brain/ subset scene-contract.test.mjs checks), a size ceiling, and a closed CDN
// host allowlist across every https?:// string anywhere in the file (not just the JS).
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { loadFullScope } from './helpers/full-bundle.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(root, 'dist', 'index.html');

function build() {
  execFileSync('python3', [path.join(root, 'build.py')], { stdio: 'pipe' });
  return readFileSync(DIST, 'utf8');
}

test('exactly one <script type="module">, and exactly one <script type="importmap">', () => {
  const html = build();
  // Anchored to the start of a line: the real tags build.py/head.html emit always open a line by
  // themselves. A JS comment that merely *mentions* the tag as prose (see src/ui/glossary.js) is
  // indented inside a function body and can never match this anchor, so it cannot false-positive.
  const tags = [...html.matchAll(/^<script([^>]*)>/gm)].map((m) => m[1]);
  const modules = tags.filter((t) => /type\s*=\s*"module"/.test(t));
  const importmaps = tags.filter((t) => /type\s*=\s*"importmap"/.test(t));
  assert.equal(modules.length, 1, `found ${modules.length} <script type="module"> tags`);
  assert.equal(importmaps.length, 1, `found ${importmaps.length} <script type="importmap"> tags`);
  assert.equal(tags.length, 2, `found ${tags.length} <script> tags total, expected exactly 2`);
});

test('bundle is under 1.5 MB', () => {
  const html = build();
  const kb = Buffer.byteLength(html, 'utf8') / 1024;
  assert.ok(kb < 1536, `bundle is ${kb.toFixed(1)} KB, over the 1.5 MB budget`);
});

test('no host outside the CDN allowlist appears anywhere in the file', () => {
  const html = build();
  const allow = new Set(['cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com', 'openrouter.ai']);
  const hosts = new Set([...html.matchAll(/https?:\/\/([a-zA-Z0-9.-]+)/g)].map((m) => m[1]));
  const bad = [...hosts].filter((h) => !allow.has(h));
  assert.deepEqual(bad, [], `unexpected host(s): ${bad.join(', ')}`);
  assert.ok(hosts.has('cdn.jsdelivr.net'), 'sanity: jsdelivr should be present');
});

test('the CDN import line points at the pinned three@0.170.0 build the importmap declares', () => {
  const html = build();
  assert.ok(html.includes('cdn.jsdelivr.net/npm/three@0.170.0/'), 'three version drifted from CONTRACTS.md');
});

test('no module outside main.js touches document, window, localStorage, fetch, location, or THREE at top level', () => {
  // loadFullScope evaluates every src file EXCEPT main.js concatenated exactly as build.py would,
  // with every one of those globals set to a value that throws the instant it is read or called.
  // If loading throws, something ran at module-eval time instead of inside a function.
  assert.doesNotThrow(() => {
    loadFullScope(['PathwaysMode', 'AtlasMode', 'NeuronsMode', 'ScenarioMode', 'LearnMode'], {
      document: new Proxy({}, { get(t, k) { throw new Error(`document.${String(k)} touched at load time`); } }),
      window: new Proxy({}, { get(t, k) { throw new Error(`window.${String(k)} touched at load time`); } }),
      localStorage: new Proxy({}, { get(t, k) { throw new Error(`localStorage.${String(k)} touched at load time`); } }),
      fetch: () => { throw new Error('fetch called at load time'); },
      location: new Proxy({}, { get(t, k) { throw new Error(`location.${String(k)} touched at load time`); } }),
    });
  });
});

test('`new THREE.` never appears outside a function body in any bundled source file', () => {
  // Belt-and-suspenders on top of the runtime check above: a static scan catches a `new THREE.Foo()`
  // sitting at module top level even if that particular construct happens not to throw against the
  // Proxy stub (e.g. a constructor call whose result is simply never read).
  const srcDirs = ['lib', 'data', 'llm', 'lab', 'learn', 'brain', 'ui', 'modes'];
  const offenders = [];
  for (const d of srcDirs) {
    const dir = path.join(root, 'src', d);
    for (const f of readdirSync(dir).filter((n) => n.endsWith('.js'))) {
      const lines = readFileSync(path.join(dir, f), 'utf8').split('\n');
      let depth = 0;
      for (const line of lines) {
        const opens = (line.match(/\{/g) || []).length;
        const closes = (line.match(/\}/g) || []).length;
        if (depth === 0 && /\bnew THREE\./.test(line) && !/^\s*\/\//.test(line)) offenders.push(`${d}/${f}: ${line.trim()}`);
        depth += opens - closes;
      }
    }
  }
  assert.deepEqual(offenders, [], `possible top-level 'new THREE.' usage:\n${offenders.join('\n')}`);
});
