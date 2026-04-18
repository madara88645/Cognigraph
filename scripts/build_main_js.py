"""Assemble frontend/js/main.js from _dedented_app.js."""

from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
JS = ROOT / "frontend" / "js"
lines = (JS / "_dedented_app.js").read_text(encoding="utf-8").splitlines()

# Head: imports (line 1-8) + blank + TWEEN (line 10) — indices 0-8 = first 9 lines?
# dedented: 0-7 imports (8 lines), 8 blank, 9 TWEEN
head = lines[
    0:10
]  # through TWEEN line and following blank at index 10? check: index 9 is TWEEN, 10 blank
# Actually indices 0-9 = 10 lines = lines 1-10. Line 10 in 1-based is index 9 = TWEEN. We need line 11 blank = index 10
head = lines[0:11]  # lines 1-11: through blank after TWEEN

# Tail from DOM REFS banner (line 115) = index 114
tail = lines[114:]

# Remove API key block
s = next(i for i, l in enumerate(tail) if "const API_KEY_STORAGE_KEY" in l)
e = s
while e < len(tail) and "})();" not in tail[e]:
    e += 1
tail = tail[:s] + tail[e + 1 :]

# Remove formatFastApiDetail ... callSimulation
s = next(i for i, l in enumerate(tail) if l.startswith("function formatFastApiDetail"))
e = next(i for i, l in enumerate(tail) if l.startswith("async function handleSimulateClick"))
tail = tail[:s] + tail[e:]

# Remove getSavedApiKey ... refreshApiSettingsStatus (duplicate of apiSettings module)
s = next(i for i, l in enumerate(tail) if l.startswith("function getSavedApiKey"))
e = next(i for i, l in enumerate(tail) if "BRAIN MODEL LOADING" in l)
while e > 0 and "/*" not in tail[e]:
    e -= 1
tail = tail[:s] + tail[e:]

# Remove hexToThreeColor, mergeVfxProfile, neuromodPillTextClass (now in ui.js)
s = next(i for i, l in enumerate(tail) if l.startswith("function hexToThreeColor"))
e = s
while e < len(tail) and not tail[e].startswith("function isCortisolOptimalVfx"):
    e += 1
tail = tail[:s] + tail[e:]

IMPORT_BLOCK = """
import * as C from "./constants.js";
import { showToast } from "./toast.js";
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
  formatFastApiDetail,
  assertValidResponse,
  callSimulation,
} from "./simulation.js";
import { hexToThreeColor, mergeVfxProfile, neuromodPillTextClass } from "./ui.js";
"""

DESTRUCTURE = """
const {
  LOBES,
  NEUROMODS,
  NEUROMOD_LABELS,
  DEFAULT_VFX,
  REQUEST_TIMEOUT_MS,
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
  MAX_SPIKES_PER_WINDOW,
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
} = C;
"""

out = "\n".join(head) + "\n" + IMPORT_BLOCK + "\n" + DESTRUCTURE + "\n" + "\n".join(tail) + "\n"

out_path = JS / "_main_assembled.js"
out_path.write_text(out, encoding="utf-8")
print("Wrote", out_path, "lines", len(out.splitlines()))
