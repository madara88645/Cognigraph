import test from "node:test";
import assert from "node:assert/strict";

import {
  REQUEST_PHASE,
  resolvePhaseAfterOutcome,
  shouldHandleRequestResult,
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
