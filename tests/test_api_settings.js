// Unit tests for apiSettings.js (localStorage-backed BYOK persistence).
// Run with: node --test tests/test_api_settings.js

import test from "node:test";
import assert from "node:assert/strict";

import {
  API_KEY_STORAGE_KEY,
  MODEL_STORAGE_KEY,
  getSavedApiKey,
  setSavedApiKey,
  getSavedModel,
  setSavedModel,
  refreshApiSettingsStatus,
} from "../frontend/js/apiSettings.js";

const store = new Map();

globalThis.localStorage = {
  getItem(key) {
    return store.has(key) ? store.get(key) : null;
  },
  setItem(key, value) {
    store.set(key, value);
  },
  removeItem(key) {
    store.delete(key);
  },
};

test.beforeEach(() => {
  store.clear();
});

test("getSavedApiKey returns empty string when unset", () => {
  assert.equal(getSavedApiKey(), "");
});

test("setSavedApiKey persists and clears values", () => {
  setSavedApiKey("sk-test");
  assert.equal(getSavedApiKey(), "sk-test");
  assert.equal(localStorage.getItem(API_KEY_STORAGE_KEY), "sk-test");
  setSavedApiKey("");
  assert.equal(getSavedApiKey(), "");
  assert.equal(localStorage.getItem(API_KEY_STORAGE_KEY), null);
});

test("setSavedModel trims and removes blank slugs", () => {
  setSavedModel("  openai/gpt-4o  ");
  assert.equal(getSavedModel(), "openai/gpt-4o");
  setSavedModel("   ");
  assert.equal(getSavedModel(), "");
  assert.equal(localStorage.getItem(MODEL_STORAGE_KEY), null);
});

test("refreshApiSettingsStatus reflects key and model state", () => {
  const el = { textContent: "" };
  refreshApiSettingsStatus(el);
  assert.equal(el.textContent, "Not set");

  setSavedApiKey("sk-test");
  refreshApiSettingsStatus(el);
  assert.equal(el.textContent, "Key saved · default model");

  setSavedModel("anthropic/claude-3.5-sonnet");
  refreshApiSettingsStatus(el);
  assert.equal(el.textContent, "Key saved · anthropic/claude-3.5-sonnet");
});
