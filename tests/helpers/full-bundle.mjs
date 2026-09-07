// Shared helper: load every src/ module EXCEPT main.js into one vm scope, exactly like the real
// dist/index.html bundle (build.py concatenates them and strips imports/exports so they share one
// scope). main.js is excluded because it is the one file allowed top-level DOM/CDN side effects
// (CONTRACTS.md) and it would try to actually boot the app against whatever fake globals we hand it.
//
// This mirrors tests/scene-contract.test.mjs's loadBrainScope(), widened to the whole tree, for tests
// that need production-shaped access to helpers the source files never `export` (e.g. pwEffMsSeq,
// sc/scRun) because in the bundle everything is a top-level name regardless of the `export` keyword.
import vm from 'node:vm';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC = path.join(root, 'src');

// Same order build.py uses (see build.py JS_DIRS), main.js excluded on purpose.
export const JS_DIRS = ['lib', 'data', 'llm', 'lab', 'learn', 'brain', 'ui', 'modes'];

const IMPORT_RE = /^\s*import\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]\s*;?\s*$/;
const EXPORT_LIST_RE = /^\s*export\s*\{[^}]*\}\s*(?:from\s+['"][^'"]+['"])?\s*;?\s*$/;
const MULTILINE_IMPORT_RE = /^[ \t]*import\s*\{[^}]*\}\s*from\s*['"]([^'"]+)['"]\s*;?[ \t]*$/m;

function jsFiles(dirs = JS_DIRS) {
  const out = [];
  for (const d of dirs) {
    const dir = path.join(SRC, d);
    for (const f of readdirSync(dir).filter((n) => n.endsWith('.js')).sort()) out.push(path.join(dir, f));
  }
  return out;
}

/** Strip local/CDN imports and `export` the same way build.py does, but drop CDN imports too
 * (rather than hoisting them) — the vm sandbox supplies fake globals for THREE etc. instead. */
export function bundleSource(dirs = JS_DIRS) {
  return jsFiles(dirs).map((f) => {
    let text = readFileSync(f, 'utf8');
    text = text.replace(MULTILINE_IMPORT_RE, (m0, spec) => {
      const inner = m0.slice(m0.indexOf('{') + 1, m0.lastIndexOf('}')).split(/\s+/).filter(Boolean).join(' ');
      return `import {${inner}} from '${spec}';`;
    });
    const body = [];
    for (const line of text.split('\n')) {
      if (IMPORT_RE.test(line)) continue;
      if (EXPORT_LIST_RE.test(line)) continue;
      body.push(line.startsWith('export ') ? line.slice('export '.length) : line);
    }
    return `// ==== ${path.relative(SRC, f)} ====\n${body.join('\n')}`;
  }).join('\n\n');
}

/** A DOM element stub good enough for code that reads/writes text, classes, dataset and children. */
export function fakeElement(id = '') {
  const el = {
    id, tagName: 'DIV', textContent: '', innerHTML: '', value: '', hidden: false,
    className: '', dataset: {}, children: [], scrollTop: 0,
    style: { setProperty() {}, removeProperty() {}, getPropertyValue() { return ''; } },
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    addEventListener() {}, removeEventListener() {},
    appendChild(c) { el.children.push(c); return c; },
    querySelector() { return null; }, querySelectorAll() { return []; },
    getBoundingClientRect() { return { left: 0, top: 0, width: 100, height: 20, right: 100, bottom: 20 }; },
    focus() {}, blur() {}, remove() {}, closest() { return null; },
    setAttribute() {}, getAttribute() { return null; },
  };
  return el;
}

/** A minimal `document` that hands out fakeElement()s on demand, keyed by id. */
export function fakeDocument() {
  const els = new Map();
  return {
    _els: els,
    getElementById(id) { if (!els.has(id)) els.set(id, fakeElement(id)); return els.get(id); },
    createElement(tag) { const e = fakeElement(''); e.tagName = String(tag).toUpperCase(); return e; },
    querySelector() { return null; }, querySelectorAll() { return []; },
    addEventListener() {}, removeEventListener() {},
    body: fakeElement('body'), documentElement: fakeElement('html'),
  };
}

/** In-memory localStorage-shaped store. */
export function fakeStorage(initial) {
  const map = new Map(Object.entries(initial || {}));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

/**
 * Evaluate the concatenated non-main modules in a fresh vm context and pull out `names` as an object.
 * `sandboxOverrides` merges over sane inert defaults (throwing THREE/mergeVertices, since nothing in
 * lib/data/llm/lab/learn/brain/ui/modes may touch THREE at load time per CONTRACTS.md).
 */
export function loadFullScope(names, sandboxOverrides = {}, dirs = JS_DIRS) {
  const src = bundleSource(dirs) + `\n;({ ${names.join(', ')} })`;
  const sandbox = {
    THREE: new Proxy({}, { get(t, k) { throw new Error(`THREE.${String(k)} touched at module load time`); } }),
    mergeVertices() { throw new Error('mergeVertices called at module load time'); },
    OrbitControls: null, EffectComposer: null, RenderPass: null, UnrealBloomPass: null, OutputPass: null,
    window: undefined, document: undefined, localStorage: undefined, fetch: undefined,
    location: undefined, performance: undefined, console,
    ...sandboxOverrides,
  };
  return vm.runInNewContext(src, vm.createContext(sandbox), { filename: 'full-bundle.js' });
}
