import * as THREE from "three";

export const LOBES = ["frontal", "parietal", "occipital", "temporal", "cerebellum"];
export const NEUROMODS = [
  "adrenaline",
  "noradrenaline",
  "dopamine",
  "serotonin",
  "gaba",
  "acetylcholine",
  "cortisol",
  "baseline",
];
export const NEUROMOD_LABELS = {
  adrenaline: "Adrenaline",
  noradrenaline: "Noradrenaline",
  dopamine: "Dopamine",
  serotonin: "Serotonin",
  gaba: "GABA",
  acetylcholine: "Acetylcholine",
  cortisol: "Cortisol",
  baseline: "Baseline",
};

/** Matches backend CORTISOL_U_CRIT — intensity selects simulation regime, not concentration. */
export const CORTISOL_OPTIMAL_MAX = 0.5;
export const CORTISOL_REGIME_LABEL_OPTIMAL = "Optimal";
export const CORTISOL_REGIME_LABEL_TOXIC = "Chronic load";
export const HPA_HINT_OPTIMAL = "HPA: acute (optimal).";
export const HPA_HINT_TOXIC = "HPA: chronic load.";
export const DEFAULT_VFX = {
  glow_hex: "#E0FFFF",
  bloom_mult: 1.0,
  bloom_activity_boost_mult: 1.0,
  tween_in_ms: 600,
  tween_out_ms: 800,
  idle_breath_speed_mult: 1.0,
  idle_breath_amp_mult: 1.0,
  vertex_wave_mult: 1.0,
  burst_threshold: 0.6,
  active_lobe_bloom_scale: 1.0,
  global_chaos_mult: 1.0,
  desaturate: 0.0,
  scatter_flash_prob: 0.0,
  glow_sinusoidal_amp_mult: 0.0,
};
/** Hard cap for POST /simulate; warm runs are usually well under a minute. */
export const REQUEST_TIMEOUT_MS = 120000;
export const BACKEND_NEURONS_PER_LOBE = 100;

export const LOBE_COLORS = {
  frontal: new THREE.Color(1.0, 0.15, 0.45),
  parietal: new THREE.Color(0.15, 1.0, 0.45),
  occipital: new THREE.Color(0.25, 0.45, 1.0),
  temporal: new THREE.Color(1.0, 0.65, 0.05),
  cerebellum: new THREE.Color(0.3, 0.9, 0.95),
};
export const BASE_BRIGHTNESS = 0.3;
export const MAX_GLOW_RGB = 0.82;
export const GLOW_BOOST = 1.35;
export const K_MAX_PLAYBACK = 0.48;
export const K_MAX_IDLE_GLOW = 0.72;

export const SPIKE_WINDOW_MS = 50;
export const GLOW_SMOOTHING = 0.08;
export const GLOW_NOISE_AMP = 0.06;
export const GLOW_PULSE_SPEED = 0.003;
export const BG_LOBE_GLOW_SCALE = 0.2;
// Floor for the auto-calibrated spike-glow normalizer (see computeSpikeNorm).
// Prevents low-activity runs from dividing by a tiny peak and over-amplifying noise.
export const MIN_SPIKE_NORM = 40;

export const VERTEX_PHASE_SPREAD = 1.2;
export const VERTEX_WAVE_SPEED = 0.002;
export const VERTEX_VARIATION_AMP = 0.25;

export const BURST_THRESHOLD = 0.6;
export const BURST_FLASH_INTENSITY = 0.42;
export const BURST_FLASH_DECAY = 0.92;

export const BLOOM_BASE_STRENGTH = 0.7;
export const BLOOM_ACTIVITY_BOOST = 0.32;
export const BLOOM_SMOOTHING = 0.03;

export const IDLE_BREATH_SPEED = 0.0008;
export const IDLE_BREATH_AMP = 0.105;
export const IDLE_BREATH_MIN = 0.044;

export const HOVER_LOBE_BOOST = 0.14;
export const HOVER_OTHER_SCALE = 0.78;
export const HOVER_PLAYBACK_BOOST = 1.08;

export const FOCUS_NUDGE_MS = 720;
export const FOCUS_TARGET_BLEND = 0.42;
export const FOCUS_POS_PULL = 0.38;

export const FIRE_PULSE_DECAY = 0.88;
export const FIRE_PULSE_TO_BURST = 0.38;
