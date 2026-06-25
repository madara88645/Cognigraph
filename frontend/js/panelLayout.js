/*
 * panelLayout.js — desktop panel collapse/expand with localStorage persistence.
 *
 * Lets the user fold floating panels to reclaim screen space for the 3D brain
 * without losing them. Two collapse flavors, both accordion at heart:
 *   - "accordion" (Sequence Input, Analysis): body folds, the full-width header
 *     bar stays put with a chevron to re-expand.
 *   - "dock" (Signatures, Event Log): body folds AND the panel shrinks to a
 *     compact in-place chip, reading like an edge tab you click to restore.
 *
 * Desktop only: the collapse controls are CSS-hidden ≤768px, where mobile.js
 * relocates the same panels into bottom-sheet drawers. This module never moves
 * nodes, so it composes with mobile.js — it only toggles a data attribute.
 *
 * Per-panel open/collapsed state persists under one localStorage key so the
 * layout survives reloads; private-mode failures degrade silently to all-open.
 */

export const PANEL_STORAGE_KEY = "cg-panel-state";

export const PANEL_CONFIG = [
  { key: "input",      selector: ".cognigraph-input-panel",      type: "accordion" },
  { key: "analysis",   selector: ".analysis-panel",              type: "accordion" },
  { key: "signatures", selector: ".cognigraph-signatures-panel", type: "dock" },
  { key: "log",        selector: ".cognigraph-log-panel",        type: "dock" },
];

/* ── Pure state helpers (unit-tested, no DOM) ───────────────────────────── */

/** Parse persisted JSON into a clean {key: "open"|"collapsed"} map. */
export function parsePanelState(raw) {
  if (!raw) return {};
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  const out = {};
  for (const [k, v] of Object.entries(parsed)) {
    if (v === "collapsed" || v === "open") out[k] = v;
  }
  return out;
}

export function isCollapsed(state, key) {
  return state != null && state[key] === "collapsed";
}

export function withPanelState(state, key, collapsed) {
  return { ...state, [key]: collapsed ? "collapsed" : "open" };
}

/** Flip a panel's state, defaulting an unseen panel (open) to collapsed. */
export function togglePanelState(state, key) {
  return withPanelState(state, key, !isCollapsed(state, key));
}

/* ── DOM wiring (browser only) ──────────────────────────────────────────── */

function readState(storage) {
  try {
    return parsePanelState(storage.getItem(PANEL_STORAGE_KEY));
  } catch {
    return {};
  }
}

function writeState(storage, state) {
  try {
    storage.setItem(PANEL_STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* private mode / disabled storage: keep working, just don't persist */
  }
}

function applyPanel(panel, key, collapsed) {
  panel.setAttribute("data-cg-collapsed", collapsed ? "true" : "false");
  // Mirror the input panel's folded state onto the shell so the results rail
  // (a sibling subtree) can react with a plain descendant selector.
  if (key === "input") {
    const shell = panel.closest(".cognigraph-shell");
    if (shell) shell.setAttribute("data-cg-input-folded", collapsed ? "true" : "false");
  }
  const toggle = panel.querySelector(`[data-cg-toggle="${key}"]`);
  if (toggle) {
    toggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
    const verb = collapsed ? "Expand" : "Collapse";
    toggle.setAttribute("aria-label", `${verb} panel`);
    toggle.setAttribute("title", `${verb} panel`);
  }
}

let activeDoc = null;
let activeStorage = null;

/**
 * Wire up the collapse toggles and restore persisted state.
 * Safe to call once after the DOM is ready; missing panels are skipped.
 */
export function initPanelLayout({ doc = document, storage = window.localStorage } = {}) {
  activeDoc = doc;
  activeStorage = storage;
  const state = readState(storage);

  for (const cfg of PANEL_CONFIG) {
    const panel = doc.querySelector(cfg.selector);
    if (!panel) continue;

    applyPanel(panel, cfg.key, isCollapsed(state, cfg.key));

    const toggle = panel.querySelector(`[data-cg-toggle="${cfg.key}"]`);
    if (!toggle) continue;
    // Read the live DOM state so programmatic changes (setPanelCollapsed) and
    // manual toggles never diverge.
    toggle.addEventListener("click", () => {
      const next = panel.getAttribute("data-cg-collapsed") !== "true";
      applyPanel(panel, cfg.key, next);
      writeState(storage, withPanelState(readState(storage), cfg.key, next));
    });
  }
}

/**
 * Collapse or expand a panel from code — e.g. fold the input panel once a
 * simulation populates the results so the readout gets the full rail. Applies
 * to the DOM immediately; `persist` defaults to false so a transient
 * auto-collapse doesn't outlive a reload.
 */
export function setPanelCollapsed(key, collapsed, { persist = false } = {}) {
  const doc = activeDoc || document;
  const cfg = PANEL_CONFIG.find((c) => c.key === key);
  if (!cfg) return;
  const panel = doc.querySelector(cfg.selector);
  if (!panel) return;
  applyPanel(panel, key, collapsed);
  if (persist && activeStorage) {
    writeState(activeStorage, withPanelState(readState(activeStorage), key, collapsed));
  }
}
