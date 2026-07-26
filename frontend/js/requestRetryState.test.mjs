import test from "node:test";
import assert from "node:assert/strict";

import {
  clearRetryState,
  markRetryableFailure,
  syncRetryStateWithPrompt,
} from "./requestRetryState.js";

test("clearRetryState resets retry flags and returns the same object", () => {
  const state = { retryAvailable: true, lastFailureKind: "network", lastPrompt: "hi" };
  const result = clearRetryState(state);
  assert.equal(result, state);
  assert.equal(state.retryAvailable, false);
  assert.equal(state.lastFailureKind, "");
});

test("markRetryableFailure records the trimmed prompt and failure kind", () => {
  const state = {};
  markRetryableFailure(state, { prompt: "  hello world  ", kind: "http" });
  assert.equal(state.lastPrompt, "hello world");
  assert.equal(state.retryAvailable, true);
  assert.equal(state.lastFailureKind, "http");
});

test("markRetryableFailure defaults a missing prompt/kind to empty strings", () => {
  const state = {};
  markRetryableFailure(state, {});
  assert.equal(state.lastPrompt, "");
  assert.equal(state.lastFailureKind, "");
  assert.equal(state.retryAvailable, true);
});

test("syncRetryStateWithPrompt clears retry availability when the prompt changed", () => {
  const state = { retryAvailable: true, lastPrompt: "original", lastFailureKind: "network" };
  syncRetryStateWithPrompt(state, "edited");
  assert.equal(state.retryAvailable, false);
  assert.equal(state.lastFailureKind, "");
});

test("syncRetryStateWithPrompt keeps retry availability when the prompt is unchanged", () => {
  const state = { retryAvailable: true, lastPrompt: "same", lastFailureKind: "network" };
  syncRetryStateWithPrompt(state, "same");
  assert.equal(state.retryAvailable, true);
  assert.equal(state.lastFailureKind, "network");
});

test("syncRetryStateWithPrompt is a no-op when retry was not available", () => {
  const state = { retryAvailable: false, lastPrompt: "", lastFailureKind: "" };
  syncRetryStateWithPrompt(state, "anything");
  assert.equal(state.retryAvailable, false);
});

test("syncRetryStateWithPrompt trims the incoming prompt before comparing", () => {
  const state = { retryAvailable: true, lastPrompt: "same", lastFailureKind: "network" };
  syncRetryStateWithPrompt(state, "  same  ");
  assert.equal(state.retryAvailable, true, "trimmed prompt should still match");
});
