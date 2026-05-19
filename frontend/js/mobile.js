/*
 * mobile.js — responsive mobile shell for ≤768px viewports.
 *
 * - Moves (not clones) the existing floating panels into bottom-sheet drawer slots
 *   so every getElementById reference from main.js keeps pointing at the same node.
 * - Restores panels to their desktop parents when the viewport grows past the
 *   breakpoint, preserving simulation state across resizes.
 * - Mirrors #status-chip → #cg-mobile-status and #play-pause-btn label →
 *   #cg-mobile-play via MutationObserver, so main.js stays untouched.
 */

const MOBILE_BREAKPOINT = 768;

const PANEL_MOVES = [
  { selector: ".cognigraph-input-panel",      slot: "input"    },
  { selector: ".analysis-panel",              slot: "analysis" },
  { selector: ".cognigraph-signatures-panel", slot: "analysis" },
  { selector: ".cognigraph-log-panel",        slot: "log"      },
];

const originalParents = new WeakMap();
let lastIsMobile = null;

const isMobile = () => window.innerWidth <= MOBILE_BREAKPOINT;

const q = (sel, root = document) => root.querySelector(sel);
const qa = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function getSlot(name) {
  return q(`[data-drawer-slot="${name}"]`);
}

function moveToDrawers() {
  for (const { selector, slot } of PANEL_MOVES) {
    const el = q(selector);
    const target = getSlot(slot);
    if (!el || !target) continue;
    if (!originalParents.has(el)) {
      originalParents.set(el, {
        parent: el.parentNode,
        nextSibling: el.nextSibling,
      });
    }
    target.appendChild(el);
  }
}

function restoreToDesktop() {
  for (const { selector } of PANEL_MOVES) {
    const el = q(selector);
    if (!el) continue;
    const home = originalParents.get(el);
    if (!home || !home.parent) continue;
    if (home.nextSibling && home.nextSibling.parentNode === home.parent) {
      home.parent.insertBefore(el, home.nextSibling);
    } else {
      home.parent.appendChild(el);
    }
  }
}

function closeAllDrawers() {
  qa(".cg-drawer").forEach((d) => d.setAttribute("aria-hidden", "true"));
  const backdrop = q("[data-drawer-backdrop]");
  if (backdrop) {
    backdrop.removeAttribute("data-open");
    backdrop.hidden = true;
  }
  document.body.style.overflow = "";
}

function openDrawer(name) {
  if (!isMobile()) return;
  closeHamburger();
  qa(".cg-drawer").forEach((d) => {
    d.setAttribute("aria-hidden", d.dataset.drawer === name ? "false" : "true");
  });
  const backdrop = q("[data-drawer-backdrop]");
  if (backdrop) {
    backdrop.hidden = false;
    requestAnimationFrame(() => backdrop.setAttribute("data-open", ""));
  }
  document.body.style.overflow = "hidden";
}

function toggleHamburger(force) {
  const menu = q("#cg-hamburger-menu");
  const btn = q("#cg-hamburger-btn");
  if (!menu || !btn) return;
  const next = typeof force === "boolean"
    ? force
    : menu.getAttribute("aria-hidden") === "true";
  menu.setAttribute("aria-hidden", next ? "false" : "true");
  btn.setAttribute("aria-expanded", next ? "true" : "false");
}

function closeHamburger() {
  toggleHamburger(false);
}

function syncMobileStatus() {
  const src = q("#status-chip");
  const dst = q("#cg-mobile-status");
  if (!src || !dst) return;
  dst.textContent = src.textContent;
  new MutationObserver(() => {
    dst.textContent = src.textContent;
  }).observe(src, { childList: true, characterData: true, subtree: true });
}

function syncMobilePlay() {
  const src = q("#play-pause-btn");
  const dstLabel = q("[data-mobile-play-label]");
  const dstBtn = q("#cg-mobile-play");
  const dstIcon = dstBtn && dstBtn.querySelector(".cg-action-icon");
  if (!src || !dstLabel || !dstBtn) return;

  const tr = (txt) => {
    const t = (txt || "").trim().toLowerCase();
    if (t === "pause")  return { label: "Duraklat", icon: "⏸" };
    if (t === "resume") return { label: "Devam",    icon: "▶" };
    if (t === "play")   return { label: "Oynat",    icon: "▶" };
    return { label: txt || "Oynat", icon: "▶" };
  };
  const apply = () => {
    const { label, icon } = tr(src.textContent);
    dstLabel.textContent = label;
    if (dstIcon) dstIcon.textContent = icon;
    dstBtn.disabled = src.disabled;
    dstBtn.style.opacity = src.disabled ? "0.45" : "";
  };
  apply();
  new MutationObserver(apply).observe(src, {
    childList: true,
    characterData: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["disabled"],
  });
}

function handleAction(action) {
  switch (action) {
    case "open-input":
      openDrawer("input");
      break;
    case "open-api-settings": {
      openDrawer("input");
      const toggle = q("#toggle-settings-btn");
      if (toggle && toggle.getAttribute("aria-expanded") === "false") {
        toggle.click();
      }
      const panel = q("#settings-panel");
      if (panel) panel.scrollIntoView({ behavior: "smooth", block: "start" });
      break;
    }
    case "show-help": {
      openDrawer("input");
      const help = q(".glass-panel--info details");
      if (help) help.open = true;
      break;
    }
    case "copy-link": {
      const btn = q("#copy-demo-link-btn");
      if (btn) btn.click();
      break;
    }
  }
  closeHamburger();
}

function bindOnce() {
  document.addEventListener("click", (e) => {
    const target = e.target;
    if (!(target instanceof Element)) return;

    const drawerBtn = target.closest("[data-drawer-target]");
    if (drawerBtn) {
      openDrawer(drawerBtn.dataset.drawerTarget);
      return;
    }
    if (target.closest("[data-drawer-close]") || target.closest("[data-drawer-backdrop]")) {
      closeAllDrawers();
      return;
    }
    if (target.closest("#cg-hamburger-btn")) {
      toggleHamburger();
      return;
    }
    const menuItem = target.closest(".cg-menu-item[data-action]");
    if (menuItem) {
      handleAction(menuItem.dataset.action);
      return;
    }
    if (target.closest("#cg-mobile-play")) {
      const desktop = q("#play-pause-btn");
      if (desktop && !desktop.disabled) desktop.click();
      return;
    }
    // Click outside hamburger menu closes it.
    if (!target.closest("#cg-hamburger-menu") && !target.closest("#cg-hamburger-btn")) {
      closeHamburger();
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeAllDrawers();
      closeHamburger();
    }
  });
}

function handleResize() {
  const now = isMobile();
  if (now === lastIsMobile) return;
  if (now) {
    moveToDrawers();
  } else {
    closeAllDrawers();
    closeHamburger();
    restoreToDesktop();
  }
  lastIsMobile = now;
}

function init() {
  bindOnce();
  syncMobileStatus();
  syncMobilePlay();
  handleResize();
  let resizeTimer = null;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(handleResize, 80);
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init, { once: true });
} else {
  init();
}
