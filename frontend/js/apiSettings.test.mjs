// Node test for the pure localStorage read/write helpers in
// frontend/js/apiSettings.js.
// Run with:
//   node --import ../../tests/helpers/registerThreeStub.js --test frontend/js/apiSettings.test.mjs
//
// apiSettings.js doesn't import "three" itself, but Node has no global
// `localStorage` by default, so this file installs a minimal in-memory stub
// before importing the module under test (source is not modified).

import test from "node:test";
import assert from "node:assert/strict";

class MemoryStorage {
  constructor() {
    this._data = new Map();
  }
  getItem(key) {
    return this._data.has(key) ? this._data.get(key) : null;
  }
  setItem(key, value) {
    this._data.set(key, String(value));
  }
  removeItem(key) {
    this._data.delete(key);
  }
  clear() {
    this._data.clear();
  }
}

globalThis.localStorage = new MemoryStorage();

const {
  API_KEY_STORAGE_KEY,
  MODEL_STORAGE_KEY,
  getSavedApiKey,
  setSavedApiKey,
  getSavedModel,
  setSavedModel,
  refreshApiSettingsStatus,
} = await import("./apiSettings.js");

test.beforeEach(() => {
  globalThis.localStorage.clear();
});

// --- getSavedApiKey / setSavedApiKey -------------------------------------

test("getSavedApiKey returns an empty string when nothing is saved", () => {
  assert.equal(getSavedApiKey(), "");
});

test("setSavedApiKey persists a value that getSavedApiKey then returns", () => {
  setSavedApiKey("sk-my-key");
  assert.equal(getSavedApiKey(), "sk-my-key");
  assert.equal(globalThis.localStorage.getItem(API_KEY_STORAGE_KEY), "sk-my-key");
});

test("setSavedApiKey with a falsy value clears the stored key", () => {
  setSavedApiKey("sk-my-key");
  setSavedApiKey("");
  assert.equal(getSavedApiKey(), "");
  assert.equal(globalThis.localStorage.getItem(API_KEY_STORAGE_KEY), null);
});

// --- getSavedModel / setSavedModel ----------------------------------------

test("getSavedModel returns an empty string when nothing is saved", () => {
  assert.equal(getSavedModel(), "");
});

test("setSavedModel persists a trimmed value", () => {
  setSavedModel("  openrouter/some-model  ");
  assert.equal(getSavedModel(), "openrouter/some-model");
  assert.equal(globalThis.localStorage.getItem(MODEL_STORAGE_KEY), "openrouter/some-model");
});

test("setSavedModel with only whitespace clears the stored model", () => {
  setSavedModel("openrouter/some-model");
  setSavedModel("   ");
  assert.equal(getSavedModel(), "");
  assert.equal(globalThis.localStorage.getItem(MODEL_STORAGE_KEY), null);
});

test("setSavedModel with a falsy value clears the stored model", () => {
  setSavedModel("openrouter/some-model");
  setSavedModel(null);
  assert.equal(getSavedModel(), "");
});

// --- refreshApiSettingsStatus ---------------------------------------------

function fakeStatusEl() {
  return { textContent: "" };
}

test("refreshApiSettingsStatus shows 'Not set' when no key is saved", () => {
  const el = fakeStatusEl();
  refreshApiSettingsStatus(el);
  assert.equal(el.textContent, "Not set");
});

test("refreshApiSettingsStatus shows the model name when a key and model are saved", () => {
  setSavedApiKey("sk-my-key");
  setSavedModel("openrouter/some-model");
  const el = fakeStatusEl();
  refreshApiSettingsStatus(el);
  assert.equal(el.textContent, "Key saved · openrouter/some-model");
});

test("refreshApiSettingsStatus shows a default-model message when a key is saved without a model", () => {
  setSavedApiKey("sk-my-key");
  const el = fakeStatusEl();
  refreshApiSettingsStatus(el);
  assert.equal(el.textContent, "Key saved · default model");
});
