import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { FXAAShader } from "three/addons/shaders/FXAAShader.js";

const TWEEN = window.TWEEN;


import * as C from "./constants.js";
import { showToast } from "./toast.js";
import "./mobile.js";
import {
  getSavedApiKey,
  getSavedModel,
  setSavedApiKey,
  setSavedModel,
  refreshApiSettingsStatus,
  PRIMARY_LIVE_DEMO_URL,
  PRIMARY_LIVE_DEMO_ORIGIN,
} from "./apiSettings.js";
import {
  assertValidResponse,
  isSimulationCanceledError,
  startSimulationRequest,
} from "./simulation.js";
import {
  formatNeuromodIntensityLabel,
  hexToThreeColor,
  hpaContextHintText,
  hpaHelpToastMessage,
  mergeVfxProfile,
  neuromodPillTextClass,
} from "./ui.js";
import { loadBrainGLB } from "./brain.js";
import { formatTimelineFrames } from "./timeline.js";
import {
  REQUEST_PHASE,
  resolvePhaseAfterOutcome,
  shouldHandleRequestResult,
  derivePhaseUiState,
} from "./requestLifecycle.js";
import {
  clearRetryState,
  markRetryableFailure,
  syncRetryStateWithPrompt,
} from "./requestRetryState.js";
import { createColdStartTimer } from "./coldStartIndicator.js";
import { mapErrorToUserMessage } from "./errorMessages.js";
import { resolvePromptText } from "./promptText.js";
import { initPanelLayout, setPanelCollapsed } from "./panelLayout.js";


const {
  LOBES,
  NEUROMODS,
  NEUROMOD_LABELS,
  DEFAULT_VFX,
  BACKEND_NEURONS_PER_LOBE,
  LOBE_COLORS,
  BASE_BRIGHTNESS,
  MAX_GLOW_RGB,
  GLOW_BOOST,
  K_MAX_PLAYBACK,
  K_MAX_IDLE_GLOW,
  SPIKE_WINDOW_MS,
  GLOW_SMOOTHING,
  GLOW_NOISE_AMP,
  GLOW_PULSE_SPEED,
  BG_LOBE_GLOW_SCALE,
  MIN_SPIKE_NORM,
  VERTEX_PHASE_SPREAD,
  VERTEX_WAVE_SPEED,
  VERTEX_VARIATION_AMP,
  BURST_THRESHOLD,
  BURST_FLASH_INTENSITY,
  BURST_FLASH_DECAY,
  BLOOM_BASE_STRENGTH,
  BLOOM_ACTIVITY_BOOST,
  BLOOM_SMOOTHING,
  IDLE_BREATH_SPEED,
  IDLE_BREATH_AMP,
  IDLE_BREATH_MIN,
  HOVER_LOBE_BOOST,
  HOVER_OTHER_SCALE,
  HOVER_PLAYBACK_BOOST,
  FOCUS_NUDGE_MS,
  FOCUS_TARGET_BLEND,
  FOCUS_POS_PULL,
  FIRE_PULSE_DECAY,
  FIRE_PULSE_TO_BURST,
  CORTISOL_OPTIMAL_MAX,
} = C;

/* ═══════════════════════════════════════════════
   DOM REFS
   ═══════════════════════════════════════════════ */
const promptInput       = document.getElementById("prompt");
const simulateButton    = document.getElementById("simulate-btn");
const cancelSimulateButton = document.getElementById("cancel-simulate-btn");
const retrySimulateButton = document.getElementById("retry-simulate-btn");
const rotateButton      = document.getElementById("rotate-btn");
const playPauseButton   = document.getElementById("play-pause-btn");
const replayButton      = document.getElementById("replay-btn");
const stepBackButton    = document.getElementById("step-back-btn");
const stepForwardButton = document.getElementById("step-forward-btn");
const speedSlider       = document.getElementById("speed-slider");
const speedLabel        = document.getElementById("speed-label");
const timelineSlider    = document.getElementById("timeline-slider");
const timelineLabel     = document.getElementById("timeline-label");
const timelineFrameLabel = document.getElementById("timeline-frame-label");
const statusChip        = document.getElementById("status-chip");
const explanationText   = document.getElementById("explanation-text");
const activeLobePill    = document.getElementById("active-lobe-pill");
const activeLobeDot     = document.getElementById("active-lobe-dot");
const neuromodPill      = document.getElementById("neuromod-pill");
const neuromodIntensityLabel = document.getElementById("neuromod-intensity-label");
const neuromodMeterFill = document.getElementById("neuromod-meter-fill");
const neuromodRationaleEl = document.getElementById("neuromod-rationale");
const hpaContextHint    = document.getElementById("hpa-context-hint");
const legendPanel       = document.getElementById("legend-panel");
const logPanel          = document.getElementById("log-panel");
const canvasHost        = document.getElementById("brain-canvas");
const settingsToggleButton = document.getElementById("toggle-settings-btn");
const settingsPanel = document.getElementById("settings-panel");
const apiKeyInput = document.getElementById("api-key-input");
const openrouterModelInput = document.getElementById("openrouter-model-input");
const saveApiKeyButton = document.getElementById("save-api-key-btn");
const clearApiKeyButton = document.getElementById("clear-api-key-btn");
const apiKeyStatus = document.getElementById("api-key-status");
const copyDemoLinkButton = document.getElementById("copy-demo-link-btn");
const openDemoLink = document.getElementById("open-demo-link");
const analysisPanelEl = document.querySelector(".analysis-panel");
const simulateFeedback = document.getElementById("simulate-feedback");
const hpaHelpButton = document.getElementById("hpa-help-btn");


/* ═══════════════════════════════════════════════
   THREE.JS SCENE
   ═══════════════════════════════════════════════ */
const isMobileViewport = () => window.innerWidth <= 768;

const getOptimalPixelRatio = () => {
  if (isMobileViewport()) {
    return Math.min(window.devicePixelRatio, 1.5);
  }
  return Math.min(window.devicePixelRatio, 2);
};

const scene = new THREE.Scene();
scene.background = null;

const camera = new THREE.PerspectiveCamera(58, 1, 0.1, 200);
camera.position.set(0, 0.4, 3.9);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(getOptimalPixelRatio());
renderer.setSize(canvasHost.clientWidth, canvasHost.clientHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;
canvasHost.appendChild(renderer.domElement);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const _dpr = getOptimalPixelRatio();
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(canvasHost.clientWidth * _dpr, canvasHost.clientHeight * _dpr),
  1.05,   // strength — toned down vs harsh neon
  0.45,   // radius — slightly tighter halo
  0.5     // threshold — only the brightest (active-lobe) pixels bloom; keeps dim background lobes from washing out the whole brain
);
composer.addPass(bloomPass);

const fxaaPass = new ShaderPass(FXAAShader);
composer.addPass(fxaaPass);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.maxDistance = 12;
controls.minDistance = 2.0;

// No directional lights — MeshBasicMaterial is unlit (self-illuminating wireframe)

/* ═══════════════════════════════════════════════
   STATE
   ═══════════════════════════════════════════════ */
let autoRotate = true;
let focusFreeze = false; // pauses idle auto-rotation while the focus animation orients the brain
let brainGroup = null;
let lastPayload = null;
let currentBloomStrength = BLOOM_BASE_STRENGTH;
let idlePhase = 0;
let rafHandle = null;

const raycaster = new THREE.Raycaster();
const pointerNdc = new THREE.Vector2();
let pointerLobe = null;
let pickedLobe = null;

function isCortisolOptimalVfx() {
  return brain.dominantNeuromod === "cortisol" && brain.neuromodulatorIntensity <= CORTISOL_OPTIMAL_MAX;
}

function isCortisolToxicVfx() {
  return brain.dominantNeuromod === "cortisol" && brain.neuromodulatorIntensity > CORTISOL_OPTIMAL_MAX;
}

const brain = {
  meshEntries: [],      // [{ mesh, baseColors, colorAttr, vertexCount }]
  lobeVertices: {},     // lobe -> [{ meshIdx, vertexIdx, phaseOffset }]
  lobeCenters: {},      // lobe -> THREE.Vector3 (world)
  boundsCenter: null,
  boundsSize: null,
  namedMeshMode: false,
  totalVertices: 0,
  ready: false,
  activeLobe: null,     // lobe name during playback
  glowAmount: 0,        // 0-1 master envelope (tween-driven fade in/out)
  firePulse: 0,         // 0–1 decaying spike at simulate start (firing effect)
  dominantNeuromod: "baseline",
  neuromodulatorIntensity: 0.5,
  neuromodGlowColor: hexToThreeColor(DEFAULT_VFX.glow_hex),
  vfxProfile: { ...DEFAULT_VFX },
  // Per-lobe dynamic glow state
  lobeGlow: Object.fromEntries(LOBES.map(l => [l, {
    current: 0,          // smoothed glow intensity (0-1)
    target: 0,           // raw spike-rate-driven target
    noisePhase: Math.random() * Math.PI * 2,  // unique random phase per lobe
    prevSpikeRate: 0,    // previous frame spike rate for burst detection
    burstFlash: 0,       // current burst flash intensity (decays per frame)
  }])),
};

const playback = {
  active: false,
  paused: false,
  simMs: 0,
  durationMs: 1000,
  speed: Number(speedSlider.value),
  lastWallNow: performance.now(),
  lastProcessedMs: -1,
  buckets: null,
  playedCounts: null,
  totalCounts: null,
};

const requestState = {
  phase: REQUEST_PHASE.IDLE,
  nextRequestId: 0,
  activeRequestId: 0,
  activeHandle: null,
  lastPrompt: "",
  retryAvailable: false,
  lastFailureKind: "",
};

/* ═══════════════════════════════════════════════
   INIT
   ═══════════════════════════════════════════════ */
initLegendPanel();
updateSpeedLabel();
updateTimelineUi();
setRequestPhase(REQUEST_PHASE.IDLE);
updateControlAccessibilityState();
hookUiEvents();
initPanelLayout();
if (openDemoLink) {
  openDemoLink.href = PRIMARY_LIVE_DEMO_URL;
  if (window.location.origin === PRIMARY_LIVE_DEMO_ORIGIN) {
    openDemoLink.classList.add("hidden");
  }
}
onResize();
startRenderLoop();
initSceneAsync();

/* ═══════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════ */
function setStatus(text) {
  statusChip.textContent = text;
}

function setActionHint(text) {
  if (!simulateFeedback) return;
  simulateFeedback.textContent = text;
}

function setRequestPhase(nextPhase, { statusText, actionHintText } = {}) {
  requestState.phase = nextPhase;
  const ui = derivePhaseUiState(nextPhase, {
    retryAvailable: requestState.retryAvailable,
  });

  simulateButton.disabled = ui.analyzeDisabled;
  simulateButton.textContent = ui.analyzeText;
  if (ui.analyzeAriaBusy) {
    simulateButton.setAttribute("aria-busy", ui.analyzeAriaBusy);
  } else {
    simulateButton.removeAttribute("aria-busy");
  }
  simulateButton.classList.toggle("cg-analyze-loading", ui.analyzeLoadingClass);

  if (cancelSimulateButton) {
    cancelSimulateButton.classList.toggle("hidden", ui.cancelHidden);
    cancelSimulateButton.disabled = ui.cancelDisabled;
  }
  if (retrySimulateButton) {
    retrySimulateButton.classList.toggle("hidden", ui.retryHidden);
    retrySimulateButton.disabled = ui.retryDisabled;
  }

  if (statusText) {
    setStatus(statusText);
  }
  if (actionHintText) {
    setActionHint(actionHintText);
  }
}

function resetRetryRecovery() {
  clearRetryState(requestState);
}

function log(message, level = "info") {
  const ts = new Date().toLocaleTimeString();
  const prefix = level === "error" ? "[ERROR]" : level === "warn" ? "[WARN]" : "[INFO]";
  logPanel.textContent += `${ts} ${prefix} ${message}\n`;
  logPanel.scrollTop = logPanel.scrollHeight;
}

function initLegendPanel() {
  legendPanel.innerHTML = "";
  for (const lobe of LOBES) {
    const row = document.createElement("div");
    row.id = `legend-row-${lobe}`;
    row.className = "legend-row flex items-center justify-between rounded px-1 -mx-1 transition-colors";
    row.innerHTML = `
      <div class="flex items-center gap-2">
        <span class="h-2 w-2 rounded-full inline-block" style="background:#${LOBE_COLORS[lobe].getHexString()}; box-shadow: 0 0 8px #${LOBE_COLORS[lobe].getHexString()}"></span>
        <span class="capitalize text-slate-300">${lobe}</span>
      </div>
      <div id="legend-${lobe}" class="font-mono text-white">0</div>
    `;
    legendPanel.appendChild(row);
  }
}

function setLegendHighlight(lobe) {
  for (const l of LOBES) {
    const el = document.getElementById(`legend-row-${l}`);
    if (!el) continue;
    if (lobe && l === lobe) {
      el.classList.add("bg-white/10", "ring-1", "ring-white/20");
    } else {
      el.classList.remove("bg-white/10", "ring-1", "ring-white/20");
    }
  }
}

function updateViewStatus() {
  if (requestState.phase === REQUEST_PHASE.LOADING) {
    setStatus("Analyzing your scenario...");
    return;
  }
  if (!brain.ready) return;
  const ms = Math.floor(playback.simMs);
  const dur = playback.durationMs;
  const hoverBit = pointerLobe ? ` · hover: ${pointerLobe}` : "";
  if (playback.active && !playback.paused) {
    setStatus(`Playback · t=${ms}ms / ${dur}ms${hoverBit}`);
    return;
  }
  if (playback.buckets && playback.paused) {
    setStatus(`Paused · t=${ms}ms / ${dur}ms${hoverBit}`);
    return;
  }
  if (playback.buckets && !playback.active && ms > 0) {
    setStatus(`Review · t=${ms}ms / ${dur}ms${hoverBit}`);
    return;
  }
  if (pointerLobe) {
    setStatus(
      `Hover: ${pointerLobe}${pickedLobe && pickedLobe !== pointerLobe ? ` · pinned: ${pickedLobe}` : ""}`
    );
  } else if (pickedLobe) {
    setStatus(`Pinned region: ${pickedLobe}`);
  } else {
    setStatus("Ready for simulation.");
  }
}

function refreshLegendCounts() {
  for (const lobe of LOBES) {
    const el = document.getElementById(`legend-${lobe}`);
    if (!el) continue;
    el.textContent = `${playback.playedCounts?.[lobe] ?? 0}`;
  }
}

function updateTimelineUi() {
  timelineSlider.max = String(playback.durationMs);
  timelineSlider.value = String(Math.floor(playback.simMs));
  timelineLabel.textContent = `${Math.floor(playback.simMs)} / ${playback.durationMs} ms`;
  timelineSlider.setAttribute("aria-valuetext", `${Math.floor(playback.simMs)} milliseconds`);
  if (timelineFrameLabel) {
    timelineFrameLabel.textContent = formatTimelineFrames(playback);
  }
}

function updateSpeedLabel() {
  speedLabel.textContent = `${playback.speed.toFixed(2)}x`;
  speedSlider.setAttribute("aria-valuetext", `${playback.speed.toFixed(2)} times speed`);
}

function updateControlAccessibilityState() {
  rotateButton.setAttribute("aria-pressed", autoRotate ? "true" : "false");
  settingsToggleButton.setAttribute("aria-expanded", settingsPanel.classList.contains("hidden") ? "false" : "true");
  settingsPanel.setAttribute("aria-hidden", settingsPanel.classList.contains("hidden") ? "true" : "false");
}

/* ═══════════════════════════════════════════════
   LOBE CLASSIFICATION (position-based)
   ═══════════════════════════════════════════════ */

function classifyLobeByPosition(x, y, z, center, size) {
  const nx = (x - center.x) / size.x;
  const ny = (y - center.y) / size.y;
  const nz = (z - center.z) / size.z;

  if (ny < -0.30 && nz < -0.05) return "cerebellum";
  if (nz > 0.15) return "frontal";
  if (nz < -0.20 && ny > -0.30) return "occipital";
  if (Math.abs(nx) > 0.25 && ny < 0.10) return "temporal";
  return "parietal";
}

/* ═══════════════════════════════════════════════
   WIREFRAME BRAIN WITH LOBE VERTEX COLORS
   ═══════════════════════════════════════════════ */

function colorBrainByLobe(meshes, center, size) {
  brain.lobeVertices = {};
  for (const lobe of LOBES) brain.lobeVertices[lobe] = [];

  brain.meshEntries = [];
  const worldPos = new THREE.Vector3();

  for (let mi = 0; mi < meshes.length; mi++) {
    const mesh = meshes[mi];
    const geo = mesh.geometry;
    mesh.updateMatrixWorld(true);

    const posAttr = geo.getAttribute("position");
    const vertexCount = posAttr.count;

    const baseColors = new Float32Array(vertexCount * 3);

    for (let i = 0; i < vertexCount; i++) {
      worldPos.set(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i));
      mesh.localToWorld(worldPos);

      const lobe =
        mesh.userData.lobeFromAsset ||
        classifyLobeByPosition(worldPos.x, worldPos.y, worldPos.z, center, size);
      const color = LOBE_COLORS[lobe];

      baseColors[i * 3]     = color.r * BASE_BRIGHTNESS;
      baseColors[i * 3 + 1] = color.g * BASE_BRIGHTNESS;
      baseColors[i * 3 + 2] = color.b * BASE_BRIGHTNESS;

      // Compute spatial phase offset from vertex position for wave-like glow propagation
      const phaseOffset = (worldPos.x * 0.7 + worldPos.y * 1.1 + worldPos.z * 0.9) * VERTEX_PHASE_SPREAD;
      brain.lobeVertices[lobe].push({ meshIdx: mi, vertexIdx: i, phaseOffset });
    }

    // Set vertex colors
    const colorAttr = new THREE.Float32BufferAttribute(baseColors.slice(), 3);
    geo.setAttribute("color", colorAttr);

    // Wireframe MeshBasicMaterial — self-illuminating, no lighting needed
    mesh.material = new THREE.MeshBasicMaterial({
      wireframe: true,
      vertexColors: true,
      transparent: true,
      opacity: 0.82,
      side: THREE.DoubleSide,
    });
    mesh.renderOrder = 0;

    const solidMat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.13,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const solidMesh = new THREE.Mesh(geo, solidMat);
    solidMesh.renderOrder = -1;
    mesh.add(solidMesh);

    brain.meshEntries.push({
      mesh, baseColors, colorAttr, vertexCount,
    });
  }

  brain.totalVertices = brain.meshEntries.reduce((sum, e) => sum + e.vertexCount, 0);

  for (const lobe of LOBES) {
    log(`${lobe}: ${brain.lobeVertices[lobe].length} vertices`);
  }
}

function computeLobeCenters() {
  brain.lobeCenters = {};
  const wp = new THREE.Vector3();
  for (const lobe of LOBES) {
    const verts = brain.lobeVertices[lobe];
    if (!verts || !verts.length) continue;
    const sum = new THREE.Vector3();
    for (const { meshIdx, vertexIdx } of verts) {
      const md = brain.meshEntries[meshIdx];
      const pos = md.mesh.geometry.getAttribute("position");
      wp.set(pos.getX(vertexIdx), pos.getY(vertexIdx), pos.getZ(vertexIdx));
      md.mesh.localToWorld(wp);
      sum.add(wp);
    }
    brain.lobeCenters[lobe] = sum.multiplyScalar(1 / verts.length);
  }
}

function pickLobeAtClient(clientX, clientY) {
  if (!brain.ready || !brain.boundsCenter || !brain.boundsSize) return null;
  const rect = renderer.domElement.getBoundingClientRect();
  pointerNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  pointerNdc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointerNdc, camera);
  const meshes = brain.meshEntries.map((e) => e.mesh);
  const hits = raycaster.intersectObjects(meshes, true);
  if (!hits.length) return null;
  let o = hits[0].object;
  while (o && !o.userData?.lobeFromAsset && o.parent) o = o.parent;
  if (o?.userData?.lobeFromAsset) return o.userData.lobeFromAsset;
  const p = hits[0].point;
  return classifyLobeByPosition(
    p.x,
    p.y,
    p.z,
    brain.boundsCenter,
    brain.boundsSize
  );
}

/* ═══════════════════════════════════════════════
   ASYNC SCENE INITIALIZATION
   ═══════════════════════════════════════════════ */

async function initSceneAsync() {
  setStatus("Loading brain model...");
  log("Loading brain.glb...");

  try {
    const result = await loadBrainGLB();
    const { brainScene, meshes, bbox, center, size, scaleFactor, meshCount, namedMeshCount } = result;
    log(`Brain loaded. ${meshCount} mesh(es). Scale: ${scaleFactor.toFixed(3)}. Size: ${size.x.toFixed(2)} x ${size.y.toFixed(2)} x ${size.z.toFixed(2)}`);
    log(`Bounds center: (${center.x.toFixed(2)}, ${center.y.toFixed(2)}, ${center.z.toFixed(2)})`);
    if (namedMeshCount > 0) {
      log(`GLB named lobe mesh(es): ${namedMeshCount} (vertex regions follow mesh names).`);
    }

    setStatus("Coloring lobe regions...");
    brain.boundsCenter = center.clone();
    brain.boundsSize = size.clone();
    brain.namedMeshMode = namedMeshCount > 0;

    colorBrainByLobe(meshes, center, size);
    computeLobeCenters();

    brainGroup = new THREE.Group();
    brainGroup.add(brainScene);
    scene.add(brainGroup);

    brain.ready = true;
    log(`Ready. ${brain.totalVertices} vertices across ${LOBES.length} lobes.`);
    updateViewStatus();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`Failed to load brain model: ${msg}`, "error");
    setStatus("Failed to load brain model");
    showToast("Could not load brain mesh. Refresh to retry.", "error");
    console.error("Brain load error:", err);
  }
}

/* ═══════════════════════════════════════════════
   LOBE GLOW — brighten active lobe vertex colors
   ═══════════════════════════════════════════════ */

/**
 * Apply glow to lobe vertices with per-vertex spatial variation.
 * waveTime drives the propagation wave across vertices.
 * burstExtra adds a brief bright flash on spike bursts.
 */
function setLobeGlow(lobe, intensity, waveTime, burstExtra) {
  const vertices = brain.lobeVertices[lobe];
  if (!vertices) return;
  const neu = brain.neuromodGlowColor;
  const nmInt = brain.neuromodulatorIntensity;
  const idlePhase =
    !playback.active && brain.glowAmount <= 0;
  const playbackPhase = playback.active && brain.glowAmount > 0.001;
  const affectedMeshes = new Set();
  for (const { meshIdx, vertexIdx, phaseOffset } of vertices) {
    const md = brain.meshEntries[meshIdx];
    const i = vertexIdx;
    const br = md.baseColors[i * 3];
    const bg = md.baseColors[i * 3 + 1];
    const bb = md.baseColors[i * 3 + 2];

    const wave = Math.sin(waveTime + phaseOffset) * 0.5 + 0.5;
    const vertexIntensity = intensity * (1.0 - VERTEX_VARIATION_AMP + VERTEX_VARIATION_AMP * wave);
    const totalIntensity = vertexIntensity + burstExtra;

    const lc = LOBE_COLORS[lobe];
    const lr = lc.r * BASE_BRIGHTNESS;
    const lg = lc.g * BASE_BRIGHTNESS;
    const lb = lc.b * BASE_BRIGHTNESS;

    let k = (0.30 + Math.min(1, totalIntensity) * 0.45) * (0.36 + 0.64 * nmInt);
    k = Math.min(playbackPhase ? K_MAX_PLAYBACK : K_MAX_IDLE_GLOW, k);
    if (idlePhase) k *= 0.38;

    let ar = lr + (neu.r - lr) * k;
    let ag = lg + (neu.g - lg) * k;
    let ab = lb + (neu.b - lb) * k;
    const ds = brain.vfxProfile.desaturate ?? 0;
    if (ds > 0.001) {
      const murkR = 0.52, murkG = 0.48, murkB = 0.44;
      ar = ar * (1 - ds) + murkR * ds;
      ag = ag * (1 - ds) + murkG * ds;
      ab = ab * (1 - ds) + murkB * ds;
    }

    const t = Math.min(1, Math.max(0, totalIntensity));
    const boost = 1.0 + Math.pow(t, 0.72) * GLOW_BOOST;
    let cr = ar * boost;
    let cg = ag * boost;
    let cb = ab * boost;
    cr = Math.min(MAX_GLOW_RGB, cr);
    cg = Math.min(MAX_GLOW_RGB, cg);
    cb = Math.min(MAX_GLOW_RGB, cb);
    md.colorAttr.setXYZ(i, cr, cg, cb);
    affectedMeshes.add(meshIdx);
  }
  for (const mi of affectedMeshes) {
    brain.meshEntries[mi].colorAttr.needsUpdate = true;
  }
}

function resetAllLobeColors() {
  for (const md of brain.meshEntries) {
    for (let i = 0; i < md.vertexCount; i++) {
      md.colorAttr.setXYZ(i, md.baseColors[i * 3], md.baseColors[i * 3 + 1], md.baseColors[i * 3 + 2]);
    }
    md.colorAttr.needsUpdate = true;
  }
  brain.activeLobe = null;
  brain.glowAmount = 0;
  brain.firePulse = 0;
  // Reset per-lobe glow state
  for (const lobe of LOBES) {
    brain.lobeGlow[lobe].current = 0;
    brain.lobeGlow[lobe].target = 0;
    brain.lobeGlow[lobe].prevSpikeRate = 0;
    brain.lobeGlow[lobe].burstFlash = 0;
  }
}

/* ═══════════════════════════════════════════════
   SPIKE-SYNCED DYNAMIC GLOW
   ═══════════════════════════════════════════════ */

/** Count spikes in [fromMs, toMs] for a given lobe */
function countSpikesInWindow(lobe, fromMs, toMs) {
  if (!playback.buckets || !playback.buckets[lobe]) return 0;
  const map = playback.buckets[lobe];
  let count = 0;
  const lo = Math.max(0, Math.floor(fromMs));
  const hi = Math.min(playback.durationMs, Math.floor(toMs));
  for (let ms = lo; ms <= hi; ms++) {
    const events = map.get(ms);
    if (events) count += events.length;
  }
  return count;
}

/** Multi-octave noise for organic, non-repetitive variations */
function organicNoise(phase, lobeIdx) {
  return Math.sin(phase) * GLOW_NOISE_AMP
       + Math.sin(phase * 2.3 + lobeIdx * 1.7) * GLOW_NOISE_AMP * 0.5
       + Math.sin(phase * 0.7 + lobeIdx * 3.1) * GLOW_NOISE_AMP * 0.3
       + Math.sin(phase * 4.1 + lobeIdx * 0.9) * GLOW_NOISE_AMP * 0.15;
}

/** Idle breathing animation — subtle ambient pulse when no playback */
function updateIdleBreathing(now) {
  if (!brain.ready) return;
  const vp = brain.vfxProfile;
  idlePhase += IDLE_BREATH_SPEED * vp.idle_breath_speed_mult;
  const waveTime = now * VERTEX_WAVE_SPEED * vp.vertex_wave_mult;
  const hover = pointerLobe;

  for (let li = 0; li < LOBES.length; li++) {
    const lobe = LOBES[li];
    let breath = IDLE_BREATH_MIN + IDLE_BREATH_AMP * vp.idle_breath_amp_mult *
      (Math.sin(idlePhase + li * 1.3) * 0.5 + 0.5);
    if (hover) {
      if (lobe === hover) breath += HOVER_LOBE_BOOST;
      else breath *= HOVER_OTHER_SCALE;
    }
    setLobeGlow(lobe, breath, waveTime + li * 0.5, 0);
  }
}

/** Update all per-lobe glow targets from spike data, then smooth */
function updateDynamicGlow(now) {
  if (!brain.ready) return;

  // When no playback is active, show idle breathing
  if (!playback.active && brain.glowAmount <= 0) {
    for (const lobe of LOBES) {
      const g = brain.lobeGlow[lobe];
      g.target = 0;
      g.current *= 0.92;
      if (g.current < 0.005) g.current = 0;
      g.burstFlash *= BURST_FLASH_DECAY;
      if (g.burstFlash < 0.005) g.burstFlash = 0;
    }
    updateIdleBreathing(now);
    const vpIdle = brain.vfxProfile;
    const targetBloom = BLOOM_BASE_STRENGTH * 0.85 * vpIdle.bloom_mult;
    currentBloomStrength += (targetBloom - currentBloomStrength) * BLOOM_SMOOTHING;
    bloomPass.strength = currentBloomStrength;
    return;
  }

  const currentMs = playback.simMs;
  const vp = brain.vfxProfile;
  const waveTime = now * VERTEX_WAVE_SPEED * vp.vertex_wave_mult;
  const burstTh = vp.burst_threshold;
  let totalActivity = 0;

  if (brain.firePulse > 0.001) {
    brain.firePulse *= FIRE_PULSE_DECAY;
  } else {
    brain.firePulse = 0;
  }

  let glowEnv = Math.pow(brain.glowAmount, 0.88);
  const glowSinusoidalAmp = vp.glow_sinusoidal_amp_mult ?? 0;
  if (glowSinusoidalAmp > 0) {
    glowEnv *= 1.0 + glowSinusoidalAmp * Math.sin(now * 0.004);
  }

  const cortisolToxic = isCortisolToxicVfx();
  const scatterP = cortisolToxic ? (vp.scatter_flash_prob ?? 0) : 0;

  for (let li = 0; li < LOBES.length; li++) {
    const lobe = LOBES[li];
    const g = brain.lobeGlow[lobe];

    const spikeCount = countSpikesInWindow(
      lobe,
      currentMs - SPIKE_WINDOW_MS,
      currentMs
    );

    const norm = playback.spikeNorm || MIN_SPIKE_NORM;
    let rawIntensity = Math.min(1.0, spikeCount / norm);
    rawIntensity = Math.pow(rawIntensity, 0.82);

    const rateJump = rawIntensity - g.prevSpikeRate;
    if (rateJump > burstTh) {
      g.burstFlash = Math.min(BURST_FLASH_INTENSITY,
        g.burstFlash + rateJump * BURST_FLASH_INTENSITY);
    }
    if (scatterP > 0.02 && Math.random() < scatterP * 0.12) {
      g.burstFlash = Math.min(
        BURST_FLASH_INTENSITY * 0.55,
        g.burstFlash + scatterP * 0.35
      );
    }
    g.prevSpikeRate = rawIntensity;
    g.burstFlash *= BURST_FLASH_DECAY;
    if (g.burstFlash < 0.005) g.burstFlash = 0;

    const isActive = lobe === brain.activeLobe;
    let scale = isActive ? 1.0 : BG_LOBE_GLOW_SCALE;
    if (cortisolToxic && !isActive) {
      const chaos = vp.global_chaos_mult ?? 1;
      scale = Math.min(1, BG_LOBE_GLOW_SCALE + (1 - BG_LOBE_GLOW_SCALE) * 0.92 * Math.min(1.8, (chaos - 1) * 0.55 + 0.42));
    }
    if (isCortisolOptimalVfx() && isActive) {
      scale = 1.0;
    }
    g.target = rawIntensity * scale * glowEnv;

    const smoothUp   = GLOW_SMOOTHING * 1.8;
    const smoothDown = GLOW_SMOOTHING * 0.6;
    const alpha = g.target > g.current ? smoothUp : smoothDown;
    g.current += (g.target - g.current) * alpha;

    g.noisePhase += GLOW_PULSE_SPEED * (1.0 + (isActive ? 0.5 : 0));
    const noise = organicNoise(g.noisePhase, li);
    const finalGlow = Math.max(0, g.current + noise * g.current);

    const bloomW = isActive ? vp.active_lobe_bloom_scale : 1.0;
    totalActivity += finalGlow * bloomW;

    const showGlow =
      finalGlow > 0.001 ||
      g.burstFlash > 0.001 ||
      (pointerLobe === lobe && playback.active);
    if (showGlow) {
      let fg = finalGlow;
      if (pointerLobe === lobe) {
        fg = Math.max(fg, 0.055) * HOVER_PLAYBACK_BOOST;
      }
      let burst = g.burstFlash;
      if (isActive && brain.firePulse > 0) {
        burst += brain.firePulse * FIRE_PULSE_TO_BURST;
      }
      setLobeGlow(lobe, fg, waveTime + li * 0.8, burst);
    } else if (g.current < 0.001 && g.target < 0.001) {
      setLobeGlow(lobe, 0, waveTime, 0);
    }
  }

  const avgActivity = totalActivity / LOBES.length;
  const targetBloom =
    BLOOM_BASE_STRENGTH * vp.bloom_mult +
    avgActivity * BLOOM_ACTIVITY_BOOST * vp.bloom_activity_boost_mult;
  currentBloomStrength += (targetBloom - currentBloomStrength) * BLOOM_SMOOTHING;
  bloomPass.strength = currentBloomStrength;
}

/* ═══════════════════════════════════════════════
   SPIKE DATA PROCESSING & PLAYBACK
   ═══════════════════════════════════════════════ */

function sanitizeSpikeBuckets(spikes) {
  const buckets = {};
  const totals = {};
  for (const lobe of LOBES) {
    const data = spikes?.[lobe];
    if (!data || !Array.isArray(data.indices) || !Array.isArray(data.times_ms)) {
      throw new Error(`Malformed spike payload for lobe: ${lobe}`);
    }
    const map = new Map();
    const n = Math.min(data.indices.length, data.times_ms.length);
    totals[lobe] = n;
    for (let i = 0; i < n; i++) {
      const idx = Number(data.indices[i]);
      const t = Number(data.times_ms[i]);
      if (!Number.isFinite(idx) || !Number.isFinite(t)) continue;
      if (idx < 0 || idx >= BACKEND_NEURONS_PER_LOBE) continue;
      const ms = Math.max(0, Math.floor(t));
      if (!map.has(ms)) map.set(ms, []);
      map.get(ms).push(idx);
    }
    buckets[lobe] = map;
  }
  return { buckets, totals };
}

/**
 * Per-run glow normalizer: the peak spikes-in-window observed across all lobes
 * over the full timeline. A single global value preserves active-vs-background
 * contrast; the floor prevents low-activity runs from over-amplifying noise.
 * Window matches countSpikesInWindow's inclusive [ms - SPIKE_WINDOW_MS, ms] range.
 */
function computeSpikeNorm(buckets, durationMs) {
  let globalPeak = 0;
  for (const lobe of LOBES) {
    const map = buckets[lobe];
    let windowSum = 0;
    for (let end = 0; end <= durationMs; end++) {
      const entered = map.get(end);
      if (entered) windowSum += entered.length;
      const dropIdx = end - SPIKE_WINDOW_MS - 1;
      if (dropIdx >= 0) {
        const left = map.get(dropIdx);
        if (left) windowSum -= left.length;
      }
      if (windowSum > globalPeak) globalPeak = windowSum;
    }
  }
  return Math.max(globalPeak, MIN_SPIKE_NORM);
}

function processSpikesUntil(targetMs) {
  if (!playback.buckets) return;
  for (let ms = playback.lastProcessedMs + 1; ms <= targetMs; ms++) {
    for (const lobe of LOBES) {
      const events = playback.buckets[lobe].get(ms);
      if (!events) continue;
      playback.playedCounts[lobe] += events.length;
    }
  }
  playback.lastProcessedMs = targetMs;
  refreshLegendCounts();
}

function setPlaybackTime(targetMs) {
  const clamped = Math.max(0, Math.min(playback.durationMs, Math.floor(targetMs)));
  if (clamped < playback.lastProcessedMs) {
    playback.playedCounts = Object.fromEntries(LOBES.map((l) => [l, 0]));
    playback.lastProcessedMs = -1;
  }
  playback.simMs = clamped;
  processSpikesUntil(clamped);
  updateTimelineUi();
  updateViewStatus();
}

function tweenEaseInForNeuromod(mod) {
  if (mod === "cortisol" && brain.neuromodulatorIntensity > CORTISOL_OPTIMAL_MAX && TWEEN.Easing.Cubic) {
    return TWEEN.Easing.Cubic.InOut;
  }
  if (mod === "cortisol" && brain.neuromodulatorIntensity <= CORTISOL_OPTIMAL_MAX) {
    return TWEEN.Easing.Quadratic.Out;
  }
  if (mod === "serotonin" && TWEEN.Easing.Sinusoidal) {
    return TWEEN.Easing.Sinusoidal.InOut;
  }
  return TWEEN.Easing.Quadratic.Out;
}

function tweenEaseOutForNeuromod(mod) {
  if (mod === "cortisol" && brain.neuromodulatorIntensity > CORTISOL_OPTIMAL_MAX && TWEEN.Easing.Cubic) {
    return TWEEN.Easing.Cubic.InOut;
  }
  if (mod === "cortisol" && brain.neuromodulatorIntensity <= CORTISOL_OPTIMAL_MAX) {
    return TWEEN.Easing.Quadratic.In;
  }
  if (mod === "serotonin" && TWEEN.Easing.Sinusoidal) {
    return TWEEN.Easing.Sinusoidal.InOut;
  }
  if (mod === "gaba") return TWEEN.Easing.Cubic.In;
  return TWEEN.Easing.Quadratic.In;
}

function applyNeuromodFromPayload(payload) {
  const mod = payload.dominant_neuromodulator || "baseline";
  brain.dominantNeuromod = NEUROMODS.includes(mod) ? mod : "baseline";
  brain.neuromodulatorIntensity = Math.max(
    0,
    Math.min(1, Number(payload.neuromodulator_intensity) || 0.5)
  );
  brain.vfxProfile = mergeVfxProfile(payload.vfx_profile);
  brain.neuromodGlowColor = hexToThreeColor(brain.vfxProfile.glow_hex);
}

function updateNeuromodPanel(payload) {
  const mod = brain.dominantNeuromod;
  const label = NEUROMOD_LABELS[mod] || mod;
  const hex = brain.vfxProfile.glow_hex;
  neuromodPill.textContent = label;
  neuromodPill.style.color = hex;
  neuromodPill.classList.remove("text-slate-900", "text-white");
  neuromodPill.classList.add(neuromodPillTextClass(hex));
  neuromodIntensityLabel.textContent = formatNeuromodIntensityLabel(
    mod,
    brain.neuromodulatorIntensity
  );
  if (neuromodMeterFill) {
    const pct = Math.round(Math.max(0, Math.min(1, brain.neuromodulatorIntensity)) * 100);
    neuromodMeterFill.style.width = `${pct}%`;
    neuromodMeterFill.style.background = hex;
  }
  const rat = payload.neuromodulator_rationale;
  if (rat && String(rat).trim()) {
    neuromodRationaleEl.textContent = String(rat).trim();
    neuromodRationaleEl.classList.remove("hidden");
  } else {
    neuromodRationaleEl.textContent = "";
    neuromodRationaleEl.classList.add("hidden");
  }
  if (mod === "cortisol") {
    hpaContextHint.textContent = hpaContextHintText(mod, brain.neuromodulatorIntensity);
    hpaContextHint.classList.remove("hidden");
  } else {
    hpaContextHint.classList.add("hidden");
  }
}

/**
 * Current world-space center of a lobe, recomputed from live matrices.
 * brain.lobeCenters is captured once at load (before brainGroup exists and
 * before auto-rotation), so it goes stale as the brain spins — using it makes
 * the focus nudge aim at where the lobe *was*, producing a skewed move.
 */
function lobeWorldCenterNow(lobe) {
  const verts = brain.lobeVertices[lobe];
  if (!verts || !verts.length) return null;
  if (brainGroup) brainGroup.updateMatrixWorld(true);
  const wp = new THREE.Vector3();
  const sum = new THREE.Vector3();
  for (const { meshIdx, vertexIdx } of verts) {
    const md = brain.meshEntries[meshIdx];
    const pos = md.mesh.geometry.getAttribute("position");
    wp.set(pos.getX(vertexIdx), pos.getY(vertexIdx), pos.getZ(vertexIdx));
    md.mesh.localToWorld(wp);
    sum.add(wp);
  }
  return sum.multiplyScalar(1 / verts.length);
}

/**
 * Focus the active lobe: smoothly rotate the brain so the lobe turns to face
 * the camera (up to ~180° for rear lobes), with a brief zoom-in punch, then let
 * auto-rotation resume from the lobe-facing angle. Rotation is frozen for the
 * duration so the brain doesn't spin out from under the move (which used to make
 * it look skewed). Without this, a rear lobe just glows through the transparent
 * mesh and you can't tell which region lit up.
 */
function nudgeCameraTowardLobe(lobeName) {
  if (!brainGroup) return;
  const world = lobeWorldCenterNow(lobeName);
  if (!world) return;

  const startRot = brainGroup.rotation.y;
  // Shortest signed turn that brings the lobe's world direction to +z (camera side).
  const delta = -Math.atan2(world.x, world.z);
  const startPos = camera.position.clone();
  const zoomedPos = startPos.clone().multiplyScalar(0.84); // ~16% dolly-in toward the brain
  const turnMs = FOCUS_NUDGE_MS + (Math.abs(delta) / Math.PI) * 450; // longer for bigger turns

  focusFreeze = true; // hold idle auto-rotation while we orient
  const out = { t: 0 };
  new TWEEN.Tween(out)
    .to({ t: 1 }, turnMs)
    .easing(TWEEN.Easing.Cubic.InOut)
    .onUpdate(() => {
      brainGroup.rotation.y = startRot + delta * out.t;
      camera.position.lerpVectors(startPos, zoomedPos, out.t);
      controls.update();
    })
    .onComplete(() => {
      const back = { t: 0 };
      new TWEEN.Tween(back)
        .to({ t: 1 }, FOCUS_NUDGE_MS * 0.9)
        .easing(TWEEN.Easing.Quadratic.Out)
        .onUpdate(() => {
          camera.position.lerpVectors(zoomedPos, startPos, back.t); // ease the zoom back; keep the new facing
          controls.update();
        })
        .onComplete(() => {
          focusFreeze = false; // resume auto-rotation from the lobe-facing angle
        })
        .start();
    })
    .start();
}

function startPlayback(payload) {
  const { buckets, totals } = sanitizeSpikeBuckets(payload.spikes);
  playback.active = true;
  playback.paused = false;
  playback.simMs = 0;
  playback.durationMs = Math.max(1, Number(payload.duration_ms) || 1000);
  playback.lastProcessedMs = -1;
  playback.lastWallNow = performance.now();
  playback.buckets = buckets;
  playback.spikeNorm = computeSpikeNorm(buckets, playback.durationMs);
  playback.totalCounts = totals;
  playback.playedCounts = Object.fromEntries(LOBES.map((l) => [l, 0]));

  TWEEN.removeAll();
  focusFreeze = false; // clear any focus freeze that removeAll just cancelled mid-flight
  resetAllLobeColors();

  applyNeuromodFromPayload(payload);
  updateNeuromodPanel(payload);

  brain.activeLobe = payload.active_lobe;
  brain.firePulse = 1.0;
  const vp = brain.vfxProfile;
  const proxy = { value: 0 };
  new TWEEN.Tween(proxy)
    .to({ value: 1.0 }, vp.tween_in_ms)
    .easing(tweenEaseInForNeuromod(brain.dominantNeuromod))
    .onUpdate(() => {
      brain.glowAmount = proxy.value;
    })
    .start();

  explanationText.textContent = payload.explanation || "";
  activeLobePill.textContent = payload.active_lobe;
  const activeLobeHex = `#${LOBE_COLORS[payload.active_lobe].getHexString()}`;
  activeLobePill.style.color = activeLobeHex;
  if (activeLobeDot) {
    activeLobeDot.style.background = activeLobeHex;
    activeLobeDot.style.boxShadow = `0 0 10px ${activeLobeHex}`;
  }

  playPauseButton.textContent = "Pause";
  refreshLegendCounts();
  updateTimelineUi();
  updateViewStatus();
  nudgeCameraTowardLobe(payload.active_lobe);
}

function updatePlayback(now) {
  if (!playback.active || !playback.buckets || playback.paused) return;
  const dt = now - playback.lastWallNow;
  playback.lastWallNow = now;
  setPlaybackTime(playback.simMs + dt * playback.speed);
  if (playback.simMs >= playback.durationMs) {
    playback.active = false;
    log("Playback complete.");
    const proxy = { value: brain.glowAmount };
    const outMs = brain.vfxProfile.tween_out_ms;
    new TWEEN.Tween(proxy)
      .to({ value: 0.0 }, outMs)
      .easing(tweenEaseOutForNeuromod(brain.dominantNeuromod))
      .onUpdate(() => {
        brain.glowAmount = proxy.value;
      })
      .onComplete(() => {
        resetAllLobeColors();
        updateViewStatus();
      })
      .start();
  } else if (playback.active && !playback.paused) {
    updateViewStatus();
  }
}

/* ═══════════════════════════════════════════════
   API
   ═══════════════════════════════════════════════ */

async function handleSimulateClick(promptOverride = "") {
  if (requestState.phase === REQUEST_PHASE.LOADING) return;
  if (!brain.ready) {
    setStatus("Brain model is still loading.");
    setActionHint("Please wait a few seconds, then try Analyze again.");
    showToast("Brain model is still loading. Please try again in a moment.", "warning");
    log("Brain model is not loaded yet.", "error");
    return;
  }
  const prompt = resolvePromptText(promptOverride, promptInput.value);
  if (!prompt) {
    setStatus("Scenario required.");
    setActionHint("Add a short scenario first (1-2 sentences), then click Analyze.");
    showToast("Please enter a scenario before analyzing.", "warning");
    log("Please enter a scenario first.", "warn");
    return;
  }
  requestState.lastPrompt = prompt;
  resetRetryRecovery();
  const requestId = requestState.nextRequestId + 1;
  requestState.nextRequestId = requestId;
  requestState.activeRequestId = requestId;
  requestState.activeHandle = startSimulationRequest(prompt);

  setRequestPhase(REQUEST_PHASE.LOADING, {
    statusText: "Analyzing your scenario...",
    actionHintText: "Running analysis now. You can cancel and retry anytime.",
  });

  const coldStartTimer = createColdStartTimer({
    onSlow: () => {
      if (requestState.activeRequestId !== requestId) return;
      setActionHint("Taking longer than usual — waking up the server (15–30s on first run)…");
      showToast("Server is waking up — please hold on.", "info");
    },
    onVerySlow: () => {
      if (requestState.activeRequestId !== requestId) return;
      setActionHint("Still waiting on the server. If this request times out, you can retry the same scenario.");
    },
  });
  coldStartTimer.start();

  log(`Submitting: "${prompt}"`);
  try {
    const payload = await requestState.activeHandle.promise;
    if (!shouldHandleRequestResult(requestState.activeRequestId, requestId)) return;
    assertValidResponse(payload);
    lastPayload = payload;
    startPlayback(payload);
    // On desktop, fold the input panel so the results readout gets the full
    // right rail (input + a populated Analysis can't both fit unscrolled).
    if (window.innerWidth > 1024) {
      setPanelCollapsed("input", true);
      setPanelCollapsed("analysis", false);
    }
    resetRetryRecovery();
    setRequestPhase(resolvePhaseAfterOutcome("success"));
    log(`Active lobe: ${payload.active_lobe}`);
    log(`Neuromodulator: ${payload.dominant_neuromodulator} (${Math.round(payload.neuromodulator_intensity * 100)}%)`);
    log(`Explanation: ${payload.explanation}`);
    setStatus(`Analysis complete · active region: ${payload.active_lobe}`);
    setActionHint("Results are ready. Use timeline and speed controls to inspect the sequence.");
    showToast("Analysis complete. Timeline controls are now active.", "success");
  } catch (err) {
    if (!shouldHandleRequestResult(requestState.activeRequestId, requestId)) return;
    if (isSimulationCanceledError(err)) {
      const cancelMsg = mapErrorToUserMessage({ kind: "abort-user" });
      resetRetryRecovery();
      setRequestPhase(resolvePhaseAfterOutcome("cancel"), {
        statusText: cancelMsg.statusText,
        actionHintText: cancelMsg.actionHintText,
      });
      log("Analysis canceled by user.");
      showToast(cancelMsg.toastText, cancelMsg.toastSeverity);
      return;
    }
    const mapped = (err && err.userMessage) || mapErrorToUserMessage({
      kind: "unknown",
      detail: err instanceof Error ? err.message : String(err),
    });
    if (mapped.retryable) {
      markRetryableFailure(requestState, {
        prompt,
        kind: err && err.kind ? err.kind : "unknown",
      });
    } else {
      resetRetryRecovery();
    }
    setRequestPhase(resolvePhaseAfterOutcome("error"), {
      statusText: mapped.statusText,
      actionHintText: mapped.actionHintText,
    });
    log(err instanceof Error ? err.message : String(err), "error");
    showToast(mapped.toastText, mapped.toastSeverity);
  } finally {
    coldStartTimer.clear();
    if (shouldHandleRequestResult(requestState.activeRequestId, requestId)) {
      requestState.activeHandle = null;
      requestState.activeRequestId = 0;
    }
  }
}

/* ═══════════════════════════════════════════════
   UI EVENTS
   ═══════════════════════════════════════════════ */

function hookUiEvents() {
  controls.addEventListener("start", () => {
    autoRotate = false;
    rotateButton.textContent = "Auto-Rotate: OFF";
  });

  renderer.domElement.style.cursor = "crosshair";
  renderer.domElement.addEventListener("pointermove", (e) => {
    if (!brain.ready) return;
    pointerLobe = pickLobeAtClient(e.clientX, e.clientY);
    updateViewStatus();
  });
  renderer.domElement.addEventListener("pointerleave", () => {
    pointerLobe = null;
    updateViewStatus();
  });
  renderer.domElement.addEventListener("click", (e) => {
    if (!brain.ready) return;
    const lobe = pickLobeAtClient(e.clientX, e.clientY);
    if (!lobe) {
      pickedLobe = null;
      setLegendHighlight(null);
      updateViewStatus();
      return;
    }
    pickedLobe = lobe;
    setLegendHighlight(lobe);
    updateViewStatus();
  });

  rotateButton.addEventListener("click", () => {
    autoRotate = !autoRotate;
    rotateButton.textContent = `Auto-Rotate: ${autoRotate ? "ON" : "OFF"}`;
    rotateButton.setAttribute("aria-pressed", autoRotate ? "true" : "false");
    setStatus(autoRotate ? "Auto-rotate enabled." : "Auto-rotate disabled.");
  });
  settingsToggleButton.addEventListener("click", () => {
    settingsPanel.classList.toggle("hidden");
    settingsToggleButton.textContent = settingsPanel.classList.contains("hidden")
      ? "Show"
      : "Hide";
    updateControlAccessibilityState();
    setActionHint(settingsPanel.classList.contains("hidden")
      ? "API Settings hidden. Analyze uses shared demo setup unless your key is already saved."
      : "API Settings expanded. You can save your key and optional model in this browser.");
    syncAnalysisRecessedState();
  });
  saveApiKeyButton.addEventListener("click", () => {
    const keyFromField = apiKeyInput.value.trim();
    const modelVal = openrouterModelInput ? openrouterModelInput.value.trim() : "";
    if (keyFromField) {
      setSavedApiKey(keyFromField);
      apiKeyInput.value = "";
    }
    setSavedModel(modelVal);
    if (openrouterModelInput) {
      openrouterModelInput.value = getSavedModel();
    }
    refreshApiSettingsStatus(apiKeyStatus);
    if (keyFromField) {
      log("API key saved in this browser.", "info");
      setStatus("API key saved.");
      setActionHint("Your saved key will be used for the next Analyze request.");
      showToast("API settings saved in this browser.", "success");
    } else if (getSavedApiKey()) {
      log("Model preference saved.", "info");
      setStatus("Model preference saved.");
      setActionHint("Analyze will use your saved key with this model when provided.");
      showToast("Model preference saved.", "info");
    } else {
      log("Paste an API key to save, or use Clear to reset saved settings.", "warn");
      setStatus("No key to save.");
      setActionHint("Paste an OpenRouter key first, then click Save settings.");
      showToast("Paste an API key first, then save settings.", "warning");
    }
  });
  clearApiKeyButton.addEventListener("click", () => {
    setSavedApiKey("");
    setSavedModel("");
    apiKeyInput.value = "";
    if (openrouterModelInput) openrouterModelInput.value = "";
    refreshApiSettingsStatus(apiKeyStatus);
    log("Saved API key and model cleared from this browser.");
    setStatus("Saved API settings cleared.");
    setActionHint("You are back to shared demo setup unless you save a personal key again.");
    showToast("Saved API settings cleared.", "info");
  });
  if (copyDemoLinkButton) {
    copyDemoLinkButton.addEventListener("click", async () => {
      const url = String(window.location.href || "").trim() || PRIMARY_LIVE_DEMO_URL;
      try {
        await navigator.clipboard.writeText(url);
        log(`Copied app link: ${url}`);
        setStatus("App link copied to clipboard");
        setActionHint("Share the link or continue with a new analysis.");
        showToast("App link copied.", "success");
      } catch {
        log("Could not copy to clipboard. Copy manually: " + url, "warn");
        showToast("Could not copy automatically. Please copy the URL manually.", "warning");
      }
    });
  }
  if (hpaHelpButton) {
    hpaHelpButton.addEventListener("click", () => {
      showToast(
        hpaHelpToastMessage(brain.dominantNeuromod, brain.neuromodulatorIntensity),
        "info"
      );
    });
  }
  if (cancelSimulateButton) {
    cancelSimulateButton.addEventListener("click", () => {
      if (requestState.phase !== REQUEST_PHASE.LOADING || !requestState.activeHandle) return;
      requestState.activeHandle.cancel();
    });
  }
  if (retrySimulateButton) {
    retrySimulateButton.addEventListener("click", () => {
      if (!requestState.retryAvailable || !requestState.lastPrompt) return;
      if (promptInput) {
        promptInput.value = requestState.lastPrompt;
      }
      handleSimulateClick(requestState.lastPrompt);
    });
  }
  if (promptInput) {
    promptInput.addEventListener("input", () => {
      syncRetryStateWithPrompt(requestState, promptInput.value);
      if (requestState.phase === REQUEST_PHASE.ERROR) {
        setRequestPhase(requestState.phase);
      }
    });
  }
  // Setup click listeners for example scenario buttons
  document.querySelectorAll(".example-scenario-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const scenarioText = btn.getAttribute("data-scenario");
      if (promptInput && scenarioText) {
        promptInput.value = scenarioText;
        promptInput.dispatchEvent(new Event("input", { bubbles: true }));
        promptInput.focus();
      }
    });
  });
  simulateButton.addEventListener("click", () => handleSimulateClick());
  replayButton.addEventListener("click", () => {
    if (!lastPayload) return;
    startPlayback(lastPayload);
  });
  playPauseButton.addEventListener("click", () => {
    if (!playback.buckets) return;
    playback.paused = !playback.paused;
    playback.lastWallNow = performance.now();
    playPauseButton.textContent = playback.paused ? "Resume" : "Pause";
    updateViewStatus();
  });
  speedSlider.addEventListener("input", () => {
    playback.speed = Number(speedSlider.value);
    updateSpeedLabel();
  });
  stepBackButton.addEventListener("click", () => {
    if (!playback.buckets) return;
    playback.paused = true;
    playPauseButton.textContent = "Resume";
    setPlaybackTime(playback.simMs - 25);
  });
  stepForwardButton.addEventListener("click", () => {
    if (!playback.buckets) return;
    playback.paused = true;
    playPauseButton.textContent = "Resume";
    setPlaybackTime(playback.simMs + 25);
  });
  timelineSlider.addEventListener("input", () => {
    if (!playback.buckets) return;
    playback.paused = true;
    playPauseButton.textContent = "Resume";
    setPlaybackTime(Number(timelineSlider.value));
  });
  window.addEventListener("resize", onResize);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      stopRenderLoop();
      return;
    }
    playback.lastWallNow = performance.now();
    startRenderLoop();
  });
  window.addEventListener("beforeunload", stopRenderLoop);
}

if (openrouterModelInput) {
  openrouterModelInput.value = getSavedModel();
}
refreshApiSettingsStatus(apiKeyStatus);
syncAnalysisRecessedState();

function onResize() {
  const w = Math.max(1, canvasHost.clientWidth);
  const h = Math.max(1, canvasHost.clientHeight);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  
  const dpr = getOptimalPixelRatio();
  renderer.setPixelRatio(dpr);
  
  if (!isMobileViewport()) {
    composer.setSize(w * dpr, h * dpr);
    bloomPass.setSize(w * dpr, h * dpr);
    fxaaPass.material.uniforms.resolution.value.set(1 / (w * dpr), 1 / (h * dpr));
  }
  syncAnalysisRecessedState();
}

/** Wide layout only: dim Analysis while API Settings form is open so overlap reads as layered, not a bug. */
function syncAnalysisRecessedState() {
  if (!analysisPanelEl || !settingsPanel) return;
  const expanded = !settingsPanel.classList.contains("hidden");
  const wide = window.innerWidth > 1024;
  analysisPanelEl.classList.toggle("analysis-panel--recessed", expanded && wide);
}

/* ═══════════════════════════════════════════════
   RENDER LOOP
   ═══════════════════════════════════════════════ */

function render(now = performance.now()) {
  if (autoRotate && !focusFreeze && brainGroup) {
    brainGroup.rotation.y += 0.002;
  }

  TWEEN.update(now);

  // Dynamic spike-synced glow for all lobes
  updateDynamicGlow(now);

  controls.update();
  updatePlayback(now);
  
  if (isMobileViewport()) {
    renderer.render(scene, camera);
  } else {
    composer.render();
  }
  
  rafHandle = requestAnimationFrame(render);
}

function startRenderLoop() {
  if (rafHandle != null) return;
  playback.lastWallNow = performance.now();
  rafHandle = requestAnimationFrame(render);
}

function stopRenderLoop() {
  if (rafHandle == null) return;
  cancelAnimationFrame(rafHandle);
  rafHandle = null;
}
