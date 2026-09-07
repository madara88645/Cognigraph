// brain/scene.js — renderer, camera, lights, picking, highlight/lesion state, camera
// easing, quality gating and the pulse effect. Implements the Scene API in CONTRACTS.md.
// No top-level side effects: everything happens inside createScene().

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { buildBrain, regionColor, STRUCTURE_REST_EMISSIVE } from './geometry.js';
import { CORTICAL_IDS } from './parcellation.js';

// Default pose: a lateral three-quarter of the LEFT hemisphere, 15 degrees above the
// horizontal, 22 degrees round towards the front. The left hemisphere is world +x (see the
// frame note in geometry.js), and looking at it from there puts the frontal pole on the
// viewer's LEFT and the cerebellum bottom-right — the standard lateral illustration.
//
// The brain has to fit in the GAP between two pieces of chrome, not just in the viewport: the
// side panel ends at x=352 and the Explain card starts at x=1028 (at 1440x900). At the old
// distance of 3.72 the silhouette was 71% of viewport height and 790px wide, which does not fit
// in a 676px gap — the cerebellum sat behind the card, roughly half of it hidden. Distance is
// now 4.50 (21% further back, silhouette 58% of viewport height), and the rig is panned along
// the camera's screen-RIGHT axis by 0.064 world units, which slides the brain LEFT until the
// frontal pole sits just clear of the side panel. Measured at 1440x900 off projected vertices:
// frontal pole x=369 (panel edge 365), cerebellum x 809-1028 and the WHOLE silhouette x 368-1028
// (card edge 1028), silhouette y 193-716. Nothing is behind the Explain card any more. The mesh's
// axis-aligned world bounding box still projects past 1028 at its corners, but those corners are
// empty space — clearing them too would need a 35% pull-back and a 46%-height brain.
//
// Note the pan direction is the opposite of the pre-round-4 pose. Pulling the camera back
// shrinks the silhouette towards the image centre, which already moves it off the side panel;
// the pan is now spending that slack on the other side, to get out from under the Explain card.
// The target is also 0.05 lower, which lifts the whole silhouette and centres it vertically.
// Panning the whole rig rather than moving the target alone keeps the view direction unchanged.
const BRAIN_HOME_POS = [4.038, 0.992, 1.569];
const BRAIN_HOME_TARGET = [0.009, -0.17, -0.065];
const BRAIN_HOVER_HZ = 30;

// Deep structures are lit, not self-lit, until you touch them: hover (0.35) lifts them a
// little, selection (1.0) makes them unmistakable.
const BRAIN_EMISSIVE_REST = STRUCTURE_REST_EMISSIVE;   // 0.04
const BRAIN_EMISSIVE_GAIN = 1.85;                      // added at highlight weight 1

/* ------------------------------------------------------------------ the backdrop */
// A flat near-black behind a translucent grey object is the worst case there is: the
// silhouette has nothing to sit against and the whole image reads as haze. A very soft
// radial vignette — deep navy where the brain is, near-black at the corners — costs one
// screen-space quad and gives the brain both a ground and an edge.
const BRAIN_BG_STOPS = [
  [0.00, '#181d33'],
  [0.34, '#121523'],   // the centre colour the brief asks for
  [0.70, '#0d0f17'],
  [1.00, '#0a0b0f'],   // the old flat clear colour, now only at the corners
];
const BRAIN_BG_EDGE = 0x0a0b0f;
// Ground glow: a wide, very dim disc lying under the brain. Additive and low enough that
// you read it as "the object is standing on something", not as a light source.
// Round 6, second pass: the first numbers (0x39487a at 0.5, a 5.2 x 4.0 disc at y -1.28)
// put a blue band across the bottom third of the frame and, because the shell is only 63%
// opaque, that band showed THROUGH the brain and tinted its whole lower half. A ground glow
// has to be barely there — you should only notice it by covering it up.
const BRAIN_GLOW_COLOR = 0x2b3862;
const BRAIN_GLOW_OPACITY = 0.16;

/* -------------------------------------------------------------- depth & idle motion */
// How much a structure at the FAR side of the brain recedes compared with one at the near
// side: it is tinted towards the backdrop navy and its self-illumination is cut. This is
// the difference between "structures inside a head" and "coloured stickers on the glass".
const BRAIN_DEPTH_CUE = 0.45;
const BRAIN_DEPTH_TINT = 0x2a3252;
// Half the front-to-back spread the deep structures actually occupy. Normalising by the
// whole bounding radius instead would squeeze every structure into the middle of the range.
const BRAIN_DEPTH_HALF = 0.85;

const BRAIN_IDLE_DELAY = 4.0;                        // seconds of stillness before the drift
const BRAIN_IDLE_SPEED = 4 * Math.PI / 180;          // 4 degrees per second
const BRAIN_IDLE_RAMP = 1.6;                         // seconds to reach that speed
const BRAIN_PULSE_HZ = 0.55;                         // selection breathing, ~1.8 s period
const BRAIN_PULSE_AMP = 0.10;                        // +/- 10 %

function brainEaseOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
function brainClamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }
/** smoothstep, JS side (geometry.js has its own; the bundle shares one scope). */
function brainStep01(e0, e1, x) {
  const t = brainClamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}

/**
 * Radial gradient painted into a canvas and used as scene.background. A texture background
 * is drawn as a full-screen quad with uv 0..1, so a square texture stretches to the
 * viewport and the vignette comes out as an ellipse — which is what you want on a 16:10
 * window anyway.
 */
function brainMakeBackdrop(size = 512) {
  const cv = document.createElement('canvas');
  cv.width = size; cv.height = size;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = BRAIN_BG_STOPS[BRAIN_BG_STOPS.length - 1][1];
  ctx.fillRect(0, 0, size, size);
  const g = ctx.createRadialGradient(size * 0.5, size * 0.5, size * 0.02, size * 0.5, size * 0.5, size * 0.68);
  for (const [stop, hex] of BRAIN_BG_STOPS) g.addColorStop(stop, hex);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;   // it is authored in sRGB; without this it renders washed out
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  return tex;
}

/** Soft round falloff, alpha only: the ground glow's texture. */
function brainMakeGlowTexture(size = 256) {
  const cv = document.createElement('canvas');
  cv.width = size; cv.height = size;
  const ctx = cv.getContext('2d');
  const g = ctx.createRadialGradient(size * 0.5, size * 0.5, 0, size * 0.5, size * 0.5, size * 0.5);
  g.addColorStop(0.0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.42)');
  g.addColorStop(0.72, 'rgba(255,255,255,0.09)');
  g.addColorStop(1.0, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearFilter;
  return tex;
}

export async function createScene(canvas, opts = {}) {
  /* ------------------------------------------------------------------ renderer */
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  const maxDpr = 1.5;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxDpr));
  renderer.setClearColor(BRAIN_BG_EDGE, 1);
  renderer.shadowMap.enabled = false;                       // never: see research tech notes
  const isWebGL2 = !!(renderer.capabilities && renderer.capabilities.isWebGL2);

  const scene = new THREE.Scene();
  const backdrop = brainMakeBackdrop();
  scene.background = backdrop;                              // soft navy vignette, not a flat black
  // Fog matches the CENTRE of the vignette, not its edge: what recedes should fade into the
  // colour actually behind the brain.
  scene.fog = new THREE.FogExp2(0x121523, 0.035);
  const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 100);
  camera.position.set(BRAIN_HOME_POS[0], BRAIN_HOME_POS[1], BRAIN_HOME_POS[2]);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.075;
  controls.rotateSpeed = 0.75;
  controls.minDistance = 1.3;
  controls.maxDistance = 12;
  controls.target.set(BRAIN_HOME_TARGET[0], BRAIN_HOME_TARGET[1], BRAIN_HOME_TARGET[2]);

  /* -------------------------------------------------------------------- lights */
  // Three-point rig aimed at the default camera. Directions are given in SCREEN terms for
  // that pose: the key is up and to the left (which is anterior and above), the fill comes
  // from screen right (posterior), the rim from behind the head.
  // One warm light against two cool ones is the whole colour story: it is what keeps a
  // desaturated blue-grey surface from going flat and grey, without warming it into beige.
  // Ambient stays low on purpose — the sulci only read as grooves if they can go dark, and
  // at 0.63 opacity a good part of that contrast is already lost to the blend.
  // Round 6 pulled the ambient term down (0.46 -> 0.34) and pushed the key up (2.25 -> 2.55).
  // Ambient light is what was flattening the folds: it reaches the floor of every groove
  // equally, so it pays the same into a crown and into a sulcus and the difference between
  // them shrinks. Directional light does not, which is the whole point of a key.
  scene.add(new THREE.HemisphereLight(0xc2d2f2, 0x2b3244, 0.38));
  const key = new THREE.DirectionalLight(0xffe6d0, 2.90); key.position.set(2.6, 3.8, 3.4); scene.add(key);
  // The fill was at 0.58 and aimed up from below-behind, which left the occipital and
  // posterior-temporal half of a lateral view as a dark void once the ambient came down.
  // Raised and re-aimed to rake in from screen right at roughly eye level.
  const fill = new THREE.DirectionalLight(0xa9b8e8, 0.72); fill.position.set(1.6, 0.5, -3.6); scene.add(fill);
  const rim = new THREE.DirectionalLight(0xbfd2ff, 0.74); rim.position.set(-3.2, 1.3, -1.6); scene.add(rim);

  /* ---------------------------------------------------------------- ground glow */
  // A wide dim disc lying flat under the brain. Seen from 15 degrees above the horizontal it
  // reads as a shallow pool of light, which is what stops the object floating in a void.
  const glowTex = brainMakeGlowTexture();
  const groundGlow = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({
      map: glowTex, color: BRAIN_GLOW_COLOR, transparent: true, opacity: BRAIN_GLOW_OPACITY,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide,
    }));
  groundGlow.rotation.x = -Math.PI / 2;
  groundGlow.position.set(0, -1.62, -0.15);
  // Shallow front-to-back: a deep disc seen from 15 degrees above rises up behind the object
  // and stops reading as a floor.
  groundGlow.scale.set(4.6, 2.3, 1);
  groundGlow.renderOrder = -1;
  groundGlow.name = 'ground-glow';
  scene.add(groundGlow);

  /* ---------------------------------------------------------------- the brain */
  const brain = buildBrain();
  scene.add(brain.group);
  const overlays = new THREE.Group(); overlays.name = 'overlays'; scene.add(overlays);
  const hemiMeshes = brain.hemispheres.map((h) => h.mesh);

  /* ------------------------------------- cortex shader: tint, rim, glow, lesion */
  let cortexShader = null;
  brain.cortexMaterial.onBeforeCompile = (shader) => {
    shader.uniforms.uRim = { value: 0.14 };                          // a cool edge, not a glow
    shader.uniforms.uRimColor = { value: new THREE.Color(0x93a9d6) };
    // 0.15, down from 0.26: at rest the thirteen patches should be a hint of where things
    // are, not thirteen coloured stains on a grey surface. Selection is what paints.
    shader.uniforms.uTintMix = { value: 0.15 };
    shader.uniforms.uSulcusAO = { value: 0.90 };                     // how dark a groove floor gets
    // 0.93: the far hemisphere's medial wall is the single biggest source of the veil over
    // the middle of the brain. Hiding that mesh entirely (a diagnostic render) is the
    // difference between "structures in a fog" and "structures inside a head".
    shader.uniforms.uMedialFade = { value: 0.93 };                   // how far the medial wall recedes
    shader.uniforms.uHiPulse = { value: 0.0 };                       // selection breathing, set per frame
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', [
        '#include <common>',
        'attribute float highlight;',
        'attribute float lesion;',
        'attribute float sulcus;',
        'attribute float medial;',
        'attribute vec3 hlColor;',
        'attribute vec4 tint;',
        'varying float vHi;',
        'varying float vLes;',
        'varying float vSul;',
        'varying float vMed;',
        'varying vec3 vHlCol;',
        'varying vec4 vTint;',
      ].join('\n'))
      .replace('#include <begin_vertex>', [
        '#include <begin_vertex>',
        'vHi = highlight; vLes = lesion; vHlCol = hlColor; vTint = tint; vSul = sulcus; vMed = medial;',
      ].join('\n'));
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', [
        '#include <common>',
        'uniform float uRim;',
        'uniform vec3 uRimColor;',
        'uniform float uTintMix;',
        'uniform float uSulcusAO;',
        'uniform float uMedialFade;',
        'uniform float uHiPulse;',
        'varying float vHi;',
        'varying float vLes;',
        'varying float vSul;',
        'varying float vMed;',
        'varying vec3 vHlCol;',
        'varying vec4 vTint;',
      ].join('\n'))
      .replace('#include <emissivemap_fragment>', [
        '#include <emissivemap_fragment>',
        // soft parcellation tint (only where a patch is assigned)
        'diffuseColor.rgb = mix(diffuseColor.rgb, vTint.rgb, uTintMix * vTint.a);',
        // Baked sulcal occlusion. The folds are only 3% of the radius deep, so this — not
        // the silhouette — is what makes them readable through a translucent shell.
        // Crowns are lifted as much as floors are dropped: the same contrast for half the
        // darkening, which matters when the shell is only 63% opaque over a dark page.
        // One smoothstep on the attribute first: the relaxation pass that de-saw-toothes it
        // also flattens it, and putting the S-curve back is free contrast on the RIGHT
        // spatial scale — it sharpens the shoulder of each groove without narrowing it to
        // the vertex spacing, which is the thing that reads as crumpled foil.
        'float bSul = smoothstep(0.02, 0.92, vSul);',
        'float bAo = mix(1.06, 1.0 - uSulcusAO, bSul);',
        // Tone shift, crown -> groove. A crown faces the warm key; a groove floor only ever
        // sees the cool sky term, so it should be BLUER as well as darker. Doing it as a
        // temperature ramp instead of a flat blue cast is what makes the surface read as
        // relief rather than as an evenly hazy dome.
        'vec3 bTone = mix(vec3(1.035, 1.005, 0.962), vec3(0.79, 0.87, 1.08), bSul);',
        'diffuseColor.rgb *= bAo * bTone;',
        // lesion: desaturate + darken
        'float lesGrey = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));',
        'diffuseColor.rgb = mix(diffuseColor.rgb, vec3(lesGrey) * 0.42, vLes);',
        // Fresnel rim light — cheap stand-in for subsurface glow
        'float bFres = pow(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), 3.0);',
        'totalEmissiveRadiance += uRimColor * (uRim * bFres) * (1.0 - 0.75 * vLes) * (1.0 - 0.8 * bSul);',
        // Selection glow: soft, no hard outline. 1.25 rather than 1.55 — with bloom on top,
        // more than this clips to white and the accent stops reading as a colour. uHiPulse
        // breathes it by +/-10% and is gated on the weight, so a SELECTED patch (1.0) pulses
        // and a merely HOVERED one (0.35) does not flicker under the cursor.
        // Feather the glow with the SAME weight the resting tint uses (vTint.a fades to zero
        // across the outer third of the patch cone). Without it the highlight stops dead at
        // the patch boundary, and because that boundary follows triangle edges a selected
        // region reads as a jagged violet sticker rather than as part of the surface. The
        // resting tint has been feathered since round 3; the highlight never was.
        'float bHi = vHi * vTint.a;',
        'float bPulse = 1.0 + uHiPulse * smoothstep(0.55, 1.0, bHi);',
        'totalEmissiveRadiance += vHlCol * (bHi * 1.10 * bPulse);',
        // 0.30, not 0.42: pushing a selected patch to fully opaque is the other half of the
        // sticker look — it stops being a part of a translucent shell.
        'diffuseColor.a = clamp(diffuseColor.a + bHi * 0.30, 0.0, 1.0);',
        // the medial wall of the FAR hemisphere is the last thing to fade
        'diffuseColor.a *= 1.0 - uMedialFade * vMed * (1.0 - bHi);',
        // Grooves are drawn slightly MORE opaque than crowns — the opposite of rounds 1-5,
        // which made them thinner so the dark page showed through. Letting the page through
        // does darken a groove, but it darkens it with BACKGROUND, so the fold pattern reads
        // as varying transparency: haze. Painting the groove's own shaded colour more solidly
        // gives the same darkness as surface, and the deep structures stop leaking through
        // every sulcus at once.
        'diffuseColor.a = clamp(diffuseColor.a * (1.0 + 0.22 * bSul), 0.0, 1.0);',
      ].join('\n'));
    cortexShader = shader;
  };

  /* ---------------------------------------------------------------- centroids */
  const centroids = new Map();
  brain.group.updateMatrixWorld(true);
  {
    const v = new THREE.Vector3();
    for (const id of CORTICAL_IDS) {
      let sum = null, count = 0;
      for (const h of brain.hemispheres) {
        const c = h.patchCentroid.get(id);
        if (!c) continue;
        v.copy(c); h.mesh.localToWorld(v);
        if (!sum) sum = v.clone(); else sum.add(v);
        count++;
      }
      if (sum) centroids.set(id, sum.multiplyScalar(1 / count));
    }
    for (const [id, s] of brain.structures) {
      let sum = null, count = 0;
      for (const m of s.meshes) {
        if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
        v.copy(m.geometry.boundingSphere.center); m.localToWorld(v);
        if (!sum) sum = v.clone(); else sum.add(v);
        count++;
      }
      if (sum) centroids.set(id, sum.multiplyScalar(1 / count));
    }
  }
  const regionIds = CORTICAL_IDS.concat(brain.structureIds);

  /* -------------------------------------------------------------- depth cue state */
  // Where the whole brain sits, so "how far behind the shell is this structure" can be
  // asked in camera-relative terms rather than in absolute world coordinates.
  const brainBounds = new THREE.Box3().setFromObject(brain.group);
  const brainCentre = brainBounds.getCenter(new THREE.Vector3());
  const structDepth = new Map();          // id -> 0 (nearest the camera) .. 1 (far side)
  const brainDepthTint = new THREE.Color(BRAIN_DEPTH_TINT);
  const tmpVec = new THREE.Vector3();
  const tmpFwd = new THREE.Vector3();
  const lastDepthCam = new THREE.Vector3(1e9, 0, 0);
  let depthDirty = true;

  /**
   * Recompute each structure's depth along the view axis. Returns true when anything moved,
   * which is the signal to rewrite the structure materials.
   *
   * depth = 0.5 + (structure - brain centre) . viewDirection / (2 * BRAIN_DEPTH_HALF),
   * clamped — 0 at the front of the deep-structure cloud, 1 at the back of it.
   */
  function brainUpdateDepth() {
    if (!depthDirty && camera.position.distanceToSquared(lastDepthCam) < 1e-8) return false;
    lastDepthCam.copy(camera.position);
    depthDirty = false;
    camera.getWorldDirection(tmpFwd);
    for (const id of brain.structureIds) {
      const c = centroids.get(id);
      if (!c) { structDepth.set(id, 0.5); continue; }
      tmpVec.copy(c).sub(brainCentre);
      structDepth.set(id, brainClamp01(0.5 + tmpVec.dot(tmpFwd) / (2 * BRAIN_DEPTH_HALF)));
    }
    return true;
  }

  /* ------------------------------------------- animation clock, pulse and idle drift */
  let sceneTime = 0;              // seconds since createScene, advanced by update(dt)
  let pulsePhase = 0;             // -BRAIN_PULSE_AMP .. +BRAIN_PULSE_AMP, the selection breath
  let idleRotate = true;          // scene.setIdleRotate(); Pathways turns it off while playing
  let lastInteractAt = 0;
  let idleRamp = 0;               // 0..1, so the drift eases in instead of snapping to speed
  const brainUpAxis = new THREE.Vector3(0, 1, 0);
  const idleOffset = new THREE.Vector3();
  function brainNoteInteraction() { lastInteractAt = sceneTime; idleRamp = 0; }

  /* ------------------------------------------------- highlight / lesion state */
  const hlState = new Map();   // id -> { cur, target, color, dirty }
  const lesState = new Map();  // id -> { cur, target }
  const dirtyGeos = new Set();
  // Reused every frame in update(): allocating a Set per frame is 60 short-lived objects a second
  // for nothing. Cleared at the end of the block that fills it, never held across frames.
  const touchedIds = new Set();
  const BRAIN_GREY = new THREE.Color(0x555b6a);
  const tmpColor = new THREE.Color();

  function stateFor(map, id, make) {
    let s = map.get(id);
    if (!s) { s = make(); map.set(id, s); }
    return s;
  }
  function hlFor(id) { return stateFor(hlState, id, () => ({ cur: 0, target: 0, color: new THREE.Color(0xa98ef2), dirty: true })); }
  function lesFor(id) { return stateFor(lesState, id, () => ({ cur: 0, target: 0 })); }

  function brainWritePatch(id) {
    const hl = hlState.get(id), les = lesState.get(id);
    const w = hl ? hl.cur : 0, lw = les ? les.cur : 0;
    const col = hl ? hl.color : BRAIN_GREY;
    for (const h of brain.hemispheres) {
      const list = h.patchVerts.get(id);
      if (!list || !list.length) continue;
      const a = h.geometry.attributes;
      const hi = a.highlight.array, le = a.lesion.array, hc = a.hlColor.array;
      for (let k = 0; k < list.length; k++) {
        const i = list[k];
        hi[i] = w; le[i] = lw;
        hc[i * 3] = col.r; hc[i * 3 + 1] = col.g; hc[i * 3 + 2] = col.b;
      }
      dirtyGeos.add(h.geometry);
    }
  }

  function brainWriteStructure(id) {
    const s = brain.structures.get(id);
    if (!s) return;
    const hl = hlState.get(id), les = lesState.get(id);
    const w = hl ? hl.cur : 0, lw = les ? les.cur : 0;
    const base = tmpColor.setHex(s.baseColor);
    const mat = s.material;
    mat.color.copy(base).lerp(BRAIN_GREY, lw);
    mat.emissive.copy(base);
    if (hl) mat.emissive.lerp(hl.color, Math.min(1, w));
    // Depth cue. A structure on the far side of the brain is tinted towards the backdrop
    // navy and loses part of its self-illumination, so it sits BEHIND the near ones instead
    // of beside them. Three things switch it off, in this order of importance:
    //   - selection/hover (1 - w): whatever you are looking at is always fully readable;
    //   - the cortex slider: with the shell open there is nothing left to be behind;
    //   - lesion, which owns the colour already.
    const veil = Math.min(1, brain.cortexMaterial.opacity / 0.5);
    const cue = BRAIN_DEPTH_CUE * (structDepth.get(id) || 0) * veil * (1 - w) * (1 - lw);
    if (cue > 0.001) mat.color.lerp(brainDepthTint, cue);
    const pulse = 1 + pulsePhase * brainStep01(0.55, 1.0, w);
    mat.emissiveIntensity = (BRAIN_EMISSIVE_REST + BRAIN_EMISSIVE_GAIN * w)
      * pulse * (1 - 0.92 * lw) * (1 - 0.5 * cue);
    mat.opacity = 1 - 0.65 * lw;
    mat.transparent = lw > 0.01;
    const sc = 1 + 0.10 * w;
    for (const m of s.meshes) m.scale.set(m.scale.x < 0 ? -sc : sc, sc, sc);
  }

  function brainWrite(id) {
    if (brain.structures.has(id)) brainWriteStructure(id); else brainWritePatch(id);
  }

  /* ------------------------------------------------------------------ picking */
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let pickCb = null, hoverCb = null;
  let hovered = null;
  let pendingHover = null, lastHoverAt = 0;

  function brainPickAt(clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObjects(brain.pickables, false);
    if (hits.length) return hits[0].object.userData.regionId || null;
    if (brain.cortexMaterial.opacity < 0.03) return null;
    const hh = raycaster.intersectObjects(hemiMeshes, false);
    if (!hh.length || !hh[0].face) return null;
    const attr = hh[0].object.geometry.attributes.regionId;
    const f = hh[0].face;
    const a = attr.getX(f.a), b = attr.getX(f.b), c = attr.getX(f.c);
    const idx = (a === b || a === c) ? a : (b === c ? b : a);   // majority vote
    return idx >= 0 ? CORTICAL_IDS[idx] : null;                 // lobe fallback → null
  }

  let downAt = null;
  canvas.addEventListener('pointerdown', (e) => { brainNoteInteraction(); downAt = { x: e.clientX, y: e.clientY, t: performance.now() }; });
  canvas.addEventListener('wheel', brainNoteInteraction, { passive: true });
  canvas.addEventListener('pointerup', (e) => {
    if (!downAt) return;
    const moved = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y);
    downAt = null;
    if (moved > 5) return;                                     // a drag, not a click
    if (pickCb) pickCb(brainPickAt(e.clientX, e.clientY), { x: e.clientX, y: e.clientY });
  });
  canvas.addEventListener('pointermove', (e) => { brainNoteInteraction(); pendingHover = { x: e.clientX, y: e.clientY }; });
  canvas.addEventListener('pointerleave', () => {
    pendingHover = null;
    if (hovered !== null) { hovered = null; if (hoverCb) hoverCb(null, { x: 0, y: 0 }); }
  });

  /* ---------------------------------------------------------- camera easing */
  let fly = null;
  // 'start' only, never 'change': 'change' also fires for the camera moves this file makes
  // itself, so listening to it would let the idle drift keep resetting its own timer.
  controls.addEventListener('start', () => { fly = null; brainNoteInteraction(); });

  function brainStartFly(toPos, toTarget, duration) {
    fly = {
      t: 0, duration: Math.max(0.05, duration),
      fromPos: camera.position.clone(), toPos,
      fromTgt: controls.target.clone(), toTgt: toTarget,
    };
  }

  /* -------------------------------------------------------------- quality */
  let composer = null, bloomPass = null;
  let quality = opts.quality || 'auto';
  let bloomOn = false;
  let measure = null;

  function brainEnsureComposer() {
    if (composer) return composer;
    const size = renderer.getSize(new THREE.Vector2());
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    // strength 0.58 (was 0.45), threshold 0.68 (was 0.72): a selected patch sits around
    // 0.7 luminance, so the old threshold barely caught it. The backdrop tops out near 0.09
    // and the resting cortex near 0.45, so neither of them blooms at all.
    bloomPass = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.58, 0.75, 0.68);
    composer.addPass(bloomPass);
    composer.addPass(new OutputPass());
    composer.setSize(size.x, size.y);
    return composer;
  }

  /**
   * Throw away the whole post-processing chain, including every render target the bloom
   * pass owns. Called on context LOSS, on purpose: while the context is lost every GL
   * delete is a no-op, so the ~40 framebuffers/textures go away quietly. Disposing them
   * after the context comes back instead is what produced the
   * "INVALID_OPERATION: delete: object does not belong to this context" spam — three
   * rebuilds its properties/textures caches on restore, but the stale dispose listeners
   * from the dead renderer state are still attached to those render targets.
   */
  function brainDisposeComposer() {
    if (!composer) { bloomPass = null; return; }
    for (const pass of composer.passes) {
      if (pass && typeof pass.dispose === 'function') { try { pass.dispose(); } catch (e) { /* dead context */ } }
    }
    for (const rt of [composer.renderTarget1, composer.renderTarget2]) {
      if (rt && typeof rt.dispose === 'function') { try { rt.dispose(); } catch (e) { /* dead context */ } }
    }
    composer.renderTarget1 = null;
    composer.renderTarget2 = null;
    composer = null;
    bloomPass = null;
  }

  function brainApplyQuality(high) {
    bloomOn = !!high;
    if (bloomOn) brainEnsureComposer();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, high ? maxDpr : 1.0));
    // NO transmission, at any quality. It cost a whole extra scene render (the per-frame
    // triangle count doubled, 77k -> 154k) and it made the shell read as glass rather than
    // as tissue. What High buys instead is bloom, full pixel density, and the clearcoat
    // sheen along the gyral crowns; Low drops all three.
    const m = brain.cortexMaterial;
    const nextCoat = (high && isWebGL2) ? 0.20 : 0.0;
    if (m.transmission !== 0) { m.transmission = 0; m.thickness = 0; m.needsUpdate = true; }
    if (m.clearcoat !== nextCoat) {
      m.clearcoat = nextCoat;
      m.needsUpdate = true;
    }
    brainResize();
  }

  /* --------------------------------------------------------------- resize */
  function brainResize() {
    const w = Math.max(1, canvas.clientWidth || window.innerWidth);
    const h = Math.max(1, canvas.clientHeight || window.innerHeight);
    renderer.setSize(w, h, false);
    if (composer) composer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', brainResize);
  if (typeof ResizeObserver === 'function') { try { new ResizeObserver(brainResize).observe(canvas); } catch (e) { /* ignore */ } }
  brainResize();

  /* --------------------------------------------------------- context loss */
  let contextLost = false;
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault(); contextLost = true;
    brainDisposeComposer();      // every GL object the chain owns died with the context
    const el = document.getElementById('webgl-lost'); if (el) el.hidden = false;
  });
  canvas.addEventListener('webglcontextrestored', () => {
    contextLost = false;
    const el = document.getElementById('webgl-lost'); if (el) el.hidden = true;
    brainDisposeComposer();      // belt and braces: never render into a target from the dead context
    brainResize();
    api.setQuality(quality);     // rebuilds the composer, the bloom pass and their targets
  });

  /* ---------------------------------------------------------------- pulses */
  const pulses = [];
  const pulseGeo = new THREE.SphereGeometry(0.055, 14, 10);

  /* ------------------------------------------------------------------- API */
  const api = {
    THREE, renderer, camera, scene, controls,
    brain,
    regionIds,

    centroid(id) {
      const c = centroids.get(id);
      return c ? c.clone() : new THREE.Vector3();
    },

    highlight(id, weight = 1, colorHex = 0xa98ef2) {
      if (!centroids.has(id)) return;
      const s = hlFor(id);
      s.target = Math.max(0, Math.min(1, weight));
      s.color.setHex(colorHex);
      s.dirty = true;
    },

    clearHighlights() {
      for (const s of hlState.values()) { s.target = 0; s.dirty = true; }
    },

    setLesion(id, on) {
      if (!centroids.has(id)) return;
      const s = lesFor(id);
      s.target = on ? 1 : 0;
      const h = hlFor(id); h.dirty = true;   // force a rewrite next frame
    },

    clearLesions() {
      for (const [id, s] of lesState) { s.target = 0; hlFor(id).dirty = true; }
    },

    flyTo(target, options = {}) {
      const duration = options.duration != null ? options.duration : 0.85;
      const p = (typeof target === 'string') ? api.centroid(target) : target.clone();
      const camDir = camera.position.clone().sub(controls.target);
      const dist = options.distance != null ? options.distance
        : Math.min(controls.maxDistance, Math.max(controls.minDistance, 2.6));
      if (camDir.lengthSq() < 1e-6) camDir.set(0, 0.4, 1);
      camDir.normalize();
      const out = p.clone();
      // Only reorient the camera for targets that are actually out near the surface.
      // Deep structures sit close to the origin, where "outward" is meaningless — for those
      // we keep the viewing direction and just re-centre.
      if (out.length() > 0.55) {
        out.normalize();
        camDir.lerp(out, 0.55);
        if (camDir.lengthSq() < 1e-6) camDir.set(0, 0.4, 1);
        camDir.normalize();
      }
      brainNoteInteraction();
      brainStartFly(p.clone().add(camDir.multiplyScalar(dist)), p, duration);
    },

    resetView() {
      brainNoteInteraction();
      brainStartFly(
        new THREE.Vector3(BRAIN_HOME_POS[0], BRAIN_HOME_POS[1], BRAIN_HOME_POS[2]),
        new THREE.Vector3(BRAIN_HOME_TARGET[0], BRAIN_HOME_TARGET[1], BRAIN_HOME_TARGET[2]),
        0.85);
    },

    setCortexOpacity(v) {
      const o = Math.max(0, Math.min(1, v));
      brain.cortexMaterial.opacity = o;
      for (const m of hemiMeshes) m.visible = o > 0.015;
      depthDirty = true;    // with the shell open, nothing should still be receding behind it
    },

    /**
     * Slow auto-rotation (4 degrees a second) after BRAIN_IDLE_DELAY seconds of no pointer
     * interaction. On by default. Any pointer event, wheel, orbit drag or flyTo stops it and
     * restarts the timer; a mode that is animating the camera itself (Pathways) should turn
     * it off for the duration.
     */
    setIdleRotate(on) {
      idleRotate = !!on;
      idleRamp = 0;
      lastInteractAt = sceneTime;    // always wait out the full delay before drifting again
      return idleRotate;
    },
    get idleRotate() { return idleRotate; },

    setQuality(mode) {
      quality = mode || 'auto';
      measure = null;
      if (quality === 'high') brainApplyQuality(true);
      else if (quality === 'low') brainApplyQuality(false);
      else { brainApplyQuality(true); measure = { frames: 0, sum: 0 }; }  // measure, then decide
      return quality;
    },
    get quality() { return quality; },
    get bloomEnabled() { return bloomOn; },

    onPick(cb) { pickCb = cb; },
    onHover(cb) { hoverCb = cb; },

    pulse(fromId, toId, options = {}) {
      const color = options.color != null ? options.color : 0x5ee1d6;
      const duration = options.duration != null ? options.duration : 0.9;
      const a = api.centroid(fromId), b = api.centroid(toId);
      const mid = a.clone().add(b).multiplyScalar(0.5);
      mid.y += 0.18 + 0.30 * a.distanceTo(b);
      const curve = new THREE.CatmullRomCurve3([a, mid, b]);
      const mat = new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 0.95,
        blending: THREE.AdditiveBlending, depthWrite: false,
      });
      const dot = new THREE.Mesh(pulseGeo, mat);
      overlays.add(dot);
      return new Promise((resolve) => { pulses.push({ curve, dot, mat, t: 0, duration, resolve }); });
    },

    addOverlay(o) { if (o) overlays.add(o); },
    removeOverlay(o) { if (o) overlays.remove(o); },

    update(dt) {
      if (contextLost) return;
      const now = performance.now();
      sceneTime += dt;
      // One breath shared by the cortex patches and the deep structures, so a selection that
      // spans both pulses in phase.
      pulsePhase = BRAIN_PULSE_AMP * Math.sin(sceneTime * BRAIN_PULSE_HZ * 2 * Math.PI);
      if (cortexShader) cortexShader.uniforms.uHiPulse.value = pulsePhase;

      // hover raycast, throttled
      if (pendingHover && now - lastHoverAt > 1000 / BRAIN_HOVER_HZ) {
        lastHoverAt = now;
        const pos = pendingHover; pendingHover = null;
        const id = brainPickAt(pos.x, pos.y);
        canvas.style.cursor = id ? 'pointer' : '';   // '' → the grab/grabbing rule in 10-brain.css
        hovered = id;
        if (hoverCb) hoverCb(id, pos);
      }

      // smoothed highlight / lesion
      const k = 1 - Math.exp(-dt * 8);
      const touched = touchedIds;
      touched.clear();
      for (const [id, s] of hlState) {
        if (s.dirty || Math.abs(s.cur - s.target) > 0.0015) {
          s.cur += (s.target - s.cur) * k;
          if (Math.abs(s.cur - s.target) <= 0.0015) s.cur = s.target;
          s.dirty = false;
          touched.add(id);
        }
      }
      for (const [id, s] of lesState) {
        if (Math.abs(s.cur - s.target) > 0.0015) {
          s.cur += (s.target - s.cur) * k;
          if (Math.abs(s.cur - s.target) <= 0.0015) s.cur = s.target;
          touched.add(id);
        }
      }
      for (const id of touched) brainWrite(id);
      // The depth cue and the selection breath are camera- and time-driven, not event-driven,
      // so the structures need a rewrite whenever the view moves or something is lit up.
      // Fifteen materials, a handful of colour operations each: cheaper than the raycast.
      const depthMoved = brainUpdateDepth();
      for (const id of brain.structureIds) {
        if (touched.has(id)) continue;
        const hl = hlState.get(id), les = lesState.get(id);
        const w = hl ? hl.cur : 0;
        if (depthMoved || w > 0.005 || (les && les.cur > 0.005)) brainWriteStructure(id);
      }
      if (dirtyGeos.size) {
        for (const g of dirtyGeos) {
          g.attributes.highlight.needsUpdate = true;
          g.attributes.lesion.needsUpdate = true;
          g.attributes.hlColor.needsUpdate = true;
        }
        dirtyGeos.clear();
      }

      // camera
      if (fly) {
        fly.t += dt;
        const e = brainEaseOutCubic(Math.min(1, fly.t / fly.duration));
        camera.position.lerpVectors(fly.fromPos, fly.toPos, e);
        controls.target.lerpVectors(fly.fromTgt, fly.toTgt, e);
        if (fly.t >= fly.duration) fly = null;
      }
      // Idle drift. The CAMERA orbits the target — the brain group is never rotated, because
      // every centroid, pulse curve and overlay is cached in world space. Suspended while a
      // flight or a pulse is running, so it never fights a mode that is driving the camera.
      if (idleRotate && !fly && !pulses.length && sceneTime - lastInteractAt > BRAIN_IDLE_DELAY) {
        idleRamp = Math.min(1, idleRamp + dt / BRAIN_IDLE_RAMP);
        idleOffset.copy(camera.position).sub(controls.target)
          .applyAxisAngle(brainUpAxis, BRAIN_IDLE_SPEED * idleRamp * dt);
        camera.position.copy(controls.target).add(idleOffset);
      } else if (idleRamp) {
        idleRamp = 0;
      }
      controls.update();

      // pulses
      for (let i = pulses.length - 1; i >= 0; i--) {
        const p = pulses[i];
        p.t += dt;
        const u = Math.min(1, p.t / p.duration);
        p.dot.position.copy(p.curve.getPoint(u));
        const s = 0.6 + 0.9 * Math.sin(Math.PI * u);
        p.dot.scale.setScalar(s);
        p.mat.opacity = 0.35 + 0.6 * Math.sin(Math.PI * u);
        if (u >= 1) {
          overlays.remove(p.dot); p.mat.dispose(); pulses.splice(i, 1);
          p.resolve();
        }
      }

      // auto quality: skip warm-up frames, then average
      if (measure) {
        measure.frames++;
        if (measure.frames > 15) measure.sum += dt;
        if (measure.frames >= 60) {
          const avg = measure.sum / (measure.frames - 15);
          if (avg > 0.020) brainApplyQuality(false);
          measure = null;
        }
      }
    },

    render() {
      if (contextLost) return;
      if (bloomOn && composer) composer.render();
      else renderer.render(scene, camera);
    },

    // --- extras used by the Atlas / verification -------------------------------
    regionColor,
    cortexShader() { return cortexShader; },
    /**
     * Real per-frame triangle count. Reading renderer.info directly is misleading when
     * bloom is on, because EffectComposer's last pass is a full-screen quad and the info
     * object has already been reset for it — so this does one plain scene render and
     * reports that instead.
     */
    triangleCount() { renderer.render(scene, camera); return renderer.info.render.triangles; },
  };

  api.setQuality(quality);
  api.setCortexOpacity(0.63);    // must match #cortex-opacity's default in body.html
  return api;
}
