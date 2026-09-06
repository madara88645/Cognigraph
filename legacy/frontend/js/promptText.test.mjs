import test from "node:test";
import assert from "node:assert/strict";

import { resolvePromptText } from "./promptText.js";

test("prefers a non-empty override string over the fallback", () => {
  assert.equal(resolvePromptText("override text", "fallback text"), "override text");
});

test("falls back to the fallback string when override is empty", () => {
  assert.equal(resolvePromptText("", "fallback text"), "fallback text");
});

test("trims whitespace from the resolved text", () => {
  assert.equal(resolvePromptText("  spaced out  ", ""), "spaced out");
});

test("ignores a non-string override (e.g. an accidental Event object) and uses fallback", () => {
  const fakeEvent = { type: "click" };
  assert.equal(resolvePromptText(fakeEvent, "textarea value"), "textarea value");
});

test("returns an empty string when neither argument is a usable string", () => {
  assert.equal(resolvePromptText(undefined, undefined), "");
  assert.equal(resolvePromptText(null, 42), "");
});

test("a whitespace-only override wins over the fallback but trims to empty", () => {
  assert.equal(resolvePromptText("   ", "fallback"), "");
});
