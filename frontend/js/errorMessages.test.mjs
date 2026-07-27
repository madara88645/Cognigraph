import test from "node:test";
import assert from "node:assert/strict";

import { mapErrorToUserMessage } from "./errorMessages.js";

test("mapErrorToUserMessage: abort-user is non-retryable info", () => {
  const result = mapErrorToUserMessage({ kind: "abort-user" });
  assert.equal(result.toastSeverity, "info");
  assert.equal(result.retryable, false);
  assert.equal(result.statusText, "Analysis canceled.");
});

test("mapErrorToUserMessage: abort-timeout is retryable warning", () => {
  const result = mapErrorToUserMessage({ kind: "abort-timeout" });
  assert.equal(result.toastSeverity, "warning");
  assert.equal(result.retryable, true);
});

test("mapErrorToUserMessage: network failure is retryable error", () => {
  const result = mapErrorToUserMessage({ kind: "network" });
  assert.equal(result.toastSeverity, "error");
  assert.equal(result.retryable, true);
});

test("mapErrorToUserMessage: http 400 is non-retryable warning", () => {
  const result = mapErrorToUserMessage({ kind: "http", status: 400 });
  assert.equal(result.toastSeverity, "warning");
  assert.equal(result.retryable, false);
});

test("mapErrorToUserMessage: http 503 with key-related detail flags missing key", () => {
  const withDetail = mapErrorToUserMessage({
    kind: "http",
    status: 503,
    detail: "OPENROUTER_API_KEY not set",
  });
  assert.match(withDetail.statusText, /Demo key not configured/);
  assert.equal(withDetail.retryable, false);
});

test("mapErrorToUserMessage: http 503 without key-related detail is generic outage", () => {
  const result = mapErrorToUserMessage({ kind: "http", status: 503, detail: "" });
  assert.equal(result.statusText, "Service temporarily unavailable.");
});

test("mapErrorToUserMessage: http 503 key detection is case-insensitive", () => {
  const result = mapErrorToUserMessage({ kind: "http", status: 503, detail: "Api Key missing" });
  assert.match(result.statusText, /Demo key not configured/);
});

test("mapErrorToUserMessage: http 502 with model-unavailable detail", () => {
  const deprecated = mapErrorToUserMessage({
    kind: "http",
    status: 502,
    detail: "model is deprecated",
  });
  assert.match(deprecated.statusText, /AI model is unavailable/);

  const status404 = mapErrorToUserMessage({
    kind: "http",
    status: 502,
    detail: "upstream returned status 404",
  });
  assert.match(status404.statusText, /AI model is unavailable/);
});

test("mapErrorToUserMessage: http 502 without model-unavailable detail is generic", () => {
  const result = mapErrorToUserMessage({ kind: "http", status: 502, detail: "weird payload" });
  assert.equal(result.statusText, "The AI model returned an unexpected response.");
});

test("mapErrorToUserMessage: http 500 is a simulation failure", () => {
  const result = mapErrorToUserMessage({ kind: "http", status: 500 });
  assert.equal(result.statusText, "The brain simulation failed.");
  assert.equal(result.retryable, false);
});

test("mapErrorToUserMessage: http with unhandled status falls back to detail", () => {
  const result = mapErrorToUserMessage({ kind: "http", status: 418, detail: "  I'm a teapot  " });
  assert.equal(result.statusText, "I'm a teapot");
  assert.equal(result.toastSeverity, "error");
});

test("mapErrorToUserMessage: unknown kind with no detail uses generic fallback", () => {
  const result = mapErrorToUserMessage({});
  assert.equal(result.statusText, "Request failed. Please try again.");
  assert.equal(result.retryable, false);
});

test("mapErrorToUserMessage: called with no argument at all does not throw", () => {
  const result = mapErrorToUserMessage();
  assert.equal(result.statusText, "Request failed. Please try again.");
});

test("mapErrorToUserMessage: whitespace-only detail is treated as empty", () => {
  const result = mapErrorToUserMessage({ detail: "   " });
  assert.equal(result.statusText, "Request failed. Please try again.");
});
