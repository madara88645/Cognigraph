import test from "node:test";
import assert from "node:assert/strict";

import {
  parsePanelState,
  isCollapsed,
  withPanelState,
  togglePanelState,
  PANEL_CONFIG,
} from "./panelLayout.js";

test("parsePanelState returns empty object for blank/invalid input", () => {
  assert.deepEqual(parsePanelState(""), {});
  assert.deepEqual(parsePanelState(null), {});
  assert.deepEqual(parsePanelState("not json"), {});
  assert.deepEqual(parsePanelState("[1,2,3]"), {});
});

test("parsePanelState keeps only known values", () => {
  const raw = JSON.stringify({ input: "collapsed", analysis: "open", bogus: "maybe" });
  assert.deepEqual(parsePanelState(raw), { input: "collapsed", analysis: "open" });
});

test("isCollapsed reflects the stored value", () => {
  const state = { input: "collapsed", analysis: "open" };
  assert.equal(isCollapsed(state, "input"), true);
  assert.equal(isCollapsed(state, "analysis"), false);
  assert.equal(isCollapsed(state, "missing"), false);
  assert.equal(isCollapsed(null, "input"), false);
});

test("withPanelState sets a key without mutating the original", () => {
  const state = { input: "open" };
  const next = withPanelState(state, "log", true);
  assert.deepEqual(next, { input: "open", log: "collapsed" });
  assert.deepEqual(state, { input: "open" }, "original is untouched");
});

test("togglePanelState flips, defaulting an unseen panel to collapsed", () => {
  const opened = togglePanelState({}, "signatures");
  assert.equal(opened.signatures, "collapsed");
  const closedAgain = togglePanelState(opened, "signatures");
  assert.equal(closedAgain.signatures, "open");
});

test("round-trip survives serialize → parse", () => {
  let state = {};
  state = togglePanelState(state, "input");
  state = togglePanelState(state, "log");
  assert.deepEqual(parsePanelState(JSON.stringify(state)), {
    input: "collapsed",
    log: "collapsed",
  });
});

test("every configured panel has a unique key and selector", () => {
  const keys = PANEL_CONFIG.map((c) => c.key);
  const selectors = PANEL_CONFIG.map((c) => c.selector);
  assert.equal(new Set(keys).size, keys.length, "keys are unique");
  assert.equal(new Set(selectors).size, selectors.length, "selectors are unique");
  for (const cfg of PANEL_CONFIG) {
    assert.ok(cfg.type === "accordion" || cfg.type === "dock", `valid type for ${cfg.key}`);
  }
});
