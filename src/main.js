// CogniGraph (v2, codename NeuroScope) boot. Owned by the orchestrator. Modes register themselves via the MODES map below.
// Every other file defines functions/consts only — no top-level side effects except here.
import { createScene } from './brain/scene.js';
import { initUI, setModeChrome, explain, toast } from './ui/panels.js';
import { initGlossary } from './ui/glossary.js';
import { AtlasMode } from './modes/atlas.js';
import { PathwaysMode } from './modes/pathways.js';
import { NeuronsMode } from './modes/neurons-ui.js';
import { ScenarioMode } from './modes/scenario.js';
import { LearnMode } from './modes/learn.js';

const app = {
  scene: null,
  mode: null,          // active mode object
  modes: {},           // id -> mode object
  selection: null,     // currently selected regionId (atlas)
  lesions: new Set(),  // lesioned regionIds (atlas)
  quality: 'auto',
  time: 0,
  // shared neuromodulator state (0..1, baseline = the Neurons slider defaults). Written by Neurons/Scenario, read by Pathways timing.
  modulators: { dopamine: 0.25, acetylcholine: 0.3, noradrenaline: 0.3, serotonin: 0.5, gaba: 0.5, cortisol: 0.2 },
  measure: {},          // personal measurements (e.g. measure.stroop = {meanRt, interference, n, at}) loaded from localStorage by lab/
};
window.switchMode = (id) => switchMode(id);

async function boot() {
  window.CogniGraph = app; window.NeuroScope = app; // debug/verification handles (used by browser checks)
  const canvas = document.getElementById('stage');
  app.scene = await createScene(canvas, { quality: app.quality });
  app.modes = { atlas: AtlasMode, pathways: PathwaysMode, neurons: NeuronsMode, scenario: ScenarioMode, learn: LearnMode };
  initUI(app, switchMode);
  if (typeof initGlossary === 'function') initGlossary(app);
  // drawer tabs are registered at boot so the ? button shows all of them before any mode has been visited
  for (const fn of ['atlasRegisterRenderingTab', 'registerHowTabs', 'scRegisterSettings']) {
    try { if (typeof globalThis[fn] === 'function') globalThis[fn](); } catch (e) { console.warn('drawer tab registration failed:', fn, e); }
  }

  app.scene.onPick((id, pos) => app.mode && app.mode.onPick && app.mode.onPick(id, app, pos));
  app.scene.onHover((id, pos) => app.mode && app.mode.onHover && app.mode.onHover(id, app, pos));

  switchMode('pathways'); // land on the narrating mode; Atlas assumes you already know what you want
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000); last = now; app.time += dt;
    if (app.mode && app.mode.update) app.mode.update(dt, app);
    app.scene.update(dt);
    app.scene.render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

function switchMode(id) {
  if (!app.modes[id] || app.mode === app.modes[id]) return;
  if (app.mode && app.mode.exit) app.mode.exit(app);
  app.scene.clearHighlights();
  app.mode = app.modes[id];
  if (app.scene.setIdleRotate) app.scene.setIdleRotate(true); // modes that animate (Pathways play) switch it off themselves
  setModeChrome(id, app.mode);
  app.mode.enter(app);
}

boot().catch((err) => {
  console.error(err);
  explain({ title: 'Could not start', html: `<p class="muted">${String(err && err.message || err)}</p>` });
});
