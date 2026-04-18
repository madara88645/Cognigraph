import * as THREE from "three";
import { DEFAULT_VFX } from "./constants.js";

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
  if (h === "#E0FFFF" || h === "#FFD700" || h === "#FFBF00" || h === "#FFF8F0") return "text-slate-900";
  return "text-white";
}
