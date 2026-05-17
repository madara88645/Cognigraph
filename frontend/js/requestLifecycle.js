export const REQUEST_PHASE = {
  IDLE: "idle",
  LOADING: "loading",
  READY: "ready",
  ERROR: "error",
};

/**
 * Determine whether an async request outcome still belongs to
 * the currently active request.
 * @param {number} activeRequestId
 * @param {number} requestId
 * @returns {boolean}
 */
export function shouldHandleRequestResult(activeRequestId, requestId) {
  if (!Number.isInteger(activeRequestId) || !Number.isInteger(requestId)) return false;
  if (activeRequestId <= 0 || requestId <= 0) return false;
  return activeRequestId === requestId;
}

/**
 * Resolve next request phase from terminal outcome.
 * @param {"cancel"|"success"|"error"} outcome
 * @returns {"idle"|"ready"|"error"}
 */
export function resolvePhaseAfterOutcome(outcome) {
  if (outcome === "cancel") return REQUEST_PHASE.IDLE;
  if (outcome === "success") return REQUEST_PHASE.READY;
  return REQUEST_PHASE.ERROR;
}

/**
 * Pure derivation of UI control state for a given request phase.
 * Consumed by `setRequestPhase` (DOM applicator) and unit tests alike.
 * @param {"idle"|"loading"|"ready"|"error"} phase
 */
export function derivePhaseUiState(phase) {
  const loading = phase === REQUEST_PHASE.LOADING;
  return {
    analyzeDisabled: loading,
    analyzeText: loading ? "Analyzing…" : "Analyze",
    analyzeAriaBusy: loading ? "true" : null,
    analyzeLoadingClass: loading,
    cancelHidden: !loading,
    cancelDisabled: !loading,
  };
}
