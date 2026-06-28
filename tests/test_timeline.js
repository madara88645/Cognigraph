// Unit tests for frontend/js/timeline.js
// Run with: node --test tests/test_timeline.js

import test from "node:test";
import assert from "node:assert/strict";

import { formatTimelineFrames } from "../frontend/js/timeline.js";

// ---------------------------------------------------------------------------
// Normal mid-range values
// ---------------------------------------------------------------------------

test("formats a typical mid-simulation position", () => {
  const result = formatTimelineFrames({ simMs: 300, durationMs: 1000 });
  assert.equal(result, "300 / 1000 · 300 ms");
});

test("formats when simMs equals durationMs (end of timeline)", () => {
  const result = formatTimelineFrames({ simMs: 1000, durationMs: 1000 });
  assert.equal(result, "1000 / 1000 · 1000 ms");
});

test("formats when simMs is zero (start of timeline)", () => {
  const result = formatTimelineFrames({ simMs: 0, durationMs: 500 });
  assert.equal(result, "0 / 500 · 0 ms");
});

// ---------------------------------------------------------------------------
// Clamping behaviour
// ---------------------------------------------------------------------------

test("clamps simMs above durationMs to durationMs", () => {
  const result = formatTimelineFrames({ simMs: 1500, durationMs: 1000 });
  // t = max(0, min(1000, floor(1500))) = 1000
  assert.equal(result, "1000 / 1000 · 1000 ms");
});

test("clamps negative simMs to 0", () => {
  const result = formatTimelineFrames({ simMs: -50, durationMs: 800 });
  // t = max(0, min(800, floor(-50))) = 0
  assert.equal(result, "0 / 800 · 0 ms");
});

// ---------------------------------------------------------------------------
// Floor behaviour for fractional simMs
// ---------------------------------------------------------------------------

test("floors a fractional simMs value", () => {
  const result = formatTimelineFrames({ simMs: 499.9, durationMs: 1000 });
  // floor(499.9) = 499
  assert.equal(result, "499 / 1000 · 499 ms");
});

test("floors simMs of exactly 0.5 down to 0", () => {
  const result = formatTimelineFrames({ simMs: 0.5, durationMs: 1000 });
  assert.equal(result, "0 / 1000 · 0 ms");
});

// ---------------------------------------------------------------------------
// Zero durationMs guard (tot = max(1, durationMs))
// ---------------------------------------------------------------------------

test("uses 1 as denominator when durationMs is 0 to avoid 0/0", () => {
  const result = formatTimelineFrames({ simMs: 0, durationMs: 0 });
  // tot = max(1, 0) = 1; t = max(0, min(0, 0)) = 0
  assert.equal(result, "0 / 1 · 0 ms");
});

test("uses 1 as denominator when durationMs is negative", () => {
  const result = formatTimelineFrames({ simMs: 0, durationMs: -100 });
  // t = max(0, min(-100, 0)) = 0; tot = max(1, -100) = 1
  assert.equal(result, "0 / 1 · 0 ms");
});
