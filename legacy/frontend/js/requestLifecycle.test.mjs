import test from "node:test";
import assert from "node:assert/strict";

import {
  REQUEST_PHASE,
  resolvePhaseAfterOutcome,
  shouldHandleRequestResult,
  derivePhaseUiState,
} from "./requestLifecycle.js";

test("cancel outcome returns idle phase", () => {
  assert.equal(resolvePhaseAfterOutcome("cancel"), REQUEST_PHASE.IDLE);
});

test("success outcome returns ready phase", () => {
  assert.equal(resolvePhaseAfterOutcome("success"), REQUEST_PHASE.READY);
});

test("stale request id is ignored", () => {
  assert.equal(shouldHandleRequestResult(2, 1), false);
  assert.equal(shouldHandleRequestResult(0, 1), false);
});

test("matching active request id is handled", () => {
  assert.equal(shouldHandleRequestResult(3, 3), true);
});

test("loading phase shows cancel and hides retry", () => {
  const ui = derivePhaseUiState(REQUEST_PHASE.LOADING, { retryAvailable: true });
  assert.equal(ui.cancelHidden, false);
  assert.equal(ui.retryHidden, true);
  assert.equal(ui.retryDisabled, true);
});

test("retryable error shows retry while keeping analyze active", () => {
  const ui = derivePhaseUiState(REQUEST_PHASE.ERROR, { retryAvailable: true });
  assert.equal(ui.analyzeDisabled, false);
  assert.equal(ui.retryHidden, false);
  assert.equal(ui.retryDisabled, false);
  assert.equal(ui.cancelHidden, true);
});

test("non-retryable error keeps retry hidden", () => {
  const ui = derivePhaseUiState(REQUEST_PHASE.ERROR, { retryAvailable: false });
  assert.equal(ui.retryHidden, true);
  assert.equal(ui.retryDisabled, true);
});
