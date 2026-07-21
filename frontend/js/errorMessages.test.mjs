import test from "node:test";
import assert from "node:assert/strict";

import { mapErrorToUserMessage } from "./errorMessages.js";

test("abort-user returns non-retryable info message", () => {
  const result = mapErrorToUserMessage({ kind: "abort-user" });
  assert.equal(result.toastSeverity, "info");
  assert.equal(result.retryable, false);
});

test("abort-timeout returns retryable warning", () => {
  const result = mapErrorToUserMessage({ kind: "abort-timeout" });
  assert.equal(result.toastSeverity, "warning");
  assert.equal(result.retryable, true);
});

test("network error returns retryable error", () => {
  const result = mapErrorToUserMessage({ kind: "network" });
  assert.equal(result.toastSeverity, "error");
  assert.equal(result.retryable, true);
});

test("http 400 returns non-retryable warning prompting for scenario", () => {
  const result = mapErrorToUserMessage({ kind: "http", status: 400 });
  assert.match(result.statusText, /valid scenario/);
  assert.equal(result.retryable, false);
  assert.equal(result.toastSeverity, "warning");
});

test("http 503 with openrouter key detail returns key-not-configured message", () => {
  const result = mapErrorToUserMessage({
    kind: "http",
    status: 503,
    detail: "OpenRouter API_KEY is not set",
  });
  assert.match(result.statusText, /Demo key not configured/);
  assert.equal(result.retryable, false);
});

test("http 503 detects 'api key' phrasing case-insensitively", () => {
  const result = mapErrorToUserMessage({
    kind: "http",
    status: 503,
    detail: "missing API Key for provider",
  });
  assert.match(result.statusText, /Demo key not configured/);
});

test("http 503 without key-related detail returns generic unavailable message", () => {
  const result = mapErrorToUserMessage({ kind: "http", status: 503, detail: "database down" });
  assert.match(result.statusText, /temporarily unavailable/);
  assert.equal(result.retryable, false);
});

test("http 503 with no detail returns generic unavailable message", () => {
  const result = mapErrorToUserMessage({ kind: "http", status: 503 });
  assert.match(result.statusText, /temporarily unavailable/);
});

test("http 502 with deprecated model detail returns model-unavailable message", () => {
  const result = mapErrorToUserMessage({
    kind: "http",
    status: 502,
    detail: "model deprecated by provider",
  });
  assert.match(result.statusText, /AI model is unavailable/);
});

test("http 502 with 404-style detail returns model-unavailable message", () => {
  const result = mapErrorToUserMessage({
    kind: "http",
    status: 502,
    detail: "upstream responded with status 404",
  });
  assert.match(result.statusText, /AI model is unavailable/);
});

test("http 502 without model-unavailable signal returns generic 502 message", () => {
  const result = mapErrorToUserMessage({ kind: "http", status: 502, detail: "garbled output" });
  assert.match(result.statusText, /unexpected response/);
});

test("http 500 returns simulation-failed message", () => {
  const result = mapErrorToUserMessage({ kind: "http", status: 500 });
  assert.match(result.statusText, /brain simulation failed/);
  assert.equal(result.retryable, false);
});

test("http with unmapped status falls through to generic fallback with detail", () => {
  const result = mapErrorToUserMessage({ kind: "http", status: 418, detail: "I'm a teapot" });
  assert.equal(result.statusText, "I'm a teapot");
});

test("unknown kind with no detail falls back to generic request-failed message", () => {
  const result = mapErrorToUserMessage({});
  assert.equal(result.statusText, "Request failed. Please try again.");
  assert.equal(result.retryable, false);
});

test("unknown kind with whitespace-only detail falls back to generic message", () => {
  const result = mapErrorToUserMessage({ kind: "mystery", detail: "   " });
  assert.equal(result.statusText, "Request failed. Please try again.");
});

test("called with no arguments does not throw", () => {
  assert.doesNotThrow(() => mapErrorToUserMessage());
});
