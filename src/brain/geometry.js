// brain/geometry.js — the procedural brain: hemispheres, cerebellum, brainstem and every
// discrete subcortical structure. No top-level side effects: nothing here runs until
// buildBrain() is called. Coordinates are proportional, NOT MNI millimetres.
//
// World frame:  +y = superior   +z = anterior   +x = the subject's LEFT.
// (three.js is right-handed. With +y up and +z pointing at a camera that is looking the
// subject in the face, the subject's own right hand falls on -x — the same way it does when
// you stand in front of someone. Rounds 1-2 had this backwards and put the "left" hemisphere,
// the one that owns Broca and Wernicke, on the anatomical right.)
// Hemisphere-local frame (what parcellation.js sees): +x = lateral, so the RIGHT hemisphere
// is the same geometry with mesh.scale.x = -1 (three.js flips the winding for us).

import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { createNoise3D, fbm3 } from '../lib/noise.js';
import { CORTICAL_IDS, CORTICAL_PATCHES, regionIdForDirection } from './parcellation.js';

/* ------------------------------------------------------------------ shape constants */

export const BRAIN = {
  detail: 46,       // three's icosahedron detail is LINEAR: 20*(detail+1)^2 = 44180 tris.
                    // Both hemispheres ~88k; the whole scene stays under the 120k budget.
                    // Density is here to make the smoothing pass work, not to add detail.
  sx: 0.78,         // half-width  (medio-lateral)
  sy: 0.74,         // half-height (inferior-superior)
  sz: 1.12,         // half-length (antero-posterior)
  meanRadius: 0.88, // the number the fold depths below are quoted as a percentage of
  gap: 0.105,       // longitudinal fissure: each hemisphere is pushed this far off the midline.
                    // 0.085 let the two medial walls interleave near the vertex, and two
                    // blended surfaces a fraction of a millimetre apart moire into dots.

  // --- gyral field ---------------------------------------------------------------
  // ONE low-frequency, domain-warped field. No fine octave, no per-vertex jitter: every
  // previous round put detail at roughly the vertex spacing, and detail at vertex spacing
  // is indistinguishable from noise. Measured (tools: scratch fold-tune) at these numbers
  // the field crosses zero about 7 times front-to-back and 7 times top-to-bottom, which is
  // the fold count a good lateral illustration shows.
  foldFreq: 1.55,      // low: one groove roughly every 0.30 world units
  foldOctaves: 2,
  warpFreq: 0.90,      // the position is displaced by a SECOND, even lower-frequency field
  warpAmp: 0.55,       // before it is sampled — that is what makes the folds meander
  foldAnisoY: 1.25,    // squash-free anisotropy: the domain is stretched along z, so the
  foldAnisoZ: 0.70,    // grooves come out running front-to-back like the real gyri.
                       // 0.55 stretched them so hard that on the frontal lobe — where they
                       // point at the camera — they foreshortened into a blank dome.
  foldBand: 0.34,      // |field| < this = groove. ~0.134 world units wide ≈ 6.0% of length
  sulcusDepth: 0.026,  // crown-to-floor, ≈ 3.0% of meanRadius
  sylvianDepth: 0.046, // the two named fissures are carved deeper (≈ 5% / 4%) because they
  centralDepth: 0.036, // are landmarks, not texture

  // --- smoothing -----------------------------------------------------------------
  smoothPasses: 2,     // uniform Laplacian on positions, after displacement
  smoothLambda: 0.55,  // enough to kill icosahedral faceting, too little to erase a 0.134-
                       // wide groove (measured attenuation at that wavelength: ~8%)
  aoSmoothPasses: 3,   // the baked occlusion attribute needs MORE relaxation than the
                       // positions: it is not smoothed by the shading the way a normal is
  seed: 20260905,
};

/* -------------------------------------------------------------------------- colours */
// Chosen for DISTINGUISHABILITY, not realism: every structure needs to stay separable
// through a translucent shell and as an 8px dot in the Atlas list. Hues are spread around
// the wheel at similar saturation/lightness so no structure reads as "more important".
// Cortical patches get cool, low-contrast tints (they sit on the pale shell). Deep
// structures are muted on purpose: the brain has to read as a brain first, and the deep
// structures as things sitting inside it — not as glowing beads in jelly.

export const REGION_COLORS = {
  // cortical patches (soft tints painted into the translucent shell)
  v1: 0x7b8ad6,
  v4: 0x7fceda,
  mt_v5: 0x68cba6,
  ffa: 0xe2df9d,
  a1: 0xe3a588,
  wernicke: 0xe5afe8,
  broca: 0xd78bbf,
  s1: 0xa3dcad,
  m1: 0x82cd66,
  ppc: 0xaea0e5,
  dlpfc: 0xb8cf7a,
  vmpfc_ofc: 0xcb728e,
  acc: 0x469baf,
  // Discrete structures. Every hue here is ~20% less saturated than the first pass: the
  // deep structures are the SECOND thing you should see, after the cortex. The set was
  // re-optimised after desaturating (see tests/scene-contract.test.mjs) so the smallest
  // RGB distance in the 28-colour palette actually went up, from 42.5 to 50.9.
  insula: 0x915380,          // muted rose — exposed patch standing in for cortex folded inside the lateral sulcus
  corpus_callosum: 0xefe8e1, // ivory
  thalamus: 0xd5b256,        // pale gold
  hypothalamus: 0x418550,    // sage green
  amygdala: 0xd15860,        // warm red
  hippocampus: 0xd7772f,     // amber
  striatum: 0x6257d2,        // indigo — deliberately NOT the violet atlas accent (0xb58cff),
                             // which the old 0xa06fe8 collided with whenever it was selected
  globus_pallidus: 0xbfd5d9, // light steel
  stn: 0x476c93,             // deep steel
  nucleus_accumbens: 0xe059c4, // pink
  vta: 0xc14134,             // dusk orange
  substantia_nigra: 0x8e4a39,  // deeper dusk orange
  locus_coeruleus: 0x56afdb, // blue ("the blue spot")
  raphe_nuclei: 0x43a77d,    // teal
  cerebellum: 0x9198a0,      // cool cyan-grey
};

/** Base colour of a region in the 3D scene (hex number). Used by the Atlas list dots too. */
export function regionColor(id) {
  return Object.prototype.hasOwnProperty.call(REGION_COLORS, id) ? REGION_COLORS[id] : 0x8892b0;
}

/* ---------------------------------------------------- discrete structure declarations */
// Every entry becomes one or more THREE.Mesh sharing a single regionId and material.
// `space: 'brainstem'` positions are children of the (tilted) brainstem group.

export const SUBCORTICAL_SPECS = [
  { id: 'thalamus', mirror: true, parts: [
    { kind: 'ellipsoid', at: [0.155, -0.010, -0.050], scale: [0.115, 0.105, 0.215], rotY: -0.18 }] },
  { id: 'hypothalamus', mirror: false, parts: [
    { kind: 'ellipsoid', at: [0.000, -0.215, 0.055], scale: [0.105, 0.062, 0.085] }] },
  { id: 'amygdala', mirror: true, parts: [
    { kind: 'ellipsoid', at: [0.335, -0.375, 0.185], scale: [0.085, 0.075, 0.115], rotY: 0.28, rotZ: 0.2 }] },
  { id: 'hippocampus', mirror: true, parts: [
    { kind: 'tube', radius: 0.048, tubular: 36, radial: 8, points: [
      [0.335, -0.400, 0.075], [0.395, -0.420, -0.060], [0.415, -0.400, -0.200],
      [0.375, -0.335, -0.330], [0.305, -0.265, -0.415], [0.225, -0.205, -0.415]] }] },
  { id: 'striatum', mirror: true, parts: [
    // caudate: a long C arcing over the thalamus and curling down into the temporal lobe
    { kind: 'tube', radius: 0.050, tubular: 40, radial: 8, points: [
      [0.200, -0.080, 0.400], [0.220, 0.060, 0.280], [0.235, 0.135, 0.050],
      [0.250, 0.100, -0.200], [0.290, -0.040, -0.330], [0.320, -0.200, -0.260]] },
    // putamen: a lens lateral to the pallidum
    { kind: 'ellipsoid', at: [0.365, -0.055, 0.055], scale: [0.075, 0.155, 0.225], rotY: 0.12 }] },
  { id: 'globus_pallidus', mirror: true, parts: [
    { kind: 'wedge', at: [0.255, -0.090, 0.030], scale: [0.052, 0.115, 0.155], rotY: 0.10 }] },
  { id: 'stn', mirror: true, parts: [
    { kind: 'ellipsoid', at: [0.145, -0.200, -0.020], scale: [0.048, 0.030, 0.062] }] },
  { id: 'nucleus_accumbens', mirror: true, parts: [
    { kind: 'ellipsoid', at: [0.175, -0.245, 0.335], scale: [0.055, 0.050, 0.058] }] },
  { id: 'vta', mirror: true, space: 'brainstem', parts: [
    { kind: 'ellipsoid', at: [0.050, -0.170, 0.075], scale: [0.038, 0.032, 0.038] }] },
  { id: 'substantia_nigra', mirror: true, space: 'brainstem', parts: [
    { kind: 'ellipsoid', at: [0.125, -0.190, 0.055], scale: [0.085, 0.026, 0.050], rotZ: 0.12 }] },
  { id: 'locus_coeruleus', mirror: true, space: 'brainstem', parts: [
    { kind: 'ellipsoid', at: [0.055, -0.400, -0.135], scale: [0.028, 0.030, 0.026] }] },
  { id: 'raphe_nuclei', mirror: false, space: 'brainstem', parts: [
    { kind: 'pearls', from: [0, -0.150, -0.010], to: [0, -0.800, -0.020], count: 6, radius: 0.026 }] },
  { id: 'corpus_callosum', mirror: false, parts: [
    { kind: 'tube', radius: 0.042, tubular: 52, radial: 9, widen: 4.2, flatten: 0.85, points: [
      [0, -0.060, 0.280], [0, 0.040, 0.400], [0, 0.140, 0.420], [0, 0.210, 0.300],
      [0, 0.235, 0.080], [0, 0.225, -0.160], [0, 0.170, -0.320], [0, 0.060, -0.380],
      [0, 0.000, -0.300]] }] },
  { id: 'insula', mirror: true, parts: [
    { kind: 'ellipsoid', at: [0.545, -0.105, 0.060], scale: [0.026, 0.120, 0.165], rotY: 0.08 }] },
];

/** Every REGIONS id that exists as a discrete mesh (cerebellum is built separately). */
export const SUBCORTICAL_IDS = SUBCORTICAL_SPECS.map((s) => s.id).concat(['cerebellum']);

/* ------------------------------------------------------------------------- utilities */

function brainClamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
function brainSmoothstep(e0, e1, x) {
  const t = brainClamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}
function brainLerp(a, b, t) { return a + (b - a) * t; }
/**
 * Groove profile: 1 where `v` is zero, falling to 0 as |v| passes `outer`.
 *
 * The smoothstep runs on v SQUARED, so the bottom of the groove is round. The obvious
 * `1 - smoothstep(inner, outer, Math.abs(v))` looks the same on a plot but has a corner at
 * v = 0, which puts a C0 crease along the centre line of every single sulcus; where that
 * crease comes out narrower than the distance between two vertices it snaps to the triangle
 * edges and reads as a dark zip fastener running down the fold.
 */
function brainGroove(v, inner, outer) {
  // `inner` > 0 gives the groove a FLAT floor, and the corner where that floor meets the
  // wall is the same one-vertex-wide crease in a different place. Every caller passes 0.
  return 1 - brainSmoothstep(inner * inner, outer * outer, v * v);
}

/** Math.max with a rounded corner: a hard max leaves a visible flat plane on the surface. */
function brainSoftMax(x, m, k) {
  const d = (x - m) / k;
  if (d > 20) return x;
  if (d < -20) return m;
  return m + k * Math.log1p(Math.exp(d));
}

/** Icosphere with welded vertices (smooth normals) and no uv seam. Always indexed. */
function brainIcoSphere(detail) {
  const raw = new THREE.IcosahedronGeometry(1, detail);
  raw.deleteAttribute('uv');
  raw.deleteAttribute('normal');
  // 1e-4, not 1e-5. mergeVertices hashes positions onto a grid of this size, and
  // IcosahedronGeometry emits the vertices along its twenty face seams from different
  // faces, so at a fine grid some of them land in neighbouring buckets and are never
  // welded. The result is a crack: computeVertexNormals gives the two sides different
  // normals and the Laplacian pass cannot see across it, so the seam shows up as a line
  // of alternating light and dark triangles — the zip-fastener artefact.
  const geo = mergeVertices(raw, 1e-4);
  raw.dispose();
  return geo;
}

/**
 * Uniform (umbrella) Laplacian smoothing of a per-vertex SCALAR, in place.
 *
 * The sulcal-occlusion attribute needs this as much as the positions do. The wall of a
 * groove is only about three vertices wide, so the raw attribute can swing by 0.9 across a
 * single edge; the positions survive that because they get relaxed, but an unrelaxed vertex
 * attribute keeps it, and Gouraud interpolation then draws the groove edge as a saw-tooth
 * that follows the triangle boundaries. Three passes take the worst edge step down to
 * something the shading can absorb.
 */
function brainSmoothScalar(geo, arr, passes, lambda) {
  const index = geo.getIndex();
  if (!index || passes <= 0) return arr;
  const idx = index.array;
  const n = arr.length;
  const sum = new Float64Array(n);
  const cnt = new Uint32Array(n);
  for (let pass = 0; pass < passes; pass++) {
    sum.fill(0); cnt.fill(0);
    for (let t = 0; t < idx.length; t += 3) {
      const a = idx[t], b = idx[t + 1], c = idx[t + 2];
      for (let e = 0; e < 3; e++) {
        const i = e === 0 ? a : (e === 1 ? b : c);
        const j = e === 0 ? b : (e === 1 ? c : a);
        sum[i] += arr[j]; sum[j] += arr[i];
        cnt[i]++; cnt[j]++;
      }
    }
    for (let i = 0; i < n; i++) {
      if (!cnt[i]) continue;
      arr[i] += lambda * (sum[i] / cnt[i] - arr[i]);
    }
  }
  return arr;
}

/**
 * Uniform (umbrella) Laplacian smoothing of POSITIONS, in place.
 *
 * This is the pass that turns "carved noise" into "a surface". Displacement along the
 * normal always leaves the icosahedron's own irregularity behind — the twelve 5-valence
 * vertices and the seams between the twenty faces — and at 0.55 opacity that irregularity
 * is exactly what reads as crumpled wax. Averaging each vertex towards its neighbours
 * attenuates whatever varies at the scale of a single edge almost completely, while a fold
 * fifteen edges wide loses only a few percent of its depth.
 *
 * Adjacency comes from the index buffer (mergeVertices guarantees there is one). Each
 * triangle contributes its three edges in both directions, so interior edges are counted
 * once per incident face — a mild area weighting, which is what we want on an icosphere
 * where the faces are not all the same size.
 */
function brainSmoothPositions(geo, passes, lambda) {
  const index = geo.getIndex();
  if (!index || passes <= 0) return;
  const idx = index.array;
  const pos = geo.attributes.position;
  const p = pos.array;
  const n = pos.count;
  const sum = new Float64Array(n * 3);
  const cnt = new Uint32Array(n);
  for (let pass = 0; pass < passes; pass++) {
    sum.fill(0); cnt.fill(0);
    for (let t = 0; t < idx.length; t += 3) {
      const a = idx[t], b = idx[t + 1], c = idx[t + 2];
      for (let e = 0; e < 3; e++) {
        const i = e === 0 ? a : (e === 1 ? b : c);
        const j = e === 0 ? b : (e === 1 ? c : a);
        sum[i * 3] += p[j * 3]; sum[i * 3 + 1] += p[j * 3 + 1]; sum[i * 3 + 2] += p[j * 3 + 2];
        sum[j * 3] += p[i * 3]; sum[j * 3 + 1] += p[i * 3 + 1]; sum[j * 3 + 2] += p[i * 3 + 2];
        cnt[i]++; cnt[j]++;
      }
    }
    for (let i = 0; i < n; i++) {
      const c = cnt[i];
      if (!c) continue;
      const inv = 1 / c;
      p[i * 3] += lambda * (sum[i * 3] * inv - p[i * 3]);
      p[i * 3 + 1] += lambda * (sum[i * 3 + 1] * inv - p[i * 3 + 1]);
      p[i * 3 + 2] += lambda * (sum[i * 3 + 2] * inv - p[i * 3 + 2]);
    }
  }
  pos.needsUpdate = true;
}

/* ---------------------------------------------------------------- cerebral hemisphere */

/**
 * Sculpt one hemisphere (local frame, +x = lateral) and tag every vertex with its
 * cortical patch. Returns { geometry, patchVerts, patchCentroid }.
 */
function brainBuildHemisphere(side) {
  const geo = brainIcoSphere(BRAIN.detail);
  const pos = geo.attributes.position;
  const n = pos.count;
  const dirs = new Float32Array(n * 3);
  const noise = createNoise3D(BRAIN.seed);

  // --- pass 1: ellipsoid + lobe masks + medial wall ---
  for (let i = 0; i < n; i++) {
    let dx = pos.getX(i), dy = pos.getY(i), dz = pos.getZ(i);
    const l = Math.hypot(dx, dy, dz) || 1;
    dx /= l; dy /= l; dz /= l;
    dirs[i * 3] = dx; dirs[i * 3 + 1] = dy; dirs[i * 3 + 2] = dz;
    const lat = Math.max(0, dx);

    const fm = brainSmoothstep(0.55, 1.0, dz);    // frontal pole
    const om = brainSmoothstep(0.55, 1.0, -dz);   // occipital pole
    // temporal lobe: inferior band, excluding both poles
    const tm = brainSmoothstep(0.05, 0.62, -dy)
      * (1 - brainSmoothstep(0.30, 0.92, -dz))
      * (1 - brainSmoothstep(0.50, 0.98, dz));

    let px = dx * BRAIN.sx, py = dy * BRAIN.sy, pz = dz * BRAIN.sz;

    // temporal lobe bulges laterally, hangs lower and a little forward
    if (dx > 0) px *= 1 + 0.24 * tm;
    py -= 0.25 * tm;
    pz += 0.10 * tm;
    // both poles are narrower and lower than the mid-brain girth
    px *= 1 - 0.22 * fm; py *= 1 - 0.12 * fm; pz *= 1 + 0.03 * fm;
    px *= 1 - 0.34 * om; py *= 1 - 0.30 * om; pz *= 1 + 0.02 * om;
    // Orbital surface: the underside of the frontal lobe sits well ABOVE the temporal pole.
    // Lifting it is what produces the step at the front end of the lateral fissure, and that
    // step is most of what makes the profile read as a brain.
    const orbital = brainSmoothstep(0.28, 0.80, dz) * brainSmoothstep(0.10, 0.70, -dy);
    py = brainLerp(py, brainSoftMax(py, -0.30, 0.055), orbital * 0.9);
    // Concave notch under the middle of the brain, where the midbrain leaves the hemispheres.
    // Deliberately limited to the medial-central region: flattening the whole underside turns
    // the silhouette into a bun.
    const baseMask = brainSmoothstep(0.20, 0.80, -dy)
      * (1 - brainSmoothstep(0.10, 0.52, lat))
      * (1 - brainSmoothstep(0.28, 0.80, Math.abs(dz)));
    py = brainLerp(py, brainSoftMax(py, -0.26, 0.055), baseMask);
    // Medial half collapses onto a shallow bowl → a flat medial face at x ≈ 0.
    // Blended, not branched: `if (dx < 0) px *= 0.09` is a step in the surface, and the
    // relaxation pass drags the vertices on either side of a step in different directions,
    // which shows up as a serrated zip-fastener line curving round the frontal pole.
    px *= brainLerp(0.09, 1.0, brainSmoothstep(-0.055, 0.055, dx));
    // longitudinal fissure: offset off the midline, opening wider towards the vertex
    px += BRAIN.gap + 0.045 * brainSmoothstep(0.05, 0.75, dy) * (1 - brainSmoothstep(0.0, 0.28, lat));

    pos.setXYZ(i, px, py, pz);
  }
  geo.computeVertexNormals();

  // --- pass 2: gyri / sulci along the sculpted normal ---
  // Carve grooves along the ZERO SET of a smooth field rather than displacing by the field
  // itself: a plain fbm bump map gives a lumpy sphere, whereas the zero set of a smooth
  // random field is a network of long meandering curves, which is what a sulcus is.
  // The field is sampled from the WORLD position, not from the sphere direction, so the
  // groove width is constant in world units instead of stretching where the ellipsoid is long.
  const nrm = geo.attributes.normal;
  const ff = BRAIN.foldFreq, wf = BRAIN.warpFreq, wa = BRAIN.warpAmp;
  // How deep in a groove each vertex sits, 0..1. Fed to the shader as ambient occlusion.
  // A sulcus 3% of the radius deep is geometrically correct and almost invisible through a
  // 0.55-opacity shell — a real sulcus reads dark because light does not reach the bottom
  // of it, not because of its silhouette. Baking that shadow is what makes shallow, smooth
  // folds legible without deepening them into the crumpled look.
  const sulcusAttr = new Float32Array(n);
  // How much of a vertex belongs to the collapsed MEDIAL face. Seen from the side, the far
  // hemisphere's medial wall is the one surface of it that still faces the camera, and it
  // reads as a big flat sheet hanging inside the near hemisphere. Fading it out in the
  // shader is what lets the lateral surface be the only thing you see.
  const medialAttr = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const dx = dirs[i * 3], dy = dirs[i * 3 + 1], dz = dirs[i * 3 + 2];
    const px = pos.getX(i), py = pos.getY(i), pz = pos.getZ(i);
    const lat = Math.max(0, dx);
    // Damp folding hard on the flat medial wall. Seen edge-on from a lateral view, ripples
    // on that collapsed face show up as a fringe of dark flaps along the silhouette.
    const damp = 0.10 + 0.90 * brainSmoothstep(0.0, 0.34, lat);
    // Domain warp: shift the sample point by a second, lower-frequency vector field. This
    // is the whole difference between "concentric ripples" and folds that wander.
    const wx = noise(px * wf + 19.1, py * wf - 7.4, pz * wf + 3.3);
    const wy = noise(px * wf - 4.8, py * wf + 12.6, pz * wf - 9.2);
    const wz = noise(px * wf + 31.7, py * wf + 2.9, pz * wf + 24.5);
    // Anisotropy: the domain is STRETCHED along z rather than squashed along y, so the
    // grooves run front-to-back like the superior/middle/inferior gyri without raising the
    // vertical fold count.
    const field = fbm3(
      (px + wa * wx) * ff,
      (py + wa * wy) * ff * BRAIN.foldAnisoY,
      (pz + wa * wz) * ff * BRAIN.foldAnisoZ,
      BRAIN.foldOctaves, 2.0, 0.5, noise);
    const groove = brainGroove(field, 0.0, BRAIN.foldBand);
    // Two named fissures, carved explicitly and deeper: they are what makes a lateral view
    // read as a brain rather than as a folded potato. Their bands are wide because the
    // smoothing pass below eats narrow creases first.
    const sylv = brainGroove(dy + 0.15 + 0.333 * dz, 0.0, 0.23)
      * brainSmoothstep(0.18, 0.62, lat)
      * (1 - brainSmoothstep(0.42, 0.85, -dz))
      * (1 - brainSmoothstep(0.60, 0.95, dz));
    const central = brainGroove(dz - (-0.12 + 0.35 * (1 - dy)), 0.0, 0.16)
      * brainSmoothstep(-0.30, 0.05, dy)
      * brainSmoothstep(-0.05, 0.25, dx);
    // 0.42 keeps the mean radius where pass 1 put it: crowns bulge a little, floors sink.
    const d = (-BRAIN.sulcusDepth * (groove - 0.42)
      - BRAIN.sylvianDepth * sylv - BRAIN.centralDepth * central) * damp;
    pos.setXYZ(i, px + nrm.getX(i) * d, py + nrm.getY(i) * d, pz + nrm.getZ(i) * d);
    // Combined multiplicatively rather than added-then-clamped: Math.min(1, ...) is another
    // corner, and a corner in a per-vertex attribute contours along the triangle edges.
    sulcusAttr[i] = 1 - (1 - 0.94 * groove * damp) * (1 - sylv) * (1 - central);
    medialAttr[i] = 1 - brainSmoothstep(0.0, 0.42, lat);
  }
  // --- pass 2b: relax. Removes the icosahedron's own faceting, keeps the folds. ---
  brainSmoothPositions(geo, BRAIN.smoothPasses, BRAIN.smoothLambda);
  brainSmoothScalar(geo, sulcusAttr, BRAIN.aoSmoothPasses, 0.65);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();

  // --- pass 3: per-vertex parcellation, tint, highlight and lesion attributes ---
  const regionIdAttr = new Float32Array(n);
  const tint = new Float32Array(n * 4);
  const highlight = new Float32Array(n);
  const lesion = new Float32Array(n);
  const hlColor = new Float32Array(n * 3);
  const buckets = new Map();
  const patchById = new Map(CORTICAL_PATCHES.map((p) => [p.id, p]));
  const dir = { x: 0, y: 0, z: 0 };
  const col = new THREE.Color();
  for (let i = 0; i < n; i++) {
    dir.x = dirs[i * 3]; dir.y = dirs[i * 3 + 1]; dir.z = dirs[i * 3 + 2];
    const id = regionIdForDirection(dir, side);
    const idx = CORTICAL_IDS.indexOf(id);
    regionIdAttr[i] = idx;                       // -1 == lobe fallback == not a REGIONS id
    if (idx >= 0) {
      let b = buckets.get(id); if (!b) { b = []; buckets.set(id, b); }
      b.push(i);
      col.setHex(regionColor(id));
      // Feather the patch edge. A cone boundary is a hard circle, and a hard circle of
      // flat colour on a folded surface reads as a decal stuck to it rather than as a
      // region of it. The tint fades out across the outer third of the cone.
      const patch = patchById.get(id);
      let w = 1;
      if (patch) {
        const dotc = dir.x * patch.center.x + dir.y * patch.center.y + dir.z * patch.center.z;
        const ang = Math.acos(dotc < -1 ? -1 : (dotc > 1 ? 1 : dotc));
        w = brainSmoothstep(0, 0.38 * patch.radius, patch.radius - ang);
      }
      tint[i * 4] = col.r; tint[i * 4 + 1] = col.g; tint[i * 4 + 2] = col.b; tint[i * 4 + 3] = w;
    }
  }
  geo.setAttribute('sulcus', new THREE.BufferAttribute(sulcusAttr, 1));
  geo.setAttribute('medial', new THREE.BufferAttribute(medialAttr, 1));
  geo.setAttribute('regionId', new THREE.BufferAttribute(regionIdAttr, 1));
  geo.setAttribute('tint', new THREE.BufferAttribute(tint, 4));
  geo.setAttribute('highlight', new THREE.BufferAttribute(highlight, 1));
  geo.setAttribute('lesion', new THREE.BufferAttribute(lesion, 1));
  geo.setAttribute('hlColor', new THREE.BufferAttribute(hlColor, 3));

  const patchVerts = new Map();
  const patchCentroid = new Map();
  for (const [id, list] of buckets) {
    const arr = Uint32Array.from(list);
    patchVerts.set(id, arr);
    let cx = 0, cy = 0, cz = 0;
    for (let k = 0; k < arr.length; k++) { const i = arr[k]; cx += pos.getX(i); cy += pos.getY(i); cz += pos.getZ(i); }
    patchCentroid.set(id, new THREE.Vector3(cx / arr.length, cy / arr.length, cz / arr.length));
  }
  return { geometry: geo, patchVerts, patchCentroid };
}

/* ------------------------------------------------------------------------ cerebellum */

function brainBuildCerebellum() {
  const geo = brainIcoSphere(20);   // 8820 tris — dense enough that the folia survive smoothing
  const pos = geo.attributes.position;
  const n = pos.count;
  const noise = createNoise3D(BRAIN.seed + 77);
  const dirs = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    let dx = pos.getX(i), dy = pos.getY(i), dz = pos.getZ(i);
    const l = Math.hypot(dx, dy, dz) || 1; dx /= l; dy /= l; dz /= l;
    dirs[i * 3] = dx; dirs[i * 3 + 1] = dy; dirs[i * 3 + 2] = dz;
    // vermis: a shallow midline waist between the two cerebellar hemispheres
    const vermis = 1 - 0.10 * Math.exp(-(dx * dx) / 0.030);
    pos.setXYZ(i, dx * 0.545 * vermis, dy * 0.300 * vermis, dz * 0.370 * vermis);
  }
  geo.computeVertexNormals();
  const nrm = geo.attributes.normal;
  for (let i = 0; i < n; i++) {
    const dx = dirs[i * 3], dy = dirs[i * 3 + 1], dz = dirs[i * 3 + 2];
    const y = pos.getY(i), z = pos.getZ(i);
    // Folia: fine parallel ripples stacked along y, bent by a very low-frequency warp so
    // they curve the way real folia follow the surface. The fbm "grain" the earlier rounds
    // added on top is gone — it was the same mistake as the cortex's fine octave, only on a
    // smaller mesh, and it is what made the cerebellum read as a lump of gravel.
    const bend = fbm3(dx * 1.6 + 4.4, dy * 1.6 - 2.8, dz * 1.6 + 6.9, 1, 2.0, 0.5, noise);
    const d = Math.sin(y * 34.0 + z * 3.2 + bend * 2.4) * 0.0155;
    pos.setXYZ(i, pos.getX(i) + nrm.getX(i) * d, y + nrm.getY(i) * d, z + nrm.getZ(i) * d);
  }
  brainSmoothPositions(geo, BRAIN.smoothPasses, BRAIN.smoothLambda);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

/* ------------------------------------------------------------------------- brainstem */

function brainBuildBrainstem() {
  const profile = [
    [0.150, 0.020], [0.175, -0.060], [0.200, -0.160], [0.235, -0.260], [0.235, -0.340],
    [0.190, -0.420], [0.150, -0.500], [0.130, -0.600], [0.105, -0.720], [0.090, -0.860],
    [0.085, -0.960],
  ].map((p) => new THREE.Vector2(p[0], p[1]));
  const geo = new THREE.LatheGeometry(profile, 28);
  geo.computeVertexNormals();
  return geo;
}

/* --------------------------------------------------------------- discrete structures */

function brainPartGeometry(part) {
  if (part.kind === 'ellipsoid') {
    const g = new THREE.SphereGeometry(1, 16, 11);
    g.scale(part.scale[0], part.scale[1], part.scale[2]);
    if (part.rotZ) g.rotateZ(part.rotZ);
    if (part.rotY) g.rotateY(part.rotY);
    g.translate(part.at[0], part.at[1], part.at[2]);
    return g;
  }
  if (part.kind === 'wedge') {
    const g = new THREE.OctahedronGeometry(1, 1);
    g.scale(part.scale[0], part.scale[1], part.scale[2]);
    if (part.rotY) g.rotateY(part.rotY);
    g.translate(part.at[0], part.at[1], part.at[2]);
    return g;
  }
  if (part.kind === 'tube') {
    const pts = part.points.map((p) => new THREE.Vector3(p[0], p[1], p[2]));
    const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.5);
    const g = new THREE.TubeGeometry(curve, part.tubular, part.radius, part.radial, false);
    if (part.widen || part.flatten) g.scale(part.widen || 1, part.flatten || 1, 1);
    return g;
  }
  if (part.kind === 'pearls') {
    const list = [];
    for (let i = 0; i < part.count; i++) {
      const t = part.count === 1 ? 0 : i / (part.count - 1);
      const g = new THREE.SphereGeometry(part.radius * (1 - 0.25 * t), 10, 7);
      g.translate(
        brainLerp(part.from[0], part.to[0], t),
        brainLerp(part.from[1], part.to[1], t),
        brainLerp(part.from[2], part.to[2], t));
      list.push(g);
    }
    return list;
  }
  return new THREE.SphereGeometry(0.04, 8, 6);
}

/**
 * Resting self-illumination of a deep structure. Deliberately near zero: at rest the
 * structures should be LIT, not glowing, so the cortex stays the brightest thing on
 * screen. scene.js ramps this up on hover and selection (see BRAIN_EMISSIVE_* there).
 */
export const STRUCTURE_REST_EMISSIVE = 0.04;

function brainStructureMaterial(hex) {
  const c = new THREE.Color(hex);
  return new THREE.MeshStandardMaterial({
    color: c.clone(),
    emissive: c.clone(),
    emissiveIntensity: STRUCTURE_REST_EMISSIVE,
    roughness: 0.55,
    metalness: 0.0,
    transparent: false,   // opaque so they survive the high-quality transmission capture
    opacity: 1,
  });
}

/* ------------------------------------------------------------------------ the builder */

/**
 * Build the whole brain. Returns a descriptor the scene wires up; nothing here touches
 * the DOM or the renderer.
 */
export function buildBrain() {
  const group = new THREE.Group();
  group.name = 'brain';

  // --- cortex shell -------------------------------------------------------------
  // Cool blue-grey, semi-matte with a whisper of clearcoat. Rounds 1-2 used a warm pale
  // grey with a warm sheen; against this dark blue UI that reads as beige wax, and the
  // sheen put a highlight on every single fold, which is half of what made the surface
  // look crumpled. A desaturated cool surface belongs to the page and lets the coloured
  // structures underneath be the only saturated thing in the frame.
  const cortexMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x9ea6c2,         // blue-grey
    roughness: 0.55,
    metalness: 0.0,
    transparent: true,
    opacity: 0.55,           // matches the #cortex-opacity slider default
    // depthWrite OFF: the shell is a single translucent skin, and writing depth from a
    // translucent surface hides the deep structures behind whichever fold got drawn first.
    // Safe here only because of FrontSide below — the far wall is culled, so there is just
    // one layer to blend, except in the deepest fissures.
    depthWrite: false,
    // FRONT faces only. Double-sided, the far wall of the shell blended over the near one
    // in whatever order the triangles happened to be in, and the interference between two
    // folded surfaces is exactly the "crumpled paper" look. One skin, structures behind it.
    side: THREE.FrontSide,
    forceSinglePass: true,
    clearcoat: 0.20,         // a subtle sheen along the gyral crowns, not a wet look
    clearcoatRoughness: 0.5,
  });

  const hemispheres = [];
  for (const side of ['right', 'left']) {
    const built = brainBuildHemisphere(side);
    const mesh = new THREE.Mesh(built.geometry, cortexMaterial);
    mesh.name = 'hemisphere-' + side;
    mesh.userData.side = side;
    mesh.renderOrder = 2;    // the shell is the LAST thing drawn, over everything it veils
    // The hemisphere is authored with +x lateral, and +x is the subject's LEFT (see the
    // header): so it is the RIGHT hemisphere that gets mirrored. Getting this backwards
    // put Broca and Wernicke on the anatomical right in rounds 1-2.
    if (side === 'right') mesh.scale.x = -1;
    group.add(mesh);
    hemispheres.push({ side, mesh, geometry: built.geometry, patchVerts: built.patchVerts, patchCentroid: built.patchCentroid });
  }

  // --- structures ---------------------------------------------------------------
  const structures = new Map();   // regionId -> { id, meshes[], material, baseColor }
  const pickables = [];

  function addStructure(id, meshes) {
    let s = structures.get(id);
    if (!s) { s = { id, meshes: [], material: null, baseColor: regionColor(id) }; structures.set(id, s); }
    for (const m of meshes) {
      m.userData.regionId = id;
      s.meshes.push(m);
      pickables.push(m);
      if (!s.material) s.material = m.material;
    }
    return s;
  }

  // brainstem (not a REGIONS id — it hosts VTA / SN / LC / raphe and is not pickable)
  const brainstem = new THREE.Group();
  brainstem.position.set(0, -0.20, -0.04);
  brainstem.rotation.x = 0.22;
  const stemMesh = new THREE.Mesh(brainBuildBrainstem(), new THREE.MeshStandardMaterial({
    color: 0x99a1b8, emissive: 0x1e2230, emissiveIntensity: 0.20,
    roughness: 0.72, metalness: 0.0, transparent: true, opacity: 0.62, depthWrite: false,
    side: THREE.DoubleSide, forceSinglePass: true,
  }));
  stemMesh.name = 'brainstem';
  stemMesh.renderOrder = 1;   // transparent, but under the shell
  brainstem.add(stemMesh);
  group.add(brainstem);

  for (const spec of SUBCORTICAL_SPECS) {
    const material = brainStructureMaterial(regionColor(spec.id));
    const parent = spec.space === 'brainstem' ? brainstem : group;
    const meshes = [];
    for (const part of spec.parts) {
      const built = brainPartGeometry(part);
      const geos = Array.isArray(built) ? built : [built];
      for (const g of geos) {
        const m = new THREE.Mesh(g, material);
        m.name = spec.id;
        parent.add(m);
        meshes.push(m);
        if (spec.mirror) {
          const mm = new THREE.Mesh(g, material);
          mm.name = spec.id + '-l';
          mm.scale.x = -1;
          parent.add(mm);
          meshes.push(mm);
        }
      }
    }
    addStructure(spec.id, meshes);
  }

  // cerebellum is both a rendered surface and an atlas entry
  const cbMaterial = brainStructureMaterial(regionColor('cerebellum'));
  cbMaterial.roughness = 0.74;
  const cerebellum = new THREE.Mesh(brainBuildCerebellum(), cbMaterial);
  // Low and well back: in a lateral view the cerebellum has to clear the occipital pole's
  // silhouette, otherwise it is just a grey smudge seen through the shell.
  cerebellum.position.set(0, -0.68, -0.90);
  cerebellum.rotation.x = -0.10;
  cerebellum.name = 'cerebellum';
  group.add(cerebellum);
  addStructure('cerebellum', [cerebellum]);

  group.updateMatrixWorld(true);

  return {
    group,
    hemispheres,
    cortexMaterial,
    structures,
    pickables,
    brainstem,
    brainstemMesh: stemMesh,
    cerebellum,
    corticalIds: CORTICAL_IDS.slice(),
    structureIds: Array.from(structures.keys()),
    patches: CORTICAL_PATCHES,
  };
}
