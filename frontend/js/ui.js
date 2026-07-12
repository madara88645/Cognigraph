import * as THREE from "three";
import {
  CORTISOL_OPTIMAL_MAX,
  CORTISOL_REGIME_LABEL_OPTIMAL,
  CORTISOL_REGIME_LABEL_TOXIC,
  DEFAULT_VFX,
  HPA_HINT_OPTIMAL,
  HPA_HINT_TOXIC,
} from "./constants.js";

export function hexToThreeColor(hex) {
  const h = String(hex || "").replace("#", "").trim();
  if (!/^[0-9A-Fa-f]{6}$/.test(h)) return new THREE.Color(0xe0ffff);
  return new THREE.Color(parseInt(h, 16));
}

export function mergeVfxProfile(raw) {
  const v = { ...DEFAULT_VFX };
  if (!raw || typeof raw !== "object") return v;
  for (const key of Object.keys(DEFAULT_VFX)) {
    if (key === "glow_hex" && typeof raw[key] === "string" && /^#[0-9A-Fa-f]{6}$/.test(raw[key])) {
      v[key] = raw[key];
    } else if (typeof raw[key] === "number" && Number.isFinite(raw[key])) {
      v[key] = raw[key];
    }
  }
  return v;
}

export function neuromodPillTextClass(hex) {
  const h = (hex || "").toUpperCase();
  if (
    h === "#E0FFFF" ||
    h === "#40E0D0" ||
    h === "#FFD700" ||
    h === "#32CD32" ||
    h === "#FFBF00" ||
    h === "#FFF8F0"
  ) {
    return "text-slate-900";
  }
  return "text-white";
}

export function isCortisolOptimalIntensity(intensity) {
  return intensity <= CORTISOL_OPTIMAL_MAX;
}

export function cortisolRegimeLabel(intensity) {
  return isCortisolOptimalIntensity(intensity)
    ? CORTISOL_REGIME_LABEL_OPTIMAL
    : CORTISOL_REGIME_LABEL_TOXIC;
}

export function formatNeuromodIntensityLabel(mod, intensity) {
  const pct = Math.round(Math.max(0, Math.min(1, intensity)) * 100);
  if (mod === "cortisol") {
    return `${pct}% · ${cortisolRegimeLabel(intensity)}`;
  }
  return `${pct}%`;
}

export function hpaContextHintText(mod, intensity) {
  if (mod !== "cortisol") return "";
  return isCortisolOptimalIntensity(intensity) ? HPA_HINT_OPTIMAL : HPA_HINT_TOXIC;
}

export function hpaHelpToastMessage(mod, intensity) {
  if (mod === "cortisol") {
    if (isCortisolOptimalIntensity(intensity)) {
      return (
        "Cortisol intensity ≤50% maps to optimal acute arousal in this demo " +
        "(e.g. waking, short manageable challenge)—a Yerkes–Dodson metaphor, not a lab cortisol value."
      );
    }
    return (
      "Cortisol intensity >50% maps to chronic/toxic load in this demo: " +
      "the simulation floods non-active lobes with noise. Not clinical cortisol concentration."
    );
  }
  return (
    "When cortisol is the dominant modulator, intensity ≤50% selects optimal acute arousal; " +
    ">50% selects chronic load. This is a classroom visualization, not medical measurement."
  );
}
