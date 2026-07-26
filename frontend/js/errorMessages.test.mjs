import test from "node:test";
import assert from "node:assert/strict";

import { mapErrorToUserMessage } from "./errorMessages.js";

test("abort-user returns a non-retryable, info-severity cancellation message", () => {
  const result = mapErrorToUserMessage({ kind: "abort-user" });
  assert.equal(result.retryable, false);
  assert.equal(result.toastSeverity, "info");
  assert.match(result.statusText, /canceled/i);
});

test("abort-timeout returns a retryable, warning-severity message", () => {
  const result = mapErrorToUserMessage({ kind: "abort-timeout" });
  assert.equal(result.retryable, true);
  assert.equal(result.toastSeverity, "warning");
  assert.match(result.statusText, /too long/i);
});

test("network kind returns a retryable, error-severity message", () => {
  const result = mapErrorToUserMessage({ kind: "network" });
  assert.equal(result.retryable, true);
  assert.equal(result.toastSeverity, "error");
  assert.match(result.statusText, /reach the server/i);
});

test("http 400 returns a non-retryable, warning-severity validation message", () => {
  const result = mapErrorToUserMessage({ kind: "http", status: 400 });
  assert.equal(result.retryable, false);
  assert.equal(result.toastSeverity, "warning");
  assert.match(result.statusText, /valid scenario/i);
});

test("http 503 with OpenRouter key detail is treated as a missing-key error", () => {
  const result = mapErrorToUserMessage({
    kind: "http",
    status: 503,
    detail: "OPENROUTER_API_KEY is not set",
  });
  assert.equal(result.retryable, false);
  assert.match(result.statusText, /demo key not configured/i);
});

test("http 503 without key wording falls back to a generic unavailable message", () => {
  const result = mapErrorToUserMessage({ kind: "http", status: 503, detail: "boom" });
  assert.equal(result.retryable, false);
  assert.match(result.statusText, /temporarily unavailable/i);
});

test("http 502 with a deprecated/not-found detail is treated as model-unavailable", () => {
  for (const detail of ["model is deprecated", "not found", "Status 404", "invalid model"]) {
    const result = mapErrorToUserMessage({ kind: "http", status: 502, detail });
    assert.match(result.statusText, /model is unavailable/i, `detail=${detail}`);
    assert.equal(result.retryable, false);
  }
});

test("http 502 without model-unavailable wording falls back to a generic message", () => {
  const result = mapErrorToUserMessage({ kind: "http", status: 502, detail: "weird payload" });
  assert.match(result.statusText, /unexpected response/i);
});

test("http 500 returns the simulation-failed message", () => {
  const result = mapErrorToUserMessage({ kind: "http", status: 500 });
  assert.match(result.statusText, /simulation failed/i);
  assert.equal(result.retryable, false);
});

test("http with an unhandled status falls through to the generic fallback", () => {
  const result = mapErrorToUserMessage({ kind: "http", status: 418, detail: "I'm a teapot" });
  assert.equal(result.statusText, "I'm a teapot");
  assert.equal(result.toastSeverity, "error");
  assert.equal(result.retryable, false);
});

test("unknown kind with no detail falls back to the generic 'request failed' message", () => {
  const result = mapErrorToUserMessage({});
  assert.equal(result.statusText, "Request failed. Please try again.");
  assert.equal(result.toastSeverity, "error");
  assert.equal(result.retryable, false);
});

test("missing input object does not throw and falls back gracefully", () => {
  const result = mapErrorToUserMessage();
  assert.equal(result.statusText, "Request failed. Please try again.");
});
