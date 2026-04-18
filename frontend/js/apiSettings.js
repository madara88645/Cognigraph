export const API_KEY_STORAGE_KEY = "cognigraph.openrouter_api_key";
export const MODEL_STORAGE_KEY = "cognigraph.openrouter_model";
export const PRIMARY_LIVE_DEMO_URL = "https://cognigraph-tau.vercel.app";

export const PRIMARY_LIVE_DEMO_ORIGIN = (() => {
  try {
    return new URL(PRIMARY_LIVE_DEMO_URL).origin;
  } catch {
    return PRIMARY_LIVE_DEMO_URL;
  }
})();

export function getSavedApiKey() {
  return localStorage.getItem(API_KEY_STORAGE_KEY) || "";
}

export function setSavedApiKey(value) {
  if (!value) {
    localStorage.removeItem(API_KEY_STORAGE_KEY);
    return;
  }
  localStorage.setItem(API_KEY_STORAGE_KEY, value);
}

export function getSavedModel() {
  return localStorage.getItem(MODEL_STORAGE_KEY) || "";
}

export function setSavedModel(value) {
  const v = (value || "").trim();
  if (!v) {
    localStorage.removeItem(MODEL_STORAGE_KEY);
    return;
  }
  localStorage.setItem(MODEL_STORAGE_KEY, v);
}

/** @param {HTMLElement} apiKeyStatusEl */
export function refreshApiSettingsStatus(apiKeyStatusEl) {
  const key = getSavedApiKey();
  const model = getSavedModel();
  if (!key) {
    apiKeyStatusEl.textContent = "Not set";
    return;
  }
  apiKeyStatusEl.textContent = model
    ? `Key saved · ${model}`
    : "Key saved · default model";
}
