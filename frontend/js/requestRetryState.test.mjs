import test from "node:test";
import assert from "node:assert/strict";

import {
  clearRetryState,
  markRetryableFailure,
  syncRetryStateWithPrompt,
} from "./requestRetryState.js";

test("clearRetryState: resets availability and failure kind, mutates in place", () => {
  const state = { retryAvailable: true, lastFailureKind: "network", lastPrompt: "hi" };
  const result = clearRetryState(state);
  assert.equal(result, state, "returns the same object reference");
  assert.equal(state.retryAvailable, false);
  assert.equal(state.lastFailureKind, "");
  assert.equal(state.lastPrompt, "hi", "lastPrompt is left untouched by clearRetryState");
});

test("markRetryableFailure: records a trimmed prompt, kind, and flips availability on", () => {
  const state = {};
  const result = markRetryableFailure(state, { prompt: "  do the thing  ", kind: "http" });
  assert.equal(result, state);
  assert.equal(state.lastPrompt, "do the thing");
  assert.equal(state.retryAvailable, true);
  assert.equal(state.lastFailureKind, "http");
});

test("markRetryableFailure: defaults prompt and kind when missing", () => {
  const state = {};
  markRetryableFailure(state, {});
  assert.equal(state.lastPrompt, "");
  assert.equal(state.lastFailureKind, "");
  assert.equal(state.retryAvailable, true);
});

test("syncRetryStateWithPrompt: no-op when retry is not available", () => {
  const state = { retryAvailable: false, lastFailureKind: "network", lastPrompt: "old" };
  syncRetryStateWithPrompt(state, "something new");
  assert.equal(state.retryAvailable, false);
  assert.equal(state.lastFailureKind, "network", "untouched when retry was never available");
});

test("syncRetryStateWithPrompt: keeps retry state when the prompt is unchanged", () => {
  const state = { retryAvailable: true, lastFailureKind: "network", lastPrompt: "same prompt" };
  syncRetryStateWithPrompt(state, "  same prompt  ");
  assert.equal(state.retryAvailable, true, "trimmed prompt still matches lastPrompt");
  assert.equal(state.lastFailureKind, "network");
});

test("syncRetryStateWithPrompt: clears retry state once the prompt has been edited", () => {
  const state = { retryAvailable: true, lastFailureKind: "network", lastPrompt: "old prompt" };
  const result = syncRetryStateWithPrompt(state, "edited prompt");
  assert.equal(result, state);
  assert.equal(state.retryAvailable, false);
  assert.equal(state.lastFailureKind, "");
});
