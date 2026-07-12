import test from "node:test";
import assert from "node:assert/strict";

import { formatTimelineFrames } from "./timeline.js";

test("formats current frame and total duration", () => {
  assert.equal(formatTimelineFrames({ simMs: 120, durationMs: 500 }), "120 / 500 · 120 ms");
});

test("floors a fractional simMs", () => {
  assert.equal(formatTimelineFrames({ simMs: 120.9, durationMs: 500 }), "120 / 500 · 120 ms");
});

test("clamps negative simMs to zero", () => {
  assert.equal(formatTimelineFrames({ simMs: -50, durationMs: 500 }), "0 / 500 · 0 ms");
});

test("clamps simMs above durationMs to durationMs", () => {
  assert.equal(formatTimelineFrames({ simMs: 999, durationMs: 500 }), "500 / 500 · 500 ms");
});

test("treats a zero or negative durationMs as at least 1ms total", () => {
  assert.equal(formatTimelineFrames({ simMs: 0, durationMs: 0 }), "0 / 1 · 0 ms");
  assert.equal(formatTimelineFrames({ simMs: 10, durationMs: -5 }), "0 / 1 · 0 ms");
});
