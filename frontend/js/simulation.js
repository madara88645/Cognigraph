import { LOBES, NEUROMODS, REQUEST_TIMEOUT_MS } from "./constants.js";
import {
  getSavedApiKey,
  getSavedModel,
} from "./apiSettings.js";
import { showToast } from "./toast.js";

const SIMULATION_CANCELED_ERROR = "SIMULATION_CANCELED";

export function formatFastApiDetail(detail, status) {
  if (typeof detail === "string" && detail.trim()) return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((e) => (e && typeof e.msg === "string" ? e.msg : JSON.stringify(e)))
      .join("; ");
  }
  if (detail && typeof detail === "object") {
    try {
      return JSON.stringify(detail);
    } catch {
      return `Simulation failed (${status})`;
    }
  }
  return `Simulation failed (${status})`;
}

export function assertValidResponse(payload) {
  if (!payload || typeof payload !== "object") throw new Error("API response is invalid.");
  if (!LOBES.includes(payload.active_lobe)) throw new Error("active_lobe missing or invalid.");
  if (typeof payload.explanation !== "string") throw new Error("explanation missing.");
  const dur = Number(payload.duration_ms);
  if (!Number.isFinite(dur)) throw new Error("duration_ms missing or invalid.");
  payload.duration_ms = dur;
  if (!payload.spikes || typeof payload.spikes !== "object") throw new Error("spikes missing.");
  if (!NEUROMODS.includes(payload.dominant_neuromodulator)) {
    throw new Error("dominant_neuromodulator missing or invalid.");
  }
  const nmInt = Number(payload.neuromodulator_intensity);
  if (!Number.isFinite(nmInt)) {
    throw new Error("neuromodulator_intensity missing or invalid.");
  }
  payload.neuromodulator_intensity = Math.max(0, Math.min(1, nmInt));
  if (payload.neuromodulator_rationale != null && typeof payload.neuromodulator_rationale !== "string") {
    throw new Error("neuromodulator_rationale must be a string.");
  }
  if (!payload.snn_modulation || typeof payload.snn_modulation !== "object") {
    throw new Error("snn_modulation missing (is the API server updated to CogniGraph neuromod build?).");
  }
  if (!payload.vfx_profile || typeof payload.vfx_profile !== "object") {
    throw new Error("vfx_profile missing (is the API server updated to CogniGraph neuromod build?).");
  }
}

export function isSimulationCanceledError(error) {
  return error instanceof Error && error.message === SIMULATION_CANCELED_ERROR;
}

export function startSimulationRequest(prompt) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort("timeout"), REQUEST_TIMEOUT_MS);
  const promise = (async () => {
    try {
      const savedApiKey = getSavedApiKey();
      const headers = { "Content-Type": "application/json" };
      if (savedApiKey) {
        headers["X-OpenRouter-Api-Key"] = savedApiKey;
        const modelSlug = getSavedModel().trim();
        if (modelSlug) {
          headers["X-OpenRouter-Model"] = modelSlug;
        }
      }
      let response;
      try {
        response = await fetch("/simulate", {
          method: "POST",
          headers,
          body: JSON.stringify({ prompt }),
          signal: controller.signal,
        });
      } catch (fetchErr) {
        const name = fetchErr instanceof Error ? fetchErr.name : "";
        if (name === "AbortError") {
          if (controller.signal.reason === "user") {
            throw new Error(SIMULATION_CANCELED_ERROR);
          }
          showToast(
            "Analyze timed out — server may be cold-starting (15–30 s on first run). Try again.",
            "warning"
          );
          throw new Error(
            "No response within 2 minutes. If you are on a serverless preview, try Analyze again after the first cold start, or use the Fly deployment for more predictable latency (see README)."
          );
        }
        showToast("Network error — could not reach the server.", "error");
        throw new Error(
          "Network error — could not reach the server. If you are running locally, ensure the API is up."
        );
      }
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        const detail = formatFastApiDetail(body.detail, response.status);
        if (response.status === 503) {
          const lower = detail.toLowerCase();
          if (
            lower.includes("openrouter") ||
            lower.includes("api_key") ||
            lower.includes("api key") ||
            lower.includes("not set")
          ) {
            showToast("No OpenRouter key configured. Add yours in API Settings.", "error");
            throw new Error(
              "Shared demo key is not configured on the server. You can still use this page: open API Settings → Show, paste your OpenRouter key, and Save (stored in this browser only). Or ask the host to set OPENROUTER_API_KEY."
            );
          }
          showToast(detail || "Service temporarily unavailable (503).", "error");
          throw new Error(detail || "Service temporarily unavailable (503). Try again later.");
        }
        if (response.status >= 500) {
          showToast(detail || "Server error. Try again in a moment.", "error");
          throw new Error(detail || "Server error. Try again in a moment.");
        }
        showToast(detail || "Request failed", "error");
        throw new Error(detail);
      }
      return body;
    } finally {
      window.clearTimeout(timeoutId);
    }
  })();

  return {
    promise,
    cancel: () => controller.abort("user"),
  };
}

export async function callSimulation(prompt) {
  return startSimulationRequest(prompt).promise;
}
