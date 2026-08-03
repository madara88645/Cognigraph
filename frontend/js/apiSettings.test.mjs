// apiSettings.js has no test coverage at all today. Its four exported
// functions are pure localStorage read/write wrappers, so a small in-memory
// localStorage stub (Node has no global localStorage) is enough to test
// them without a browser/jsdom.

import test from "node:test";
import assert from "node:assert/strict";

function createMemoryStorage() {
  const store = new Map();
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => {
      store.set(key, String(value));
    },
    removeItem: (key) => {
      store.delete(key);
    },
  };
}

globalThis.localStorage = createMemoryStorage();

const {
  API_KEY_STORAGE_KEY,
  MODEL_STORAGE_KEY,
  getSavedApiKey,
  setSavedApiKey,
  getSavedModel,
  setSavedModel,
} = await import("./apiSettings.js");

test.beforeEach(() => {
  globalThis.localStorage = createMemoryStorage();
});

// --- getSavedApiKey / setSavedApiKey -----------------------------------------

test("getSavedApiKey returns an empty string when nothing is saved", () => {
  assert.equal(getSavedApiKey(), "");
});

test("setSavedApiKey then getSavedApiKey round-trips the value", () => {
  setSavedApiKey("sk-test-123");
  assert.equal(getSavedApiKey(), "sk-test-123");
  assert.equal(globalThis.localStorage.getItem(API_KEY_STORAGE_KEY), "sk-test-123");
});

test("setSavedApiKey with an empty string removes the stored key", () => {
  setSavedApiKey("sk-test-123");
  setSavedApiKey("");
  assert.equal(getSavedApiKey(), "");
  assert.equal(globalThis.localStorage.getItem(API_KEY_STORAGE_KEY), null);
});

test("setSavedApiKey does not trim the value (raw pass-through)", () => {
  setSavedApiKey("  sk-with-spaces  ");
  assert.equal(getSavedApiKey(), "  sk-with-spaces  ");
});

// --- getSavedModel / setSavedModel -------------------------------------------

test("getSavedModel returns an empty string when nothing is saved", () => {
  assert.equal(getSavedModel(), "");
});

test("setSavedModel then getSavedModel round-trips the value", () => {
  setSavedModel("anthropic/claude-sonnet-5");
  assert.equal(getSavedModel(), "anthropic/claude-sonnet-5");
  assert.equal(
    globalThis.localStorage.getItem(MODEL_STORAGE_KEY),
    "anthropic/claude-sonnet-5",
  );
});

test("setSavedModel trims surrounding whitespace before saving", () => {
  setSavedModel("  openai/gpt-5  ");
  assert.equal(getSavedModel(), "openai/gpt-5");
});

test("setSavedModel with an empty or whitespace-only value removes the stored model", () => {
  setSavedModel("openai/gpt-5");
  setSavedModel("   ");
  assert.equal(getSavedModel(), "");
  assert.equal(globalThis.localStorage.getItem(MODEL_STORAGE_KEY), null);
});

test("setSavedModel with no argument removes the stored model", () => {
  setSavedModel("openai/gpt-5");
  setSavedModel();
  assert.equal(getSavedModel(), "");
});

// --- API key and model are stored independently ------------------------------

test("saving an API key does not affect the saved model and vice versa", () => {
  setSavedApiKey("sk-abc");
  setSavedModel("openai/gpt-5");
  assert.equal(getSavedApiKey(), "sk-abc");
  assert.equal(getSavedModel(), "openai/gpt-5");

  setSavedApiKey("");
  assert.equal(getSavedApiKey(), "");
  assert.equal(getSavedModel(), "openai/gpt-5");
});
