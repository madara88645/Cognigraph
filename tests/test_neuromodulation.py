import numpy as np
import pytest

from backend.main import _extract_chat_message_text, run_snn
from backend.neuromodulation import (
    CORTISOL_U_CRIT,
    NEUROMOD_GLOW_HEX,
    LobeName,
    ResolvedSnnParams,
    _lerp_toward_neutral,
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


@pytest.mark.parametrize(
    "payload,match",
    [
        (
            {"active_lobe": "invalid", "dominant_neuromodulator": "baseline", "explanation": "x"},
            "active_lobe",
        ),
        (
            {"active_lobe": "frontal", "dominant_neuromodulator": "glutamate", "explanation": "x"},
            "dominant_neuromodulator",
        ),
        (
            {"active_lobe": "frontal", "dominant_neuromodulator": "baseline", "explanation": ""},
            "explanation",
        ),
    ],
)
def test_validate_rejects_bad_payload(payload: dict, match: str) -> None:
    with pytest.raises(ValueError) as exc:
        validate_classification_payload(payload)
    assert match in str(exc.value).lower() or match.replace("_", " ") in str(exc.value).lower()


def test_validate_explanation_too_long() -> None:
    with pytest.raises(ValueError, match="exceeds maximum length"):
        validate_classification_payload(
            {
                "active_lobe": "frontal",
                "dominant_neuromodulator": "baseline",
                "explanation": "x" * 2001,
            }
        )


def test_validate_rationale_too_long() -> None:
    with pytest.raises(ValueError, match="exceeds maximum length"):
        validate_classification_payload(
            {
                "active_lobe": "frontal",
                "dominant_neuromodulator": "baseline",
                "explanation": "Valid explanation.",
                "neuromodulator_rationale": "x" * 501,
            }
        )


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
