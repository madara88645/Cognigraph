import test from "node:test";
import assert from "node:assert/strict";

// apiSettings.js reads/writes the browser localStorage global lazily inside
// its functions (not at module load time), so a minimal in-memory stub
// installed before any test runs is enough — no jsdom needed.
class MemoryStorage {
  #store = new Map();
  getItem(key) {
    return this.#store.has(key) ? this.#store.get(key) : null;
  }
  setItem(key, value) {
    this.#store.set(key, String(value));
  }
  removeItem(key) {
    this.#store.delete(key);
  }
}
globalThis.localStorage = new MemoryStorage();

const {
  getSavedApiKey,
  setSavedApiKey,
  getSavedModel,
  setSavedModel,
} = await import("./apiSettings.js");

test("getSavedApiKey returns empty string when nothing saved", () => {
  assert.equal(getSavedApiKey(), "");
});

test("setSavedApiKey then getSavedApiKey round-trips the value", () => {
  setSavedApiKey("sk-test-123");
  assert.equal(getSavedApiKey(), "sk-test-123");
});

test("setSavedApiKey with an empty value clears the stored key", () => {
  setSavedApiKey("sk-test-123");
  setSavedApiKey("");
  assert.equal(getSavedApiKey(), "");
});

test("getSavedModel returns empty string when nothing saved", () => {
  assert.equal(getSavedModel(), "");
});

test("setSavedModel trims whitespace before saving", () => {
  setSavedModel("  gpt-test-model  ");
  assert.equal(getSavedModel(), "gpt-test-model");
});

test("setSavedModel with a blank/whitespace-only value clears the stored model", () => {
  setSavedModel("some-model");
  setSavedModel("   ");
  assert.equal(getSavedModel(), "");
});
