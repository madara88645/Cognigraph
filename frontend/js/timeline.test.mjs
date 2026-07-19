import test from "node:test";
import assert from "node:assert/strict";

import { formatTimelineFrames } from "./timeline.js";

test("formatTimelineFrames formats the current time over the total duration", () => {
  assert.equal(
    formatTimelineFrames({ simMs: 250, durationMs: 1000 }),
    "250 / 1000 · 250 ms"
  );
});

test("formatTimelineFrames floors a fractional simMs", () => {
  assert.equal(
    formatTimelineFrames({ simMs: 250.9, durationMs: 1000 }),
    "250 / 1000 · 250 ms"
  );
});

test("formatTimelineFrames clamps simMs below zero to zero", () => {
  assert.equal(
    formatTimelineFrames({ simMs: -50, durationMs: 1000 }),
    "0 / 1000 · 0 ms"
  );
});

test("formatTimelineFrames clamps simMs above durationMs to durationMs", () => {
  assert.equal(
    formatTimelineFrames({ simMs: 5000, durationMs: 1000 }),
    "1000 / 1000 · 1000 ms"
  );
});

test("formatTimelineFrames floors durationMs at 1 when it is zero", () => {
  assert.equal(
    formatTimelineFrames({ simMs: 0, durationMs: 0 }),
    "0 / 1 · 0 ms"
  );
});

test("formatTimelineFrames floors durationMs at 1 when it is negative", () => {
  assert.equal(
    formatTimelineFrames({ simMs: 0, durationMs: -100 }),
    "0 / 1 · 0 ms"
  );
});
