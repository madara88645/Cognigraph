// brain/parcellation.js — where the 13 cortical regions live on a hemisphere.
// PURE: no THREE import, no DOM, no top-level side effects. Testable in node.
//
// Coordinate frame (hemisphere-LOCAL, identical for both sides):
//   +x = lateral (away from the midline)   +y = superior (up)   +z = anterior (front)
// A "patch" is a cone around a unit centre direction. A direction belongs to the nearest
// patch whose angular radius contains it; otherwise it falls back to a lobe id, and lobe
// ids are deliberately NOT REGIONS ids so picking there resolves to null.
//
// Sizes/positions are hand-tuned to be proportionally plausible, not MNI coordinates.

function parcNorm(x, y, z) {
  const l = Math.hypot(x, y, z) || 1;
  return { x: x / l, y: y / l, z: z / l };
}

/** The 13 cortical patches. `radius` is an angular radius in radians. */
export const CORTICAL_PATCHES = [
  // occipital / visual
  { id: 'v1',        center: parcNorm(-0.30, -0.10, -1.00), radius: 0.50 },
  { id: 'v4',        center: parcNorm( 0.34, -0.74, -0.72), radius: 0.44 },
  { id: 'mt_v5',     center: parcNorm( 0.94, -0.20, -0.60), radius: 0.40 },
  // temporal
  { id: 'ffa',       center: parcNorm( 0.42, -0.90, -0.20), radius: 0.40 },
  { id: 'a1',        center: parcNorm( 0.96, -0.32,  0.04), radius: 0.36 },
  { id: 'wernicke',  center: parcNorm( 0.93, -0.16, -0.34), radius: 0.32, leftOnly: true },
  // frontal
  { id: 'broca',     center: parcNorm( 0.86,  0.06,  0.50), radius: 0.34, leftOnly: true },
  { id: 'm1',        center: parcNorm( 0.56,  0.80,  0.20), radius: 0.36 },
  { id: 'dlpfc',     center: parcNorm( 0.70,  0.40,  0.66), radius: 0.44 },
  { id: 'vmpfc_ofc', center: parcNorm( 0.16, -0.66,  0.76), radius: 0.46 },
  { id: 'acc',       center: parcNorm(-0.66,  0.40,  0.64), radius: 0.46 },
  // parietal
  { id: 's1',        center: parcNorm( 0.56,  0.82, -0.18), radius: 0.36 },
  { id: 'ppc',       center: parcNorm( 0.62,  0.60, -0.62), radius: 0.42 },
];

/** Ids of the cortical regions that exist as patches (all are REGIONS ids). */
export const CORTICAL_IDS = CORTICAL_PATCHES.map((p) => p.id);

/** Fallback ids for unassigned cortex. Deliberately NOT REGIONS ids → picking returns null. */
export const LOBE_IDS = ['frontal', 'parietal', 'temporal', 'occipital'];

/** Unit centre direction of a patch (hemisphere-local frame), or null. */
export function patchCenter(id) {
  const p = CORTICAL_PATCHES.find((q) => q.id === id);
  return p ? { x: p.center.x, y: p.center.y, z: p.center.z } : null;
}

/** Coarse lobe for a direction that no patch claims. Always returns one of LOBE_IDS. */
export function lobeForDirection(dir) {
  const d = parcNorm(dir.x, dir.y, dir.z);
  if (d.z > 0.32) return 'frontal';
  if (d.z < -0.52) return 'occipital';
  if (d.y < -0.10) return 'temporal';
  return 'parietal';
}

/**
 * Resolve a hemisphere-local direction to a cortical region id, or to a lobe fallback id.
 * @param {{x:number,y:number,z:number}} dir  direction on the hemisphere (need not be unit)
 * @param {'left'|'right'} side  only affects the language patches (Broca / Wernicke, left only)
 */
export function regionIdForDirection(dir, side = 'right') {
  const d = parcNorm(dir.x, dir.y, dir.z);
  let best = null;
  let bestAngle = Infinity;
  for (let i = 0; i < CORTICAL_PATCHES.length; i++) {
    const p = CORTICAL_PATCHES[i];
    if (p.leftOnly && side !== 'left') continue;
    const dot = d.x * p.center.x + d.y * p.center.y + d.z * p.center.z;
    const a = Math.acos(dot < -1 ? -1 : (dot > 1 ? 1 : dot));
    if (a <= p.radius && a < bestAngle) { bestAngle = a; best = p.id; }
  }
  return best || lobeForDirection(d);
}
