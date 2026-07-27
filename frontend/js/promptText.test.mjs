import test from "node:test";
import assert from "node:assert/strict";

import { resolvePromptText } from "./promptText.js";

test("resolvePromptText: prefers a non-empty override over the fallback", () => {
  assert.equal(resolvePromptText("from retry", "from textarea"), "from retry");
});

test("resolvePromptText: falls back when override is an empty string", () => {
  assert.equal(resolvePromptText("", "from textarea"), "from textarea");
});

test("resolvePromptText: falls back when override is not a string (e.g. a click Event)", () => {
  const fakeEvent = { type: "click" };
  assert.equal(resolvePromptText(fakeEvent, "from textarea"), "from textarea");
});

test("resolvePromptText: falls back when override is undefined", () => {
  assert.equal(resolvePromptText(undefined, "from textarea"), "from textarea");
});

test("resolvePromptText: trims surrounding whitespace on the chosen value", () => {
  assert.equal(resolvePromptText("  hello world  ", ""), "hello world");
});

test("resolvePromptText: non-string fallback is treated as empty", () => {
  assert.equal(resolvePromptText(undefined, 42), "");
});

test("resolvePromptText: returns empty string when both inputs are empty/invalid", () => {
  assert.equal(resolvePromptText(undefined, undefined), "");
  assert.equal(resolvePromptText("", ""), "");
});

test("resolvePromptText: whitespace-only override wins over a populated fallback, then trims to empty", () => {
  assert.equal(resolvePromptText("   ", "real fallback text"), "");
});
