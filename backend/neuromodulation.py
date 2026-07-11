"""Neuromodulator enums, LLM payload validation, Brian2 parameter resolution, and VFX echo."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any, Literal, TypedDict, cast

logger = logging.getLogger(__name__)

LobeName = Literal["frontal", "parietal", "occipital", "temporal", "cerebellum"]
NeuromodulatorName = Literal[
    "adrenaline",
    "noradrenaline",
    "dopamine",
    "serotonin",
    "gaba",
    "acetylcholine",
    "cortisol",
    "baseline",
]

LOBE_NAMES: tuple[str, ...] = (
    "frontal",
    "parietal",
    "occipital",
    "temporal",
    "cerebellum",
)


class ClassificationResult(TypedDict):
    active_lobe: LobeName
    explanation: str
    dominant_neuromodulator: NeuromodulatorName
    neuromodulator_intensity: float
    neuromodulator_rationale: str


NEUROMODULATOR_NAMES: tuple[str, ...] = (
    "adrenaline",
    "noradrenaline",
    "dopamine",
    "serotonin",
    "gaba",
    "acetylcholine",
    "cortisol",
    "baseline",
)

# Canonical glow hex for API echo / UI sync (plan 3.3a); cortisol uses piecewise in build_vfx_profile
NEUROMOD_GLOW_HEX: dict[str, str] = {
    "adrenaline": "#FF4500",
    "noradrenaline": "#FF4500",
    "dopamine": "#FFD700",
    "acetylcholine": "#FFD700",
    "serotonin": "#E0FFFF",
    "baseline": "#E0FFFF",
    "gaba": "#8A2BE2",
    "cortisol": "#FFBF00",
}


@dataclass(frozen=True)
class SnnModulationSpec:
    rate_active: float
    rate_bg: float
    threshold_add: float
    tau_mult: float
    refractory_mult: float
    epsp_mult: float
    drive_noise_mult: float


NEUROMODULATOR_TABLE: dict[str, SnnModulationSpec] = {
    "baseline": SnnModulationSpec(1.0, 1.0, 0.0, 1.0, 1.0, 1.0, 1.0),
    "adrenaline": SnnModulationSpec(1.35, 1.25, -0.06, 0.85, 0.75, 1.1, 1.3),
    "noradrenaline": SnnModulationSpec(1.45, 0.85, -0.04, 0.9, 0.85, 1.05, 1.15),
    "dopamine": SnnModulationSpec(1.25, 1.05, -0.03, 0.95, 0.9, 1.15, 1.25),
    "serotonin": SnnModulationSpec(1.05, 1.0, 0.04, 1.15, 1.15, 0.95, 0.85),
    "gaba": SnnModulationSpec(0.75, 0.7, 0.08, 1.25, 1.2, 0.75, 0.7),
    "acetylcholine": SnnModulationSpec(1.4, 0.75, -0.02, 0.95, 1.0, 1.1, 1.1),
}

BASE_V_THRESH = 0.8
BASE_TAU_MS = 20.0
BASE_REFRACTORY_MS = 5.0
BASE_EPSP = 0.4
BASE_V_CENTER = 0.45
BASE_V_SPREAD = 0.1
BASE_ACTIVE_HZ = 100.0
BASE_BG_HZ = 10.0

RATE_HZ_MIN = 1.0
RATE_HZ_MAX = 500.0
V_THRESH_MIN = 0.55
V_THRESH_MAX = 0.95


def _lerp_toward_neutral(mult_at_full: float, intensity: float) -> float:
    return 1.0 + (mult_at_full - 1.0) * intensity


def _parse_hex_rgb(hex_color: str) -> tuple[int, int, int]:
    h = hex_color.lstrip("#")
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))


def _format_hex_rgb(r: int, g: int, b: int) -> str:
    return f"#{r:02X}{g:02X}{b:02X}"


def _lerp_hex_rgb(hex_a: str, hex_b: str, t: float) -> str:
    """Linear RGB interpolation between two #RRGGBB colors."""
    t = max(0.0, min(1.0, t))
    ra, ga, ba = _parse_hex_rgb(hex_a)
    rb, gb, bb = _parse_hex_rgb(hex_b)
    r = round(ra + (rb - ra) * t)
    g = round(ga + (gb - ga) * t)
    b = round(ba + (bb - ba) * t)
    return _format_hex_rgb(r, g, b)


@dataclass(frozen=True)
class ResolvedSnnParams:
    v_thresh: float
    tau_ms: float
    refractory_ms: float
    epsp: float
    v_center: float
    v_spread: float
    active_rate_hz: float
    background_rate_hz: float
    # When set, run_snn uses these Poisson rates per lobe (cortisol toxic / inverted-U leg).
    lobe_rates_hz: tuple[tuple[str, float], ...] | None = None


CORTISOL_U_CRIT = 0.5


def resolve_cortisol_piecewise(
    active_lobe: str,
    intensity: float,
    base_active_hz: float = BASE_ACTIVE_HZ,
    base_bg_hz: float = BASE_BG_HZ,
) -> ResolvedSnnParams:
    """Yerkes–Dodson piecewise mapping: optimal (u<=0.5) vs toxic global noise (u>0.5)."""
    u = max(0.0, min(1.0, intensity))
    if active_lobe not in LOBE_NAMES:
        raise ValueError(f"resolve_cortisol_piecewise: invalid active_lobe {active_lobe!r}")

    if u <= CORTISOL_U_CRIT:
        t = u / CORTISOL_U_CRIT if CORTISOL_U_CRIT > 0 else 0.0
        ra = 1.0 + 0.22 * t
        rb = 1.0
        thr_add = -0.045 * t
        epsp_m = 1.0 + 0.10 * t
        tau_m = 1.0 - 0.06 * t
        ref_m = 1.0 - 0.08 * t
        noise_m = 1.0 + 0.06 * t

        v_thresh = max(V_THRESH_MIN, min(V_THRESH_MAX, BASE_V_THRESH + thr_add))
        tau_ms = max(5.0, min(60.0, BASE_TAU_MS * tau_m))
        refractory_ms = max(1.0, min(25.0, BASE_REFRACTORY_MS * ref_m))
        epsp = max(0.05, min(1.0, BASE_EPSP * epsp_m))
        v_spread = max(0.02, min(0.35, BASE_V_SPREAD * noise_m))
        active_hz = max(RATE_HZ_MIN, min(RATE_HZ_MAX, base_active_hz * ra))
        bg_hz = max(RATE_HZ_MIN, min(RATE_HZ_MAX, base_bg_hz * rb))

        return ResolvedSnnParams(
            v_thresh=v_thresh,
            tau_ms=tau_ms,
            refractory_ms=refractory_ms,
            epsp=epsp,
            v_center=BASE_V_CENTER,
            v_spread=v_spread,
            active_rate_hz=active_hz,
            background_rate_hz=bg_hz,
            lobe_rates_hz=None,
        )

    s = (u - CORTISOL_U_CRIT) / (1.0 - CORTISOL_U_CRIT)
    cap_bg = min(RATE_HZ_MAX, base_bg_hz * 14.0)

    def noise_f(sigma: float) -> float:
        return base_bg_hz + (cap_bg - base_bg_hz) * (sigma**1.2)

    nf = noise_f(s)
    focus = (1.0 - s) ** 1.1
    active_hz = base_active_hz * 1.22 * focus + nf * (1.0 - focus)
    inactive_hz = nf
    active_hz = max(RATE_HZ_MIN, min(RATE_HZ_MAX, active_hz))
    inactive_hz = max(RATE_HZ_MIN, min(RATE_HZ_MAX, inactive_hz))

    lobe_rates: tuple[tuple[str, float], ...] = tuple(
        (lobe, active_hz if lobe == active_lobe else inactive_hz) for lobe in LOBE_NAMES
    )

    epsp_m = max(0.28, 1.0 - 0.48 * s)
    thr_add = 0.065 * s
    tau_m = 1.0 + 0.22 * s
    ref_m = 1.0 + 0.18 * s
    noise_m = 1.0 + 1.55 * s

    v_thresh = max(V_THRESH_MIN, min(V_THRESH_MAX, BASE_V_THRESH + thr_add))
    tau_ms = max(5.0, min(60.0, BASE_TAU_MS * tau_m))
    refractory_ms = max(1.0, min(25.0, BASE_REFRACTORY_MS * ref_m))
    epsp = max(0.05, min(1.0, BASE_EPSP * epsp_m))
    v_spread = max(0.02, min(0.35, BASE_V_SPREAD * noise_m))

    others = [hz for lob, hz in lobe_rates if lob != active_lobe]
    mean_bg = sum(others) / max(1, len(others))

    return ResolvedSnnParams(
        v_thresh=v_thresh,
        tau_ms=tau_ms,
        refractory_ms=refractory_ms,
        epsp=epsp,
        v_center=BASE_V_CENTER,
        v_spread=v_spread,
        active_rate_hz=active_hz,
        background_rate_hz=mean_bg,
        lobe_rates_hz=lobe_rates,
    )


def resolve_snn_modulation(
    neuromodulator: str,
    intensity: float,
    base_active_hz: float = BASE_ACTIVE_HZ,
    base_bg_hz: float = BASE_BG_HZ,
    active_lobe: str | None = None,
) -> ResolvedSnnParams:
    intensity = max(0.0, min(1.0, intensity))
    if neuromodulator == "cortisol":
        if not active_lobe or active_lobe not in LOBE_NAMES:
            raise ValueError("active_lobe is required for cortisol neuromodulation resolution.")
        return resolve_cortisol_piecewise(active_lobe, intensity, base_active_hz, base_bg_hz)

    spec = NEUROMODULATOR_TABLE.get(neuromodulator, NEUROMODULATOR_TABLE["baseline"])

    ra = _lerp_toward_neutral(spec.rate_active, intensity)
    rb = _lerp_toward_neutral(spec.rate_bg, intensity)
    thr_add = spec.threshold_add * intensity
    tau_m = _lerp_toward_neutral(spec.tau_mult, intensity)
    ref_m = _lerp_toward_neutral(spec.refractory_mult, intensity)
    epsp_m = _lerp_toward_neutral(spec.epsp_mult, intensity)
    noise_m = _lerp_toward_neutral(spec.drive_noise_mult, intensity)

    v_thresh = max(V_THRESH_MIN, min(V_THRESH_MAX, BASE_V_THRESH + thr_add))
    tau_ms = max(5.0, min(60.0, BASE_TAU_MS * tau_m))
    refractory_ms = max(1.0, min(25.0, BASE_REFRACTORY_MS * ref_m))
    epsp = max(0.05, min(1.0, BASE_EPSP * epsp_m))
    v_spread = max(0.02, min(0.35, BASE_V_SPREAD * noise_m))

    active_hz = max(RATE_HZ_MIN, min(RATE_HZ_MAX, base_active_hz * ra))
    bg_hz = max(RATE_HZ_MIN, min(RATE_HZ_MAX, base_bg_hz * rb))

    return ResolvedSnnParams(
        v_thresh=v_thresh,
        tau_ms=tau_ms,
        refractory_ms=refractory_ms,
        epsp=epsp,
        v_center=BASE_V_CENTER,
        v_spread=v_spread,
        active_rate_hz=active_hz,
        background_rate_hz=bg_hz,
        lobe_rates_hz=None,
    )


class VfxProfileDict(TypedDict, total=False):
    glow_hex: str
    bloom_mult: float
    bloom_activity_boost_mult: float
    tween_in_ms: float
    tween_out_ms: float
    idle_breath_speed_mult: float
    idle_breath_amp_mult: float
    vertex_wave_mult: float
    burst_threshold: float
    active_lobe_bloom_scale: float
    global_chaos_mult: float
    desaturate: float
    scatter_flash_prob: float


def _vfx_cortisol_piecewise(u: float) -> VfxProfileDict:
    """Inverted-U VFX: crisp optimal (u<=0.5) vs murky toxic (u>0.5)."""
    if u <= CORTISOL_U_CRIT:
        t = u / CORTISOL_U_CRIT if CORTISOL_U_CRIT > 0 else 0.0
        glow = "#FFBF00" if t > 0.35 else "#FFF8F0"
        return {
            "glow_hex": glow,
            "bloom_mult": 1.0 + 0.22 * t,
            "bloom_activity_boost_mult": 1.12 + 0.15 * t,
            "tween_in_ms": 320 - 70 * t,
            "tween_out_ms": 480 - 50 * t,
            "idle_breath_speed_mult": 1.05 + 0.12 * t,
            "idle_breath_amp_mult": 0.95 + 0.1 * t,
            "vertex_wave_mult": 1.05 + 0.12 * t,
            "burst_threshold": 0.58 - 0.14 * t,
            "active_lobe_bloom_scale": 1.0 + 0.38 * t,
            "global_chaos_mult": 1.0,
            "desaturate": 0.04 * (1.0 - t),
            "scatter_flash_prob": 0.02 + 0.04 * t,
        }
    s = (u - CORTISOL_U_CRIT) / (1.0 - CORTISOL_U_CRIT)
    return {
        "glow_hex": "#9A8F7A",
        "bloom_mult": 1.0 - 0.38 * s,
        "bloom_activity_boost_mult": 1.0 - 0.48 * s,
        "tween_in_ms": 650.0 + 280.0 * s,
        "tween_out_ms": 920.0 + 380.0 * s,
        "idle_breath_speed_mult": 0.72 - 0.18 * s,
        "idle_breath_amp_mult": 1.05 + 0.35 * s,
        "vertex_wave_mult": 1.0 + 0.62 * s,
        "burst_threshold": 0.58 + 0.22 * s,
        "active_lobe_bloom_scale": 1.0 - 0.48 * s,
        "global_chaos_mult": 1.0 + 1.25 * s,
        "desaturate": 0.38 + 0.42 * s,
        "scatter_flash_prob": 0.14 + 0.52 * s,
    }


VFX_PROFILE_TABLE: dict[str, VfxProfileDict] = {
    "adrenaline": {
        "bloom_mult": 1.25,
        "bloom_activity_boost_mult": 1.2,
        "tween_in_ms": 350,
        "tween_out_ms": 500,
        "idle_breath_speed_mult": 1.35,
        "idle_breath_amp_mult": 1.15,
        "vertex_wave_mult": 1.4,
        "burst_threshold": 0.45,
        "active_lobe_bloom_scale": 1.0,
    },
    "noradrenaline": {
        "bloom_mult": 1.2,
        "bloom_activity_boost_mult": 1.35,
        "tween_in_ms": 420,
        "tween_out_ms": 560,
        "idle_breath_speed_mult": 1.05,
        "idle_breath_amp_mult": 0.9,
        "vertex_wave_mult": 1.15,
        "burst_threshold": 0.5,
        "active_lobe_bloom_scale": 1.35,
    },
    "dopamine": {
        "bloom_mult": 1.12,
        "bloom_activity_boost_mult": 1.15,
        "tween_in_ms": 480,
        "tween_out_ms": 640,
        "idle_breath_speed_mult": 1.12,
        "idle_breath_amp_mult": 1.08,
        "vertex_wave_mult": 1.1,
        "burst_threshold": 0.52,
        "active_lobe_bloom_scale": 1.05,
    },
    "serotonin": {
        "bloom_mult": 0.95,
        "bloom_activity_boost_mult": 0.85,
        "tween_in_ms": 720,
        "tween_out_ms": 900,
        "idle_breath_speed_mult": 0.75,
        "idle_breath_amp_mult": 0.85,
        "vertex_wave_mult": 0.75,
        "burst_threshold": 0.68,
        "active_lobe_bloom_scale": 1.0,
    },
    "gaba": {
        "bloom_mult": 0.8,
        "bloom_activity_boost_mult": 0.7,
        "tween_in_ms": 900,
        "tween_out_ms": 1200,
        "idle_breath_speed_mult": 0.55,
        "idle_breath_amp_mult": 1.25,
        "vertex_wave_mult": 0.6,
        "burst_threshold": 0.72,
        "active_lobe_bloom_scale": 1.0,
    },
    "acetylcholine": {
        "bloom_mult": 1.05,
        "bloom_activity_boost_mult": 1.08,
        "tween_in_ms": 520,
        "tween_out_ms": 680,
        "idle_breath_speed_mult": 0.95,
        "idle_breath_amp_mult": 0.8,
        "vertex_wave_mult": 1.12,
        "burst_threshold": 0.55,
        "active_lobe_bloom_scale": 1.12,
    },
    "baseline": {
        "bloom_mult": 1.0,
        "bloom_activity_boost_mult": 1.0,
        "tween_in_ms": 600,
        "tween_out_ms": 800,
        "idle_breath_speed_mult": 1.0,
        "idle_breath_amp_mult": 1.0,
        "vertex_wave_mult": 1.0,
        "burst_threshold": 0.6,
        "active_lobe_bloom_scale": 1.0,
    },
}

for _neuromodulator, _profile in VFX_PROFILE_TABLE.items():
    _profile["glow_hex"] = NEUROMOD_GLOW_HEX.get(_neuromodulator, NEUROMOD_GLOW_HEX["baseline"])

VFX_PROFILE_KEYS = (
    "bloom_mult",
    "bloom_activity_boost_mult",
    "tween_in_ms",
    "tween_out_ms",
    "idle_breath_speed_mult",
    "idle_breath_amp_mult",
    "vertex_wave_mult",
    "burst_threshold",
    "active_lobe_bloom_scale",
)


def build_vfx_profile(neuromodulator: str, intensity: float) -> VfxProfileDict:
    """Timing/bloom coefficients; glow_hex is mandatory for client."""
    intensity = max(0.0, min(1.0, intensity))
    if neuromodulator == "cortisol":
        cort = _vfx_cortisol_piecewise(intensity)
        cort["glow_hex"] = str(cort.get("glow_hex", "#FFBF00"))
        return cort

    baseline_hex = NEUROMOD_GLOW_HEX["baseline"]
    mod_hex = NEUROMOD_GLOW_HEX.get(neuromodulator, baseline_hex)
    glow_hex = _lerp_hex_rgb(baseline_hex, mod_hex, intensity)

    def tlerp(a: float, b: float) -> float:
        return a + (b - a) * intensity

    base = VFX_PROFILE_TABLE.get(neuromodulator, VFX_PROFILE_TABLE["baseline"])
    neutral = VFX_PROFILE_TABLE["baseline"]
    out: VfxProfileDict = {"glow_hex": glow_hex}
    for key in VFX_PROFILE_KEYS:
        bv = float(base[key])  # type: ignore[literal-required]
        nv = float(neutral[key])  # type: ignore[literal-required]
        out[key] = tlerp(nv, bv)  # type: ignore[literal-required]
    out["global_chaos_mult"] = 1.0
    out["desaturate"] = 0.0
    out["scatter_flash_prob"] = 0.0
    return out


def snn_params_to_dict(p: ResolvedSnnParams) -> dict[str, float]:
    return {
        "v_thresh": p.v_thresh,
        "tau_ms": p.tau_ms,
        "refractory_ms": p.refractory_ms,
        "epsp": p.epsp,
        "v_center": p.v_center,
        "v_spread": p.v_spread,
        "active_rate_hz": p.active_rate_hz,
        "background_rate_hz": p.background_rate_hz,
    }


def validate_classification_payload(payload: dict[str, Any]) -> ClassificationResult:
    if not isinstance(payload, dict):
        logger.warning("Payload is not a dictionary. Falling back to default payload.")
        payload = {}

    # active_lobe fallback
    raw_lobe = payload.get("active_lobe")
    if raw_lobe is None:
        logger.warning("active_lobe is missing, falling back to 'frontal'")
        active_lobe = "frontal"
    else:
        active_lobe = str(raw_lobe).strip().lower()
        if active_lobe not in LOBE_NAMES:
            logger.warning("Invalid active_lobe '%s', falling back to 'frontal'", active_lobe)
            active_lobe = "frontal"

    # explanation fallback
    raw_exp = payload.get("explanation")
    if raw_exp is None:
        logger.warning("explanation is missing, using fallback")
        explanation = "Fallback explanation due to validation issue."
    else:
        explanation = str(raw_exp).strip()
        if not explanation:
            logger.warning("explanation is empty, using fallback")
            explanation = "Fallback explanation due to validation issue."
        elif len(explanation) > 2000:
            logger.warning("explanation exceeds 2000 chars, truncating")
            explanation = explanation[:2000]

    # dominant_neuromodulator fallback
    raw_mod = payload.get("dominant_neuromodulator")
    if raw_mod is None:
        logger.warning("dominant_neuromodulator is missing, falling back to 'baseline'")
        mod = "baseline"
    else:
        mod = str(raw_mod).strip().lower()
        neuromod_aliases = {
            "norepinephrine": "noradrenaline",
            "epinephrine": "adrenaline",
            "epi": "adrenaline",
            "5-ht": "serotonin",
            "5ht": "serotonin",
            "ach": "acetylcholine",
            "acetyl_choline": "acetylcholine",
            "hydrocortisone": "cortisol",
            "stress_hormone": "cortisol",
            "normal": "baseline",
            "neutral": "baseline",
        }
        mod = neuromod_aliases.get(mod, mod)
        if mod not in NEUROMODULATOR_NAMES:
            logger.warning("Invalid dominant_neuromodulator '%s', falling back to 'baseline'", mod)
            mod = "baseline"

    # neuromodulator_intensity fallback
    raw_intensity = payload.get("neuromodulator_intensity")
    if raw_intensity is None:
        logger.warning("neuromodulator_intensity is missing, falling back to 0.5")
        neuromodulator_intensity = 0.5
    else:
        if isinstance(raw_intensity, bool):
            logger.warning("neuromodulator_intensity is boolean, falling back to 0.5")
            neuromodulator_intensity = 0.5
        else:
            try:
                neuromodulator_intensity = float(raw_intensity)
                # Clip valid numeric inputs to [0.0, 1.0]
                neuromodulator_intensity = max(0.0, min(1.0, neuromodulator_intensity))
            except (TypeError, ValueError):
                logger.warning(
                    "neuromodulator_intensity '%s' is not convertible to float, falling back to 0.5",
                    raw_intensity,
                )
                neuromodulator_intensity = 0.5

    # neuromodulator_rationale fallback
    raw_rationale = payload.get("neuromodulator_rationale")
    if raw_rationale is None:
        neuromodulator_rationale = ""
    else:
        neuromodulator_rationale = str(raw_rationale).strip()
        if len(neuromodulator_rationale) > 500:
            logger.warning("neuromodulator_rationale exceeds 500 chars, truncating")
            neuromodulator_rationale = neuromodulator_rationale[:500]

    return {
        "active_lobe": cast(LobeName, active_lobe),
        "explanation": explanation,
        "dominant_neuromodulator": cast(NeuromodulatorName, mod),
        "neuromodulator_intensity": neuromodulator_intensity,
        "neuromodulator_rationale": neuromodulator_rationale,
    }
