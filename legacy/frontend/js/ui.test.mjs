// Node test for the pure UI helpers in frontend/js/ui.js.
// Run with:
//   node --import ../../tests/helpers/registerThreeStub.js --test frontend/js/ui.test.mjs
//
// ui.js imports "three" (loaded via a browser import map, not an npm
// package), so the run must go through the registered stub loader — see
// tests/helpers/registerThreeStub.js and tests/helpers/threeStubLoader.js.

import test from "node:test";
import assert from "node:assert/strict";

import {
  hexToThreeColor,
  mergeVfxProfile,
  neuromodPillTextClass,
  isCortisolOptimalIntensity,
  cortisolRegimeLabel,
  formatNeuromodIntensityLabel,
  hpaContextHintText,
  hpaHelpToastMessage,
} from "./ui.js";
import { DEFAULT_VFX } from "./constants.js";

// --- hexToThreeColor ---------------------------------------------------

test("hexToThreeColor parses a valid 6-digit hex string", () => {
  const c = hexToThreeColor("#FF00FF");
  assert.equal(c.hex, 0xff00ff);
});

test("hexToThreeColor accepts hex without a leading #", () => {
  const c = hexToThreeColor("00FF00");
  assert.equal(c.hex, 0x00ff00);
});

test("hexToThreeColor falls back to the default cyan for invalid input", () => {
  assert.equal(hexToThreeColor("not-a-color").hex, 0xe0ffff);
  assert.equal(hexToThreeColor("#ZZZZZZ").hex, 0xe0ffff);
  assert.equal(hexToThreeColor("#fff").hex, 0xe0ffff);
  assert.equal(hexToThreeColor(undefined).hex, 0xe0ffff);
  assert.equal(hexToThreeColor(null).hex, 0xe0ffff);
});

test("hexToThreeColor trims surrounding whitespace", () => {
  assert.equal(hexToThreeColor("  #AABBCC  ").hex, 0xaabbcc);
});

// --- mergeVfxProfile -----------------------------------------------------

test("mergeVfxProfile returns the defaults when raw is missing or not an object", () => {
  assert.deepEqual(mergeVfxProfile(undefined), DEFAULT_VFX);
  assert.deepEqual(mergeVfxProfile(null), DEFAULT_VFX);
  assert.deepEqual(mergeVfxProfile("not-an-object"), DEFAULT_VFX);
  assert.deepEqual(mergeVfxProfile(42), DEFAULT_VFX);
});

test("mergeVfxProfile overrides numeric fields with finite numbers only", () => {
  const merged = mergeVfxProfile({ bloom_mult: 2.5, tween_in_ms: 100 });
  assert.equal(merged.bloom_mult, 2.5);
  assert.equal(merged.tween_in_ms, 100);
  assert.equal(merged.tween_out_ms, DEFAULT_VFX.tween_out_ms);
});

test("mergeVfxProfile rejects non-finite or wrongly-typed numeric fields", () => {
  const merged = mergeVfxProfile({
    bloom_mult: Infinity,
    tween_in_ms: NaN,
    burst_threshold: "0.9",
  });
  assert.equal(merged.bloom_mult, DEFAULT_VFX.bloom_mult);
  assert.equal(merged.tween_in_ms, DEFAULT_VFX.tween_in_ms);
  assert.equal(merged.burst_threshold, DEFAULT_VFX.burst_threshold);
});

test("mergeVfxProfile accepts a well-formed 6-digit glow_hex string", () => {
  const valid = mergeVfxProfile({ glow_hex: "#123ABC" });
  assert.equal(valid.glow_hex, "#123ABC");
});

test("mergeVfxProfile rejects a malformed glow_hex string and keeps the default", () => {
  const invalid = mergeVfxProfile({ glow_hex: "not-hex" });
  assert.equal(invalid.glow_hex, DEFAULT_VFX.glow_hex);
});

test("mergeVfxProfile falls through to the generic numeric branch for a numeric glow_hex", () => {
  const numeric = mergeVfxProfile({ glow_hex: 123456 });
  assert.equal(numeric.glow_hex, 123456);
});

test("mergeVfxProfile ignores keys not present in DEFAULT_VFX", () => {
  const merged = mergeVfxProfile({ made_up_field: 999 });
  assert.equal(merged.made_up_field, undefined);
});

// --- neuromodPillTextClass ------------------------------------------------

test("neuromodPillTextClass uses dark text on light pill colors", () => {
  assert.equal(neuromodPillTextClass("#E0FFFF"), "text-slate-900");
  assert.equal(neuromodPillTextClass("#ffd700"), "text-slate-900");
  assert.equal(neuromodPillTextClass("#FFBF00"), "text-slate-900");
  assert.equal(neuromodPillTextClass("#fff8f0"), "text-slate-900");
});

test("neuromodPillTextClass uses light text on other colors, including missing input", () => {
  assert.equal(neuromodPillTextClass("#123456"), "text-white");
  assert.equal(neuromodPillTextClass(undefined), "text-white");
  assert.equal(neuromodPillTextClass(""), "text-white");
});

// --- isCortisolOptimalIntensity / cortisolRegimeLabel ---------------------

test("isCortisolOptimalIntensity is true at and below the 0.5 boundary", () => {
  assert.equal(isCortisolOptimalIntensity(0), true);
  assert.equal(isCortisolOptimalIntensity(0.5), true);
});

test("isCortisolOptimalIntensity is false above the 0.5 boundary", () => {
  assert.equal(isCortisolOptimalIntensity(0.51), false);
  assert.equal(isCortisolOptimalIntensity(1), false);
});

test("cortisolRegimeLabel matches the intensity boundary", () => {
  assert.equal(cortisolRegimeLabel(0.5), "Optimal");
  assert.equal(cortisolRegimeLabel(0.51), "Chronic load");
});

// --- formatNeuromodIntensityLabel -----------------------------------------

test("formatNeuromodIntensityLabel rounds to a whole percentage for non-cortisol mods", () => {
  assert.equal(formatNeuromodIntensityLabel("dopamine", 0.734), "73%");
});

test("formatNeuromodIntensityLabel clamps out-of-range intensities into [0, 1]", () => {
  assert.equal(formatNeuromodIntensityLabel("dopamine", -1), "0%");
  assert.equal(formatNeuromodIntensityLabel("dopamine", 5), "100%");
});

test("formatNeuromodIntensityLabel appends the regime label for cortisol", () => {
  assert.equal(formatNeuromodIntensityLabel("cortisol", 0.2), "20% · Optimal");
  assert.equal(formatNeuromodIntensityLabel("cortisol", 0.8), "80% · Chronic load");
});

// --- hpaContextHintText -----------------------------------------------------

test("hpaContextHintText is empty for non-cortisol modulators", () => {
  assert.equal(hpaContextHintText("dopamine", 0.2), "");
  assert.equal(hpaContextHintText("serotonin", 0.9), "");
});

test("hpaContextHintText reflects the cortisol regime", () => {
  assert.equal(hpaContextHintText("cortisol", 0.3), "HPA: acute (optimal).");
  assert.equal(hpaContextHintText("cortisol", 0.9), "HPA: chronic load.");
});

// --- hpaHelpToastMessage -----------------------------------------------------

test("hpaHelpToastMessage explains the optimal cortisol regime", () => {
  const msg = hpaHelpToastMessage("cortisol", 0.3);
  assert.match(msg, /optimal acute arousal/);
  assert.match(msg, /not a lab cortisol value\./);
});

test("hpaHelpToastMessage explains the chronic/toxic cortisol regime", () => {
  const msg = hpaHelpToastMessage("cortisol", 0.9);
  assert.match(msg, /chronic\/toxic load/);
  assert.match(msg, /floods non-active lobes with noise/);
});

test("hpaHelpToastMessage returns the generic explainer for non-cortisol modulators", () => {
  const msg = hpaHelpToastMessage("dopamine", 0.5);
  assert.match(msg, /When cortisol is the dominant modulator/);
  assert.match(msg, /classroom visualization, not medical measurement/);
});
