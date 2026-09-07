#!/usr/bin/env node
// Browser smoke test for dist/index.html. LOCAL ONLY — not part of `node --test`, not run in CI:
// it needs a real Chrome, a real GPU-ish context and the network (three.js + Google Fonts).
//
//   node tests/smoke/smoke.mjs
//
// It drives headless Chrome over the DevTools protocol (no dependencies — Node's own WebSocket) and
// checks the built single file the way a reader meets it: served over http, and opened from file://.
// The bar is ZERO console errors and ZERO uncaught exceptions across every mode, every mode
// transition, every pathway, every region, the Stroop lab, a Learn answer, a Scenario preset, the
// cortex slider, both quality settings, a WebGL context loss/restore round-trip, and a 375x700
// viewport with no horizontal overflow.
//
// Everything it asserts is behaviour the unit tests cannot see: real WebGL, real layout, real events.

import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIST = path.join(ROOT, 'dist', 'index.html');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const HTTP_PORT = 8799;
const CDP_PORT = 9789;
const BOOT_TIMEOUT_MS = 30000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------------------------------------------ tiny CDP client */

class CDP {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.id = 0;
    this.pending = new Map();
    this.handlers = [];
  }

  async connect() {
    this.ws = new WebSocket(this.wsUrl);
    await new Promise((resolve, reject) => {
      this.ws.addEventListener('open', resolve, { once: true });
      this.ws.addEventListener('error', () => reject(new Error('CDP socket failed')), { once: true });
    });
    this.ws.addEventListener('message', (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch (err) { return; }
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message || JSON.stringify(msg.error)));
        else resolve(msg.result);
        return;
      }
      for (const h of this.handlers) h(msg);
    });
  }

  on(fn) { this.handlers.push(fn); }

  send(method, params = {}, sessionId) {
    const id = ++this.id;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify(payload));
      setTimeout(() => {
        if (this.pending.has(id)) { this.pending.delete(id); reject(new Error('CDP timeout: ' + method)); }
      }, 60000);
    });
  }

  close() { try { this.ws.close(); } catch (err) { /* already gone */ } }
}

/* ------------------------------------------------------------------ processes */

async function waitFor(fn, ms, what) {
  const until = Date.now() + ms;
  let last = null;
  while (Date.now() < until) {
    try { const v = await fn(); if (v) return v; } catch (err) { last = err; }
    await sleep(150);
  }
  throw new Error('timed out waiting for ' + what + (last ? ' (' + last.message + ')' : ''));
}

function startServer() {
  const proc = spawn('python3', ['-m', 'http.server', String(HTTP_PORT), '--directory', path.join(ROOT, 'dist')],
    { stdio: 'ignore' });
  return proc;
}

function startChrome(profileDir) {
  const proc = spawn(CHROME, [
    '--headless=new',
    '--remote-debugging-port=' + CDP_PORT,
    '--user-data-dir=' + profileDir,
    '--no-first-run', '--no-default-browser-check', '--disable-extensions',
    '--allow-file-access-from-files',
    '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--window-size=1400,900',
    'about:blank',
  ], { stdio: 'ignore' });
  return proc;
}

/* ------------------------------------------------------------------ page session */

/** Open a fresh tab, wire up error collection, and return helpers bound to it. */
async function openPage(cdp, url) {
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });

  const errors = [];
  const note = (kind, text, extra) => {
    const line = kind + ': ' + String(text).replace(/\s+/g, ' ').trim().slice(0, 400);
    errors.push(extra ? line + ' @ ' + extra : line);
  };
  cdp.on((msg) => {
    if (msg.sessionId !== sessionId) return;
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      note('console.error', msg.params.args.map((a) => a.value ?? a.description ?? a.type).join(' '));
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails;
      note('exception', (d.exception && (d.exception.description || d.exception.value)) || d.text);
    }
    if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') {
      // python -m http.server has no /favicon.ico; the Artifact host and any real deploy do. That 404
      // is the test rig, not the page, so it is the one thing filtered out here.
      if (/\/favicon\.ico$/.test(msg.params.entry.url || '')) return;
      note('log(' + msg.params.entry.source + ')', msg.params.entry.text, msg.params.entry.url);
    }
  });

  await cdp.send('Runtime.enable', {}, sessionId);
  await cdp.send('Log.enable', {}, sessionId);
  await cdp.send('Page.enable', {}, sessionId);

  const evaluate = async (expression, awaitPromise = true) => {
    const res = await cdp.send('Runtime.evaluate', {
      expression, awaitPromise, returnByValue: true, allowUnsafeEvalBlockedByCSP: false,
    }, sessionId);
    if (res.exceptionDetails) {
      const d = res.exceptionDetails;
      throw new Error('page threw: ' + ((d.exception && (d.exception.description || d.exception.value)) || d.text));
    }
    return res.result.value;
  };

  const goto = async (target) => {
    await cdp.send('Page.navigate', { url: target }, sessionId);
    await waitFor(() => evaluate('!!(window.NeuroScope && window.NeuroScope.scene && window.NeuroScope.mode)'),
      BOOT_TIMEOUT_MS, 'the app to boot at ' + target);
    await sleep(600);   // one or two animation frames of settling
  };

  await goto(url);
  return { sessionId, targetId, errors, evaluate, goto, cdp };
}

/* ------------------------------------------------------------------ the checks */

const CHECK_JS = {
  /** Click helper available to every step. */
  helpers: `
    window.__smoke = {
      click(sel) { const el = document.querySelector(sel); if (!el) throw new Error('no element ' + sel); el.click(); return true; },
      sleep(ms) { return new Promise((r) => setTimeout(r, ms)); },
      frames(n) { return new Promise((r) => { let i = 0; const tick = () => (++i >= n ? r(true) : requestAnimationFrame(tick)); requestAnimationFrame(tick); }); },
    };
    true;`,
};

async function runSuite(page, label) {
  const results = [];
  const step = async (name, expression) => {
    const before = page.errors.length;
    let value;
    try { value = await page.evaluate(expression); }
    catch (err) { results.push({ name, ok: false, detail: err.message }); return null; }
    const newErrors = page.errors.slice(before);
    results.push({ name, ok: newErrors.length === 0, detail: newErrors.join(' | '), value });
    return value;
  };

  await page.evaluate(CHECK_JS.helpers);

  await step('boot: 5 modes registered, scene covers 28 regions', `(async () => {
    const app = window.NeuroScope;
    const modes = Object.keys(app.modes).sort().join(',');
    if (modes !== 'atlas,learn,neurons,pathways,scenario') throw new Error('modes: ' + modes);
    if (app.scene.regionIds.length !== 28) throw new Error('regionIds: ' + app.scene.regionIds.length);
    for (const id of app.scene.regionIds) {
      const c = app.scene.centroid(id);
      if (!c || !isFinite(c.x) || !isFinite(c.y) || !isFinite(c.z)) throw new Error('centroid ' + id);
    }
    return app.scene.regionIds.length;
  })()`);

  await step('drawer: every "How this works" tab renders', `(async () => {
    document.getElementById('help-btn').click();
    await window.__smoke.frames(2);
    const tabs = [...document.querySelectorAll('#how-tabs button')];
    if (tabs.length < 8) throw new Error('only ' + tabs.length + ' drawer tabs');
    for (const t of tabs) {
      t.click();
      await window.__smoke.frames(1);
      const body = document.getElementById('how-body').innerHTML;
      if (!body || body.length < 50) throw new Error('empty tab: ' + t.textContent);
      if (/undefined|\\[object Object\\]/.test(body)) throw new Error('junk in tab: ' + t.textContent);
    }
    document.getElementById('how-close').click();
    return tabs.length;
  })()`);

  await step('all 5 modes enter cleanly', `(async () => {
    for (const id of ['pathways', 'atlas', 'neurons', 'scenario', 'learn']) {
      window.switchMode(id);
      await window.__smoke.frames(3);
      if (window.NeuroScope.mode.id !== id) throw new Error('did not enter ' + id);
      if (document.getElementById('app').dataset.mode !== id) throw new Error('chrome not switched for ' + id);
    }
    return 5;
  })()`);

  await step('all 20 ordered mode pairs', `(async () => {
    const ids = ['pathways', 'atlas', 'neurons', 'scenario', 'learn'];
    let n = 0;
    for (const a of ids) for (const b of ids) {
      if (a === b) continue;
      window.switchMode(a); await window.__smoke.frames(2);
      window.switchMode(b); await window.__smoke.frames(2);
      if (window.NeuroScope.mode.id !== b) throw new Error(a + ' -> ' + b + ' failed');
      n++;
    }
    if (n !== 20) throw new Error('only ' + n + ' pairs');
    return n;
  })()`);

  await step('all 8 pathways step to their last step', `(async () => {
    window.switchMode('pathways');
    await window.__smoke.frames(3);
    const items = [...document.querySelectorAll('#pw-list .pw-item')];
    if (items.length !== 8) throw new Error('pathway list has ' + items.length);
    let played = 0;
    for (const item of items) {
      item.click();
      await window.__smoke.sleep(120);
      const steps = document.querySelectorAll('#pw-steps .pw-step').length;
      if (steps < 4) throw new Error('pathway ' + item.dataset.pw + ' shows ' + steps + ' steps');
      for (let i = 1; i < steps; i++) {
        document.getElementById('tl-next').click();
        await window.__smoke.sleep(90);
      }
      const active = document.querySelector('#pw-steps .pw-step.active');
      if (!active || parseInt(active.dataset.step, 10) !== steps - 1) {
        throw new Error('pathway ' + item.dataset.pw + ' did not reach its last step');
      }
      const readout = document.getElementById('timeline-readout').textContent;
      if (!readout || /undefined|NaN/.test(readout)) throw new Error('readout: ' + readout);
      played++;
    }
    return played;
  })()`);

  await step('one pathway plays on its own clock', `(async () => {
    window.switchMode('pathways');
    await window.__smoke.frames(3);
    // selecting a pathway starts playback by itself; the transport button is the pause here
    document.querySelector('#pw-list .pw-item').click();
    await window.__smoke.sleep(5000);
    const active = document.querySelector('#pw-steps .pw-step.active');
    const i = active ? parseInt(active.dataset.step, 10) : -1;
    document.getElementById('tl-play').click();
    await window.__smoke.frames(2);
    if (i < 1) throw new Error('playback did not advance on its own (step ' + i + ')');
    return i;
  })()`);

  await step('28 regions are pickable in Atlas', `(async () => {
    window.switchMode('atlas');
    await window.__smoke.frames(3);
    const app = window.NeuroScope;
    let n = 0;
    for (const id of app.scene.regionIds) {
      app.mode.onPick(id, app, { x: 700, y: 450 });
      await window.__smoke.frames(1);
      if (app.selection !== id) throw new Error('pick did not select ' + id);
      const title = document.getElementById('explain-title').textContent;
      if (!title || /undefined/.test(title)) throw new Error('explain title for ' + id + ': ' + title);
      const body = document.getElementById('explain-body').innerHTML;
      if (/undefined|\\[object Object\\]|NaN/.test(body)) throw new Error('junk in explain for ' + id);
      n++;
    }
    app.mode.onPick(null, app, { x: 0, y: 0 });
    await window.__smoke.frames(1);
    return n;
  })()`);

  await step('Stroop lab opens and closes', `(async () => {
    window.switchMode('pathways');
    await window.__smoke.frames(3);
    window.__smoke.click('.pw-measure');
    await window.__smoke.frames(2);
    const overlay = document.getElementById('lab-overlay');
    if (overlay.hidden) throw new Error('lab overlay did not open');
    if (!overlay.querySelector('.lab-start')) throw new Error('no start button');
    window.__smoke.click('.lab-start');
    await window.__smoke.sleep(400);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await window.__smoke.frames(3);
    if (!document.getElementById('lab-overlay').hidden) throw new Error('lab overlay did not close');
    return true;
  })()`);

  await step('Learn answers a question and moves on', `(async () => {
    window.switchMode('learn');
    await window.__smoke.frames(3);
    window.__smoke.click('#lr-start');
    await window.__smoke.sleep(250);
    const opts = [...document.querySelectorAll('#lr-options .lr-opt')];
    if (opts.length !== 4) throw new Error('learn shows ' + opts.length + ' options');
    const texts = opts.map((o) => o.textContent.trim());
    if (new Set(texts).size !== 4) throw new Error('duplicate options: ' + texts.join(' | '));
    opts[0].click();
    await window.__smoke.sleep(250);
    if (!document.getElementById('lr-next')) throw new Error('no Next after answering');
    document.getElementById('lr-next').click();
    await window.__smoke.sleep(250);
    return texts.length;
  })()`);

  await step('Scenario runs a preset with no key (local heuristic)', `(async () => {
    window.switchMode('scenario');
    await window.__smoke.frames(3);
    try { localStorage.removeItem('cg.openrouter.key'); } catch (e) { /* private mode */ }
    const chip = document.querySelector('.sc-chip');
    if (!chip) throw new Error('no scenario presets');
    chip.click();
    await window.__smoke.sleep(150);
    document.getElementById('sc-run').click();
    await window.__smoke.sleep(1200);
    const steps = document.querySelectorAll('#sc-steps li').length;
    if (steps < 1) throw new Error('scenario produced no steps');
    const html = document.getElementById('side-panel-body').innerHTML;
    if (/undefined|\\[object Object\\]|NaN ms/.test(html)) throw new Error('junk in scenario result');
    const replay = document.getElementById('sc-replay');
    if (replay) { replay.click(); await window.__smoke.sleep(1500); }
    return steps;
  })()`);

  await step('cortex slider and both quality settings', `(async () => {
    window.switchMode('atlas');
    await window.__smoke.frames(2);
    const slider = document.getElementById('cortex-opacity');
    for (const v of ['0', '0.35', '1', '0.63']) {
      slider.value = v;
      slider.dispatchEvent(new Event('input', { bubbles: true }));
      await window.__smoke.frames(2);
    }
    const q = document.getElementById('quality-toggle');
    for (const v of ['high', 'low', 'auto']) {
      q.value = v;
      q.dispatchEvent(new Event('change', { bubbles: true }));
      await window.__smoke.frames(4);
    }
    return true;
  })()`);

  await step('WEBGL_lose_context round-trip rebuilds the renderer', `(async () => {
    const gl = window.NeuroScope.scene.renderer.getContext();
    const ext = gl.getExtension('WEBGL_lose_context');
    if (!ext) throw new Error('WEBGL_lose_context is unavailable in this browser');
    ext.loseContext();
    await window.__smoke.sleep(400);
    if (document.getElementById('webgl-lost').hidden) throw new Error('the lost-context notice never appeared');
    ext.restoreContext();
    await window.__smoke.sleep(1500);
    if (!document.getElementById('webgl-lost').hidden) throw new Error('the lost-context notice never cleared');
    window.NeuroScope.scene.render();
    await window.__smoke.frames(5);
    return true;
  })()`);

  return results;
}

/** Reload at 375x700 and check nothing spills sideways. */
async function runMobile(page, url) {
  await page.cdp.send('Emulation.setDeviceMetricsOverride',
    { width: 375, height: 700, deviceScaleFactor: 2, mobile: true }, page.sessionId);
  await page.goto(url);
  await page.evaluate(CHECK_JS.helpers);
  const before = page.errors.length;
  let detail = '';
  let ok = true;
  try {
    const overflow = await page.evaluate(`(async () => {
      window.switchMode('pathways'); await window.__smoke.frames(3);
      window.switchMode('atlas'); await window.__smoke.frames(3);
      window.switchMode('neurons'); await window.__smoke.frames(3);
      window.switchMode('scenario'); await window.__smoke.frames(3);
      window.switchMode('learn'); await window.__smoke.frames(3);
      const de = document.documentElement;
      const spill = [];
      if (de.scrollWidth > de.clientWidth + 1) spill.push('documentElement ' + de.scrollWidth + ' > ' + de.clientWidth);
      if (document.body.scrollWidth > de.clientWidth + 1) spill.push('body ' + document.body.scrollWidth);
      // Only the right edge can create a horizontal scrollbar; the side panel is deliberately parked
      // off-canvas to the LEFT when it is collapsed, and a negative left never widens the document.
      for (const el of document.querySelectorAll('#app > *')) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) continue;
        if (r.right > de.clientWidth + 1) {
          spill.push((el.id || el.className) + ' [' + Math.round(r.left) + ',' + Math.round(r.right) + ']');
        }
      }
      return spill;
    })()`);
    if (overflow.length) { ok = false; detail = 'horizontal overflow: ' + overflow.join('; '); }
  } catch (err) { ok = false; detail = err.message; }
  const newErrors = page.errors.slice(before);
  if (newErrors.length) { ok = false; detail = (detail ? detail + ' | ' : '') + newErrors.join(' | '); }
  await page.cdp.send('Emulation.clearDeviceMetricsOverride', {}, page.sessionId);
  return { name: 'mobile 375x700: all 5 modes, no horizontal overflow', ok, detail };
}

/* ------------------------------------------------------------------ main */

async function main() {
  if (!existsSync(DIST)) throw new Error('dist/index.html is missing — run python3 build.py first');
  if (!existsSync(CHROME)) throw new Error('Google Chrome not found at ' + CHROME);

  const profile = mkdtempSync(path.join(tmpdir(), 'cg-smoke-'));
  const server = startServer();
  const chrome = startChrome(profile);
  let failures = 0;

  try {
    await waitFor(async () => (await fetch('http://127.0.0.1:' + HTTP_PORT + '/index.html')).ok, 15000, 'the http server');
    const version = await waitFor(async () => (await fetch('http://127.0.0.1:' + CDP_PORT + '/json/version')).json(),
      20000, 'Chrome DevTools');

    const cdp = new CDP(version.webSocketDebuggerUrl);
    await cdp.connect();

    const targets = [
      ['http://127.0.0.1:' + HTTP_PORT + '/index.html', 'served over http'],
      [pathToFileURL(DIST).href, 'opened from file://'],
    ];

    for (const [url, label] of targets) {
      process.stdout.write('\n=== ' + label + ' — ' + url + '\n');
      const page = await openPage(cdp, url);
      const results = await runSuite(page, label);
      results.push(await runMobile(page, url));
      for (const r of results) {
        const mark = r.ok ? 'PASS' : 'FAIL';
        if (!r.ok) failures++;
        process.stdout.write('  ' + mark + '  ' + r.name + (r.detail ? '\n        ' + r.detail : '') + '\n');
      }
      const stray = page.errors.length;
      process.stdout.write('  ' + (stray ? 'FAIL' : 'PASS') + '  total console errors / exceptions: ' + stray + '\n');
      if (stray) {
        failures++;
        for (const e of page.errors.slice(0, 25)) process.stdout.write('        ' + e + '\n');
      }
      await cdp.send('Target.closeTarget', { targetId: page.targetId });
    }
    cdp.close();
  } finally {
    try { chrome.kill('SIGKILL'); } catch (err) { /* already gone */ }
    try { server.kill('SIGKILL'); } catch (err) { /* already gone */ }
    await sleep(200);
    try { rmSync(profile, { recursive: true, force: true }); } catch (err) { /* leave it */ }
  }

  process.stdout.write('\n' + (failures ? failures + ' FAILING check(s)\n' : 'all checks passed\n'));
  process.exit(failures ? 1 : 0);
}

main().catch((err) => { console.error(err); process.exit(1); });
