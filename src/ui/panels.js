// Shared UI chrome: mode switcher, explain panel, side panel, drawer, toast, keyboard, view controls.
// Owned by the orchestrator. Modes call explain()/setSidePanel()/registerDrawerTab()/toast().

const $ = (id) => document.getElementById(id);
const drawerTabs = []; // {id, label, html}
let appRef = null;
let switchModeFn = null;

export function initUI(app, switchMode) {
  appRef = app; switchModeFn = switchMode;
  document.querySelectorAll('.mode-pill').forEach((b) => b.addEventListener('click', () => switchMode(b.dataset.mode)));
  $('side-panel-toggle').addEventListener('click', () => setPanelCollapsed(true));
  $('panel-open').addEventListener('click', () => setPanelCollapsed(false));
  if (window.innerWidth < 760) setPanelCollapsed(true);
  $('help-btn').addEventListener('click', () => (isDrawerOpen() ? closeDrawer() : openDrawer()));
  $('how-close').addEventListener('click', closeDrawer);
  $('quality-toggle').addEventListener('change', (e) => { app.quality = e.target.value; app.scene.setQuality(app.quality); });
  $('cortex-opacity').addEventListener('input', (e) => app.scene.setCortexOpacity(parseFloat(e.target.value)));
  $('reset-view').addEventListener('click', () => app.scene.resetView());
  $('webgl-reload').addEventListener('click', () => location.reload());
  window.addEventListener('keydown', onKey);
  registerDrawerTab('about', 'About', `
    <p><strong>CogniGraph</strong> is an educational simulation that runs entirely in your browser. Nothing is measured, stored or sent anywhere.</p>
    <p>Four modes: <strong>Pathways</strong> replays textbook sequences, <strong>Atlas</strong> inspects regions and lesions, <strong>Neurons</strong> runs a small spiking network, <strong>Scenario</strong> turns a sentence into a sequence.</p>
    <p class="muted">Every labelled region is a simplified hub, and the millisecond values are group averages. The other tabs say what is physiology and what is metaphor.</p>`);
}

function onKey(e) {
  if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT')) return;
  if (e.key === 'Escape') { closeDrawer(); hidePopover(); if (window.innerWidth >= 760) setPanelCollapsed(false); return; }
  // the active mode gets first refusal (Learn uses 1-4 for answers, Pathways uses arrows/space)
  if (appRef.mode && appRef.mode.onKey && appRef.mode.onKey(e, appRef)) { e.preventDefault(); return; }
  if (e.key === '1') return switchModeFn('pathways');
  if (e.key === '2') return switchModeFn('atlas');
  if (e.key === '3') return switchModeFn('neurons');
  if (e.key === '4') return switchModeFn('scenario');
  if (e.key === '5') return switchModeFn('learn');
  if (e.key === '?') return openDrawer();
  if (e.key === 'r' || e.key === 'R') return appRef.scene.resetView();
}

export function setModeChrome(id, mode) {
  $('app').dataset.mode = id;
  document.querySelectorAll('.mode-pill').forEach((b) => b.classList.toggle('active', b.dataset.mode === id));
  showTimeline(false); showNeuronPlots(false);
}

/** Update the persistent Explain panel. html is trusted app-authored markup; glossary terms get auto-linked. */
export function explain({ title, html, badge, badgeClass }) {
  $('explain-title').textContent = title || '';
  const linked = (typeof linkTerms === 'function') ? linkTerms(html || '') : (html || '');
  $('explain-body').innerHTML = linked;
  const b = $('explain-badge');
  if (badge) { b.textContent = badge; b.className = 'badge ' + (badgeClass || ''); b.hidden = false; } else { b.hidden = true; }
  $('explain-panel').scrollTop = 0;
}

/** Replace the side panel content. Accepts an HTML string or an Element. */
export function setSidePanel(content) {
  const body = $('side-panel-body');
  body.innerHTML = '';
  if (typeof content === 'string') body.innerHTML = content; else if (content) body.appendChild(content);
  if (window.innerWidth >= 760) setPanelCollapsed(false);
  return body;
}

/** Collapse/expand the side panel; on narrow viewports it is an overlay and starts collapsed. */
export function setPanelCollapsed(on) {
  $('side-panel').classList.toggle('collapsed', on);
  $('app').classList.toggle('panel-collapsed', on);
}

export function showTimeline(on) { $('timeline').hidden = !on; }
export function showNeuronPlots(on) { $('neuron-plots').hidden = !on; }

export function toast(msg, ms = 2200) {
  const t = $('toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(t._timer); t._timer = setTimeout(() => { t.hidden = true; }, ms);
}

export function registerDrawerTab(id, label, html) {
  const i = drawerTabs.findIndex((t) => t.id === id);
  if (i >= 0) drawerTabs[i] = { id, label, html }; else drawerTabs.push({ id, label, html });
}
export function isDrawerOpen() { return !$('how-drawer').hidden; }
export function openDrawer(tabId) {
  const drawer = $('how-drawer'); drawer.hidden = false;
  const tabs = $('how-tabs'); tabs.innerHTML = '';
  const active = tabId || (tabs.dataset.active) || (drawerTabs[0] && drawerTabs[0].id);
  drawerTabs.forEach((t) => {
    const b = document.createElement('button'); b.textContent = t.label; b.className = t.id === active ? 'active' : '';
    b.addEventListener('click', () => openDrawer(t.id)); tabs.appendChild(b);
  });
  tabs.dataset.active = active;
  const t = drawerTabs.find((x) => x.id === active);
  const html = t ? t.html : '';
  $('how-body').innerHTML = (typeof linkTerms === 'function') ? linkTerms(html) : html;
}
export function closeDrawer() { $('how-drawer').hidden = true; }
export function hidePopover() { const p = $('glossary-popover'); if (p) p.hidden = true; }

/** Position the floating hover label near the cursor. Pass null to hide. */
export function hoverLabel(text, pos) {
  const el = $('hover-label');
  if (!text) { el.hidden = true; return; }
  el.textContent = text; el.hidden = false; el.style.left = pos.x + 'px'; el.style.top = pos.y + 'px';
}
