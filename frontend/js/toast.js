/** @type {HTMLElement | null} */
let container = null;

function ensureContainer() {
  if (container && document.body.contains(container)) return container;
  container = document.createElement("div");
  container.id = "cg-toast-stack";
  container.className = "cg-toast-stack";
  document.body.appendChild(container);
  return container;
}

/**
 * @param {string} message
 * @param {'error' | 'warning' | 'info' | 'success'} level
 */
export function showToast(message, level = "info") {
  const el = document.createElement("div");
  el.className = `cg-toast cg-toast--${level}`;
  el.setAttribute("role", "status");

  const text = document.createElement("span");
  text.className = "cg-toast__text";
  text.textContent = message;
  el.appendChild(text);

  const dismissMs = level === "error" ? 8000 : 5000;

  if (level === "error") {
    const close = document.createElement("button");
    close.type = "button";
    close.className = "cg-toast__close";
    close.setAttribute("aria-label", "Dismiss");
    close.textContent = "×";
    el.appendChild(close);
    let timer = window.setTimeout(() => removeToast(el), dismissMs);
    close.addEventListener("click", () => {
      window.clearTimeout(timer);
      removeToast(el);
    });
  } else {
    window.setTimeout(() => removeToast(el), dismissMs);
  }

  ensureContainer().appendChild(el);
}

/** @param {HTMLElement} el */
function removeToast(el) {
  if (!el.parentNode) return;
  el.classList.add("cg-toast--leave");
  window.setTimeout(() => {
    el.remove();
  }, 200);
}
