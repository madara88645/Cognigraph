/**
 * Escalating cold-start indicator. Fires `onSlow` once the request has
 * been in flight for `slowMs`, then `onVerySlow` at `verySlowMs`. Both
 * callbacks are guaranteed to be cancelled by `clear()`, which is safe
 * to call at any time (including before `start()`).
 *
 * The `scheduler` parameter exists so tests can inject a fake clock
 * instead of patching the global `window`.
 */
export function createColdStartTimer({
  onSlow,
  onVerySlow,
  slowMs = 5000,
  verySlowMs = 20000,
  scheduler = typeof window !== "undefined" ? window : globalThis,
} = {}) {
  let slowId = null;
  let verySlowId = null;

  function clear() {
    if (slowId !== null) {
      scheduler.clearTimeout(slowId);
      slowId = null;
    }
    if (verySlowId !== null) {
      scheduler.clearTimeout(verySlowId);
      verySlowId = null;
    }
  }

  return {
    start() {
      clear();
      if (typeof onSlow === "function") {
        slowId = scheduler.setTimeout(() => {
          slowId = null;
          onSlow();
        }, slowMs);
      }
      if (typeof onVerySlow === "function") {
        verySlowId = scheduler.setTimeout(() => {
          verySlowId = null;
          onVerySlow();
        }, verySlowMs);
      }
    },
    clear,
  };
}
