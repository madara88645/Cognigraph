// Vanilla Node test for the frontend state-transition helpers.
// Run with:  node --test tests/test_frontend_logic.js
//
// No bundler, no jest, no jsdom. The frontend modules under test are pure
// (or accept an injectable scheduler), so plain Node imports work.

import test from "node:test";
import assert from "node:assert/strict";

import {
  REQUEST_PHASE,
  resolvePhaseAfterOutcome,
  derivePhaseUiState,
} from "../frontend/js/requestLifecycle.js";
import { createColdStartTimer } from "../frontend/js/coldStartIndicator.js";
import { mapErrorToUserMessage } from "../frontend/js/errorMessages.js";
import {
  clearRetryState,
  markRetryableFailure,
  syncRetryStateWithPrompt,
} from "../frontend/js/requestRetryState.js";
import { resolvePromptText } from "../frontend/js/promptText.js";
import { DEFAULT_VFX } from "../frontend/js/constants.js";
import { mergeVfxProfile } from "../frontend/js/ui.js";

// --- derivePhaseUiState ------------------------------------------------------

test("Analyze button is re-enabled after cancel", () => {
  const phase = resolvePhaseAfterOutcome("cancel");
  const ui = derivePhaseUiState(phase);
  assert.equal(phase, REQUEST_PHASE.IDLE);
  assert.equal(ui.analyzeDisabled, false);
  assert.equal(ui.cancelHidden, true);
  assert.equal(ui.cancelDisabled, true);
  assert.equal(ui.analyzeText, "Analyze");
  assert.equal(ui.analyzeAriaBusy, null);
});

test("LOADING phase disables Analyze and shows Cancel", () => {
  const ui = derivePhaseUiState(REQUEST_PHASE.LOADING);
  assert.equal(ui.analyzeDisabled, true);
  assert.equal(ui.analyzeText, "Analyzing…");
  assert.equal(ui.analyzeAriaBusy, "true");
  assert.equal(ui.cancelHidden, false);
  assert.equal(ui.cancelDisabled, false);
});

test("ERROR phase re-enables Analyze", () => {
  const ui = derivePhaseUiState(REQUEST_PHASE.ERROR);
  assert.equal(ui.analyzeDisabled, false);
  assert.equal(ui.cancelHidden, true);
});

// --- mapErrorToUserMessage ---------------------------------------------------

test("400 maps to a jargon-free 'enter scenario' message", () => {
  const m = mapErrorToUserMessage({ kind: "http", status: 400 });
  assert.equal(m.toastSeverity, "warning");
  assert.match(m.toastText, /enter a scenario/i);
});

test("503 with OpenRouter detail maps to key-config copy", () => {
  const m = mapErrorToUserMessage({
    kind: "http",
    status: 503,
    detail: "OPENROUTER_API_KEY is not set on the server.",
  });
  assert.equal(m.toastSeverity, "error");
  assert.match(m.toastText, /OpenRouter API key/i);
  assert.match(m.actionHintText, /API Settings/i);
});

test("503 with generic detail does NOT mention the API key", () => {
  const m = mapErrorToUserMessage({
    kind: "http",
    status: 503,
    detail: "Service overloaded",
  });
  assert.equal(m.toastSeverity, "error");
  assert.doesNotMatch(m.toastText, /OpenRouter/i);
  assert.match(m.toastText, /unavailable/i);
});

test("502 maps to 'rephrase your prompt'", () => {
  const m = mapErrorToUserMessage({ kind: "http", status: 502 });
  assert.equal(m.toastSeverity, "error");
  assert.match(m.toastText, /rephrasing your prompt/i);
});

test("500 maps to 'brain simulation failed'", () => {
  const m = mapErrorToUserMessage({ kind: "http", status: 500 });
  assert.equal(m.toastSeverity, "error");
  assert.match(m.toastText, /brain simulation/i);
});

test("abort-user produces an info-severity 'canceled' message", () => {
  const m = mapErrorToUserMessage({ kind: "abort-user" });
  assert.equal(m.toastSeverity, "info");
  assert.match(m.toastText, /canceled/i);
  assert.equal(m.retryable, false);
});

test("network kind references the connection and is error severity", () => {
  const m = mapErrorToUserMessage({ kind: "network" });
  assert.equal(m.toastSeverity, "error");
  assert.match(m.toastText, /connection/i);
  assert.doesNotMatch(m.toastText, /cancelled/i);
  assert.equal(m.retryable, true);
});

test("abort-timeout is retryable and does not promise auto-resume", () => {
  const m = mapErrorToUserMessage({ kind: "abort-timeout" });
  assert.equal(m.toastSeverity, "warning");
  assert.match(m.toastText, /timed out|timed out/i);
  assert.doesNotMatch(m.actionHintText, /resume automatically/i);
  assert.equal(m.retryable, true);
});

test("unknown kind falls back to the detail string", () => {
  const m = mapErrorToUserMessage({ kind: "unknown", detail: "boom" });
  assert.equal(m.toastSeverity, "error");
  assert.equal(m.toastText, "boom");
  assert.equal(m.retryable, false);
});

// --- retry state helpers ----------------------------------------------------

test("retryable failure stores the submitted prompt and kind", () => {
  const state = { lastPrompt: "", retryAvailable: false, lastFailureKind: "" };
  markRetryableFailure(state, { prompt: "focus sprint", kind: "abort-timeout" });
  assert.equal(state.lastPrompt, "focus sprint");
  assert.equal(state.retryAvailable, true);
  assert.equal(state.lastFailureKind, "abort-timeout");
});

test("editing the prompt clears stale retry state", () => {
  const state = {
    lastPrompt: "focus sprint",
    retryAvailable: true,
    lastFailureKind: "network",
  };
  syncRetryStateWithPrompt(state, "different idea");
  assert.equal(state.retryAvailable, false);
  assert.equal(state.lastFailureKind, "");
});

test("clearing retry state removes retry after success or cancel", () => {
  const state = {
    lastPrompt: "focus sprint",
    retryAvailable: true,
    lastFailureKind: "abort-timeout",
  };
  clearRetryState(state);
  assert.equal(state.retryAvailable, false);
  assert.equal(state.lastFailureKind, "");
});

// --- createColdStartTimer (with injected fake scheduler) ---------------------

function fakeScheduler() {
  const tasks = new Map();
  let now = 0;
  let nextId = 1;
  return {
    setTimeout(fn, delay) {
      const id = nextId++;
      tasks.set(id, { fn, at: now + delay });
      return id;
    },
    clearTimeout(id) {
      tasks.delete(id);
    },
    advance(ms) {
      now += ms;
      const due = [...tasks].filter(([, t]) => t.at <= now).sort((a, b) => a[1].at - b[1].at);
      for (const [id, { fn }] of due) {
        tasks.delete(id);
        fn();
      }
    },
    pending() {
      return tasks.size;
    },
  };
}

test("cold-start timer fires onSlow at slowMs and onVerySlow at verySlowMs", () => {
  const scheduler = fakeScheduler();
  let slow = 0;
  let verySlow = 0;
  const timer = createColdStartTimer({
    onSlow: () => slow++,
    onVerySlow: () => verySlow++,
    slowMs: 5000,
    verySlowMs: 20000,
    scheduler,
  });
  timer.start();

  scheduler.advance(4999);
  assert.equal(slow, 0);
  assert.equal(verySlow, 0);

  scheduler.advance(1); // total 5000
  assert.equal(slow, 1);
  assert.equal(verySlow, 0);

  scheduler.advance(14999); // total 19999
  assert.equal(verySlow, 0);

  scheduler.advance(1); // total 20000
  assert.equal(verySlow, 1);
  assert.equal(scheduler.pending(), 0);
});

test("cold-start timer.clear() before fire prevents both callbacks", () => {
  const scheduler = fakeScheduler();
  let slow = 0;
  let verySlow = 0;
  const timer = createColdStartTimer({
    onSlow: () => slow++,
    onVerySlow: () => verySlow++,
    slowMs: 5000,
    verySlowMs: 20000,
    scheduler,
  });
  timer.start();
  scheduler.advance(4000);
  timer.clear();
  scheduler.advance(60000);
  assert.equal(slow, 0);
  assert.equal(verySlow, 0);
  assert.equal(scheduler.pending(), 0);
});

test("cold-start timer.start() is idempotent — second start replaces first", () => {
  const scheduler = fakeScheduler();
  let slow = 0;
  const timer = createColdStartTimer({
    onSlow: () => slow++,
    slowMs: 5000,
    scheduler,
  });
  timer.start();
  scheduler.advance(2000);
  timer.start(); // resets — first slow timer is cancelled
  scheduler.advance(3000); // 3000ms into new timer, was 5000 into the first
  assert.equal(slow, 0);
  scheduler.advance(2000); // total 5000ms into the new timer
  assert.equal(slow, 1);
});

// --- resolvePromptText ------------------------------------------------------
// Regression guard for the Analyze-button bug (PR #60): the click handler was
// wired as addEventListener("click", handleSimulateClick), so the click Event
// leaked into the `promptOverride` argument and `Event.trim()` threw, killing
// /simulate. resolvePromptText must ignore any non-string override and fall
// back to the textarea value instead of crashing.

test("resolvePromptText uses a string override, trimmed", () => {
  assert.equal(resolvePromptText("  retry this  ", "typed text"), "retry this");
});

test("resolvePromptText falls back to the input value when override is empty", () => {
  assert.equal(resolvePromptText("", "  studying for finals  "), "studying for finals");
});

test("resolvePromptText ignores a non-string override (click Event regression)", () => {
  // A DOM click Event — the exact value that crashed the old handler.
  const clickEvent = { type: "click", isTrusted: true };
  assert.equal(resolvePromptText(clickEvent, "drinking espresso"), "drinking espresso");
});

test("resolvePromptText ignores null/undefined override and uses the input", () => {
  assert.equal(resolvePromptText(undefined, "deadlift PR"), "deadlift PR");
  assert.equal(resolvePromptText(null, "deadlift PR"), "deadlift PR");
});

test("resolvePromptText returns empty string when nothing usable is provided", () => {
  assert.equal(resolvePromptText({ type: "click" }, ""), "");
  assert.equal(resolvePromptText(undefined, undefined), "");
  assert.equal(resolvePromptText(null, "   "), "");
});

// --- DEFAULT_VFX (glow_sinusoidal_amp_mult) ---------------------------------

test("DEFAULT_VFX includes glow_sinusoidal_amp_mult defaulting to 0", () => {
  assert.equal(DEFAULT_VFX.glow_sinusoidal_amp_mult, 0.0);
});

test("mergeVfxProfile preserves glow_sinusoidal_amp_mult from API", () => {
  const merged = mergeVfxProfile({ glow_sinusoidal_amp_mult: 0.05 });
  assert.equal(merged.glow_sinusoidal_amp_mult, 0.05);
});

test("mergeVfxProfile defaults glow_sinusoidal_amp_mult to 0", () => {
  const merged = mergeVfxProfile({});
  assert.equal(merged.glow_sinusoidal_amp_mult, 0.0);
});
