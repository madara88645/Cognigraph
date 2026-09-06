export function clearRetryState(state) {
  state.retryAvailable = false;
  state.lastFailureKind = "";
  return state;
}

export function markRetryableFailure(state, { prompt, kind }) {
  state.lastPrompt = (prompt || "").trim();
  state.retryAvailable = true;
  state.lastFailureKind = kind || "";
  return state;
}

export function syncRetryStateWithPrompt(state, nextPrompt) {
  const normalizedPrompt = (nextPrompt || "").trim();
  if (state.retryAvailable && normalizedPrompt !== state.lastPrompt) {
    clearRetryState(state);
  }
  return state;
}
