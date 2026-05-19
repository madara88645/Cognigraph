/**
 * Single source of truth for converting transport errors into user-facing copy.
 *
 * `kind` discriminates the error category, since HTTP status alone isn't
 * enough (an `AbortError` carries no status, and the meaning of a 503
 * depends on whether the body mentions the OpenRouter key).
 *
 * Returns the four strings the catch block in `main.js` needs to render:
 *   - statusText      → top status chip
 *   - actionHintText  → aria-live action hint under the prompt
 *   - toastText       → toast banner
 *   - toastSeverity   → "info" | "warning" | "error"
 *
 * @param {{kind?: string, status?: number, detail?: string}} input
 */
export function mapErrorToUserMessage({ kind, status, detail = "" } = {}) {
  if (kind === "abort-user") {
    return {
      statusText: "Analysis canceled.",
      actionHintText: "Canceled safely. You can edit the scenario and try again.",
      toastText: "Analysis canceled. You can edit and try again.",
      toastSeverity: "info",
    };
  }

  if (kind === "abort-timeout") {
    return {
      statusText: "Server took too long to respond.",
      actionHintText: "The server may be waking up. Try Analyze again in a moment.",
      toastText: "Connection lost or request timed out. Try again.",
      toastSeverity: "warning",
    };
  }

  if (kind === "network") {
    return {
      statusText: "Couldn't reach the server.",
      actionHintText: "Check your connection and try again.",
      toastText: "Connection lost or request cancelled. Try again.",
      toastSeverity: "error",
    };
  }

  if (kind === "http") {
    if (status === 400) {
      return {
        statusText: "Please enter a valid scenario before analyzing.",
        actionHintText: "Add a short scenario (1–2 sentences), then click Analyze.",
        toastText: "Please enter a scenario before analyzing.",
        toastSeverity: "warning",
      };
    }
    if (status === 503) {
      const lower = (detail || "").toLowerCase();
      const isKeyIssue =
        lower.includes("openrouter") ||
        lower.includes("api_key") ||
        lower.includes("api key") ||
        lower.includes("not set");
      if (isKeyIssue) {
        return {
          statusText: "Demo key not configured.",
          actionHintText:
            "Open API Settings and paste your OpenRouter key (stored in this browser only).",
          toastText: "Demo key not configured. Add your OpenRouter API key in Settings.",
          toastSeverity: "error",
        };
      }
      return {
        statusText: "Service temporarily unavailable.",
        actionHintText: "Please try again in a moment.",
        toastText: "Service temporarily unavailable. Try again shortly.",
        toastSeverity: "error",
      };
    }
    if (status === 502) {
      const lower = (detail || "").toLowerCase();
      const isModelUnavailable =
        lower.includes("deprecated") ||
        lower.includes("not found") ||
        /status 404/.test(lower) ||
        lower.includes("invalid model");
      if (isModelUnavailable) {
        return {
          statusText: "The configured AI model is unavailable.",
          actionHintText:
            "The server model may need updating, or try a different model in API Settings if you use your own key.",
          toastText:
            "The AI model configured on the server is unavailable (deprecated or not found). Try again later or change the model in Settings.",
          toastSeverity: "error",
        };
      }
      return {
        statusText: "The AI model returned an unexpected response.",
        actionHintText: "Try rephrasing your prompt — shorter or more specific often works.",
        toastText: "The AI model returned an unexpected response. Try rephrasing your prompt.",
        toastSeverity: "error",
      };
    }
    if (status === 500) {
      return {
        statusText: "The brain simulation failed.",
        actionHintText: "Try a shorter or simpler prompt.",
        toastText: "The brain simulation failed. Try a shorter or simpler prompt.",
        toastSeverity: "error",
      };
    }
  }

  const fallback = detail && detail.trim() ? detail.trim() : "Request failed. Please try again.";
  return {
    statusText: fallback,
    actionHintText: "Check the message above and try again.",
    toastText: fallback,
    toastSeverity: "error",
  };
}
