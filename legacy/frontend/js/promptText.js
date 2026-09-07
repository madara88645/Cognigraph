// Pure helper for resolving the scenario text the user wants analyzed.
//
// handleSimulateClick can be called two ways: from the retry path with the
// previous prompt string, or from the Analyze button. If the button is ever
// wired as a bare event listener again, the click Event would arrive here as
// `override` — so anything that is not a string is ignored and we fall back to
// the textarea value instead of crashing on `.trim()` (see PR #60).
export function resolvePromptText(override, fallback) {
  const fromOverride = typeof override === "string" ? override : "";
  const fromInput = typeof fallback === "string" ? fallback : "";
  return (fromOverride || fromInput).trim();
}
