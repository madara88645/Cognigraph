import numpy as np
import pytest

from backend.main import _extract_chat_message_text, run_snn, _parse_and_validate_classification
from backend.neuromodulation import (
    CORTISOL_U_CRIT,
    NEUROMOD_GLOW_HEX,
    LobeName,
    ResolvedSnnParams,
    _lerp_toward_neutral,
    _vfx_cortisol_piecewise,
    build_vfx_profile,
    resolve_cortisol_piecewise,
    resolve_snn_modulation,
    snn_params_to_dict,
    validate_classification_payload,
)


def test_lerp_toward_neutral() -> None:
    # At intensity 0, always returns 1.0 (neutral)
    assert _lerp_toward_neutral(2.0, 0.0) == 1.0
    assert _lerp_toward_neutral(0.5, 0.0) == 1.0

    # At intensity 1, returns the full multiplier
    assert _lerp_toward_neutral(2.0, 1.0) == 2.0
    assert _lerp_toward_neutral(0.5, 1.0) == 0.5

    # At fractional intensity, returns interpolated value
    assert _lerp_toward_neutral(2.0, 0.5) == 1.5
    assert _lerp_toward_neutral(0.5, 0.5) == 0.75


def test_extract_chat_message_text_list_parts() -> None:
    text = _extract_chat_message_text(
        {
            "content": [
                {
                    "type": "text",
                    "text": '{"active_lobe":"frontal","dominant_neuromodulator":"baseline",',
                },
                {"type": "text", "text": '"explanation":"x"}'},
            ],
        }
    )
    assert "active_lobe" in text
    assert "baseline" in text


def test_validate_alias_hydrocortisone() -> None:
    out = validate_classification_payload(
        {
            "active_lobe": "frontal",
            "dominant_neuromodulator": "hydrocortisone",
            "neuromodulator_intensity": 0.4,
            "explanation": "Morning cortisol pulse.",
        }
    )
    assert out["dominant_neuromodulator"] == "cortisol"


def test_validate_alias_norepinephrine() -> None:
    out = validate_classification_payload(
        {
            "active_lobe": "parietal",
            "dominant_neuromodulator": "norepinephrine",
            "neuromodulator_intensity": 0.4,
            "explanation": "Focused attention.",
        }
    )
    assert out["dominant_neuromodulator"] == "noradrenaline"


def test_validate_classification_payload_ok() -> None:
    out = validate_classification_payload(
        {
            "active_lobe": "frontal",
            "dominant_neuromodulator": "dopamine",
            "neuromodulator_intensity": 0.72,
            "explanation": "Motor planning engages frontal cortex with dopaminergic drive.",
            "neuromodulator_rationale": "Motivation is high.",
        }
    )
    assert out["active_lobe"] == "frontal"
    assert out["dominant_neuromodulator"] == "dopamine"
    assert out["neuromodulator_intensity"] == pytest.approx(0.72)
    assert out["neuromodulator_rationale"] == "Motivation is high."


def test_validate_defaults_intensity() -> None:
    out = validate_classification_payload(
        {
            "active_lobe": "occipital",
            "dominant_neuromodulator": "baseline",
            "explanation": "Neutral viewing.",
        }
    )
    assert out["neuromodulator_intensity"] == pytest.approx(0.5)
    assert out["neuromodulator_rationale"] == ""


def test_validate_clamps_intensity() -> None:
    out = validate_classification_payload(
        {
            "active_lobe": "temporal",
            "dominant_neuromodulator": "gaba",
            "neuromodulator_intensity": 99,
            "explanation": "Calm.",
        }
    )
    assert out["neuromodulator_intensity"] == pytest.approx(1.0)


def test_validate_intensity_invalid_type() -> None:
    out = validate_classification_payload(
        {
            "active_lobe": "frontal",
            "dominant_neuromodulator": "baseline",
            "neuromodulator_intensity": "invalid",
            "explanation": "x",
        }
    )
    assert out["neuromodulator_intensity"] == 0.5


def test_validate_rejects_bad_payload_and_falls_back() -> None:
    # Invalid active lobe -> falls back to "frontal"
    out1 = validate_classification_payload(
        {"active_lobe": "invalid", "dominant_neuromodulator": "baseline", "explanation": "x"}
    )
    assert out1["active_lobe"] == "frontal"
    
    # Invalid dominant neuromodulator -> falls back to "baseline"
    out2 = validate_classification_payload(
        {"active_lobe": "frontal", "dominant_neuromodulator": "glutamate", "explanation": "x"}
    )
    assert out2["dominant_neuromodulator"] == "baseline"

    # Missing / empty explanation -> falls back to default message
    out3 = validate_classification_payload(
        {"active_lobe": "frontal", "dominant_neuromodulator": "baseline", "explanation": ""}
    )
    assert out3["explanation"] == "Fallback explanation due to validation issue."


def test_validate_explanation_too_long() -> None:
    out = validate_classification_payload(
        {
            "active_lobe": "frontal",
            "dominant_neuromodulator": "baseline",
            "explanation": "x" * 2001,
        }
    )
    assert len(out["explanation"]) == 2000


def test_validate_rationale_too_long() -> None:
    out = validate_classification_payload(
        {
            "active_lobe": "frontal",
            "dominant_neuromodulator": "baseline",
            "explanation": "Valid explanation.",
            "neuromodulator_rationale": "x" * 501,
        }
    )
    assert len(out["neuromodulator_rationale"]) == 500


def test_glow_hex_per_modulator() -> None:
    assert NEUROMOD_GLOW_HEX["adrenaline"] == "#FF4500"
    assert NEUROMOD_GLOW_HEX["dopamine"] == "#FFD700"
    assert NEUROMOD_GLOW_HEX["baseline"] == "#E0FFFF"
    assert NEUROMOD_GLOW_HEX["gaba"] == "#8A2BE2"


def test_build_vfx_includes_glow_hex() -> None:
    v = build_vfx_profile("noradrenaline", 0.8)
    assert v["glow_hex"] == "#FF4500"
    assert v["tween_in_ms"] < 600


def test_gaba_resolves_lower_rates_than_adrenaline() -> None:
    g = resolve_snn_modulation("gaba", 1.0)
    a = resolve_snn_modulation("adrenaline", 1.0)
    assert g.active_rate_hz < a.active_rate_hz
    assert g.v_thresh > a.v_thresh


def test_cortisol_optimal_no_per_lobe_override() -> None:
    r = resolve_cortisol_piecewise("frontal", 0.35)
    assert r.lobe_rates_hz is None
    assert r.background_rate_hz < r.active_rate_hz
    assert r.epsp >= 0.4


def test_cortisol_toxic_sets_high_rates_all_lobes() -> None:
    r = resolve_cortisol_piecewise("frontal", 0.88)
    assert r.lobe_rates_hz is not None
    m = dict(r.lobe_rates_hz)
    assert len(m) == 5
    for name, hz in m.items():
        assert hz >= 40.0, name
    assert abs(m["parietal"] - m["occipital"]) < 1e-6
    assert r.epsp < resolve_cortisol_piecewise("frontal", 0.35).epsp
    assert r.v_thresh > resolve_cortisol_piecewise("frontal", 0.35).v_thresh


def test_cortisol_critical_boundary_inclusive_optimal() -> None:
    r = resolve_cortisol_piecewise("temporal", CORTISOL_U_CRIT)
    assert r.lobe_rates_hz is None


def test_build_vfx_cortisol_piecewise() -> None:
    v_lo = build_vfx_profile("cortisol", 0.25)
    v_hi = build_vfx_profile("cortisol", 0.92)
    assert v_lo["tween_in_ms"] < v_hi["tween_in_ms"]
    assert v_lo["bloom_mult"] > v_hi["bloom_mult"]
    assert v_lo["desaturate"] < v_hi["desaturate"]
    assert v_lo["global_chaos_mult"] < v_hi["global_chaos_mult"]
    assert v_hi["scatter_flash_prob"] > v_lo["scatter_flash_prob"]


def test_resolve_snn_modulation_cortisol_requires_active_lobe() -> None:
    with pytest.raises(ValueError, match="active_lobe"):
        resolve_snn_modulation("cortisol", 0.5)


def test_run_snn_cortisol_toxic_inactive_spikes_exceed_optimal() -> None:
    """Toxic leg floods non-active lobes with Poisson drive vs optimal high-SNR leg."""
    np.random.seed(7)
    opt = resolve_cortisol_piecewise("frontal", 0.3)
    np.random.seed(7)
    tox = resolve_cortisol_piecewise("frontal", 0.92)
    np.random.seed(7)
    sp_opt = run_snn("frontal", opt, duration_ms=200, neurons_per_lobe=40)
    np.random.seed(7)
    sp_tox = run_snn("frontal", tox, duration_ms=200, neurons_per_lobe=40)
    inactive: LobeName = "parietal"
    assert len(sp_tox[inactive].times_ms) > len(sp_opt[inactive].times_ms)


def test_run_snn_gaba_total_spikes_below_adrenaline() -> None:
    """Same RNG seed: high-arousal modulation should yield more spikes than GABA."""
    np.random.seed(42)
    r_gaba = resolve_snn_modulation("gaba", 1.0)
    np.random.seed(42)
    sp_gaba = run_snn("frontal", r_gaba, duration_ms=150, neurons_per_lobe=30)
    total_gaba = sum(len(sp_gaba[l].times_ms) for l in sp_gaba)

    np.random.seed(42)
    r_ad = resolve_snn_modulation("adrenaline", 1.0)
    np.random.seed(42)
    sp_ad = run_snn("frontal", r_ad, duration_ms=150, neurons_per_lobe=30)
    total_ad = sum(len(sp_ad[l].times_ms) for l in sp_ad)

    assert total_gaba < total_ad


def test_snn_params_to_dict_formatting() -> None:
    p = ResolvedSnnParams(
        v_thresh=0.85,
        tau_ms=22.0,
        refractory_ms=6.0,
        epsp=0.45,
        v_center=0.45,
        v_spread=0.1,
        active_rate_hz=120.0,
        background_rate_hz=12.0,
        lobe_rates_hz=(("frontal", 120.0), ("parietal", 12.0)),
    )
    d = snn_params_to_dict(p)

    # Assert specific keys map correctly
    assert d["v_thresh"] == 0.85
    assert d["tau_ms"] == 22.0
    assert d["refractory_ms"] == 6.0
    assert d["epsp"] == 0.45
    assert d["v_center"] == 0.45
    assert d["v_spread"] == 0.1
    assert d["active_rate_hz"] == 120.0
    assert d["background_rate_hz"] == 12.0

    # Assert lobe_rates_hz is not included in the dictionary
    assert "lobe_rates_hz" not in d


def test_vfx_cortisol_piecewise_boundaries() -> None:

    # Boundary: Absolute minimum (u=0.0)
    v_min = _vfx_cortisol_piecewise(0.0)
    assert v_min["glow_hex"] == "#FFF8F0"
    assert v_min["bloom_mult"] == 1.0
    assert v_min["desaturate"] == 0.04

    # Boundary: Critical transition (u=0.5)
    v_crit = _vfx_cortisol_piecewise(CORTISOL_U_CRIT)
    assert v_crit["glow_hex"] == "#FFBF00"  # t=1.0 > 0.35
    assert v_crit["bloom_mult"] == pytest.approx(1.22)  # 1.0 + 0.22*1.0
    assert v_crit["desaturate"] == pytest.approx(0.0)  # 0.04 * (1.0 - 1.0)

    # Boundary: Absolute maximum (u=1.0)
    v_max = _vfx_cortisol_piecewise(1.0)
    assert v_max["glow_hex"] == "#9A8F7A"
    assert v_max["bloom_mult"] == pytest.approx(0.62)  # 1.0 - 0.38*1.0
    assert v_max["desaturate"] == pytest.approx(0.8)  # 0.38 + 0.42*1.0


def test_vfx_cortisol_piecewise_color_threshold() -> None:

    # t = u / 0.5. Color flips when t > 0.35.
    # So the flip is at u = 0.5 * 0.35 = 0.175.

    # Just below the threshold (e.g. u=0.17 -> t=0.34 <= 0.35)
    v_below = _vfx_cortisol_piecewise(0.17)
    assert v_below["glow_hex"] == "#FFF8F0"

    # Just above the threshold (e.g. u=0.18 -> t=0.36 > 0.35)
    v_above = _vfx_cortisol_piecewise(0.18)
    assert v_above["glow_hex"] == "#FFBF00"

def test_parse_and_validate_malformed_json_fallback() -> None:
    # Malformed JSON/prose response from LLM
    raw_response = "Here is some prose before the JSON: { malformed json"
    out = _parse_and_validate_classification(raw_response)
    assert out["active_lobe"] == "frontal"
    assert out["explanation"] == "Fallback explanation due to validation issue."
    assert out["dominant_neuromodulator"] == "baseline"
    assert out["neuromodulator_intensity"] == 0.5
    assert out["neuromodulator_rationale"] == ""


def test_validate_invalid_lobe_fallback() -> None:
    payload = {
        "active_lobe": "invalid_lobe_name",
        "explanation": "Valid explanation.",
        "dominant_neuromodulator": "baseline",
        "neuromodulator_intensity": 0.8,
    }
    out = validate_classification_payload(payload)
    assert out["active_lobe"] == "frontal"


def test_validate_invalid_neuromodulator_fallback() -> None:
    payload = {
        "active_lobe": "frontal",
        "explanation": "Valid explanation.",
        "dominant_neuromodulator": "invalid_mod",
        "neuromodulator_intensity": 0.8,
    }
    out = validate_classification_payload(payload)
    assert out["dominant_neuromodulator"] == "baseline"


def test_validate_invalid_intensity_fallback() -> None:
    payload = {
        "active_lobe": "frontal",
        "explanation": "Valid explanation.",
        "dominant_neuromodulator": "baseline",
        "neuromodulator_intensity": "abc",
    }
    out = validate_classification_payload(payload)
    assert out["neuromodulator_intensity"] == 0.5
