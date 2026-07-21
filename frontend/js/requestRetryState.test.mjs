import test from "node:test";
import assert from "node:assert/strict";

import {
  clearRetryState,
  markRetryableFailure,
  syncRetryStateWithPrompt,
} from "./requestRetryState.js";

test("clearRetryState resets retry flags", () => {
  const state = { retryAvailable: true, lastFailureKind: "network", lastPrompt: "hi" };
  const result = clearRetryState(state);
  assert.equal(result.retryAvailable, false);
  assert.equal(result.lastFailureKind, "");
  assert.equal(result, state);
});

test("markRetryableFailure records prompt, kind, and enables retry", () => {
  const state = {};
  markRetryableFailure(state, { prompt: "  explain cortex  ", kind: "network" });
  assert.equal(state.lastPrompt, "explain cortex");
  assert.equal(state.retryAvailable, true);
  assert.equal(state.lastFailureKind, "network");
});

test("markRetryableFailure defaults missing prompt and kind", () => {
  const state = {};
  markRetryableFailure(state, {});
  assert.equal(state.lastPrompt, "");
  assert.equal(state.lastFailureKind, "");
  assert.equal(state.retryAvailable, true);
});

test("syncRetryStateWithPrompt clears state when prompt diverges", () => {
  const state = { retryAvailable: true, lastPrompt: "original", lastFailureKind: "network" };
  syncRetryStateWithPrompt(state, "changed");
  assert.equal(state.retryAvailable, false);
  assert.equal(state.lastFailureKind, "");
});

test("syncRetryStateWithPrompt keeps state when prompt matches (after trim)", () => {
  const state = { retryAvailable: true, lastPrompt: "same", lastFailureKind: "network" };
  syncRetryStateWithPrompt(state, "  same  ");
  assert.equal(state.retryAvailable, true);
  assert.equal(state.lastFailureKind, "network");
});

test("syncRetryStateWithPrompt is a no-op when retry is not available", () => {
  const state = { retryAvailable: false, lastPrompt: "original", lastFailureKind: "" };
  syncRetryStateWithPrompt(state, "totally different");
  assert.equal(state.retryAvailable, false);
});

test("syncRetryStateWithPrompt treats missing next prompt as empty string", () => {
  const state = { retryAvailable: true, lastPrompt: "original", lastFailureKind: "network" };
  syncRetryStateWithPrompt(state, undefined);
  assert.equal(state.retryAvailable, false);
});
