"""Unit tests for pure helpers in backend.neuromodulation.

Covers _lerp_toward_neutral (math helper), validate_classification_payload
(LLM output sanitisation), and build_vfx_profile (deterministic VFX calc).
These are deterministic pure functions — no Brian2, no network, no LLM calls.
"""

from __future__ import annotations

import pytest

from backend.neuromodulation import (
    LOBE_NAMES,
    NEUROMOD_GLOW_HEX,
    NEUROMODULATOR_NAMES,
    _lerp_hex_rgb,
    _lerp_toward_neutral,
    build_vfx_profile,
    validate_classification_payload,
)


class TestLerpHexRgb:
    """_lerp_hex_rgb interpolates #RRGGBB colors in RGB space."""

    def test_zero_t_returns_first_color(self):
        assert _lerp_hex_rgb("#E0FFFF", "#FFD700", 0.0) == "#E0FFFF"

    def test_one_t_returns_second_color(self):
        assert _lerp_hex_rgb("#E0FFFF", "#FFD700", 1.0) == "#FFD700"

    def test_half_t_is_midpoint(self):
        assert _lerp_hex_rgb("#E0FFFF", "#FFD700", 0.5) == "#F0EB80"


class TestLerpTowardNeutral:
    """_lerp_toward_neutral(mult, intensity) = 1 + (mult - 1) * intensity."""

    def test_identity_mult_always_one(self):
        assert _lerp_toward_neutral(1.0, 0.5) == pytest.approx(1.0)

    def test_zero_intensity_always_returns_one(self):
        assert _lerp_toward_neutral(2.0, 0.0) == pytest.approx(1.0)
        assert _lerp_toward_neutral(0.5, 0.0) == pytest.approx(1.0)

    def test_full_intensity_returns_mult_at_full(self):
        assert _lerp_toward_neutral(1.35, 1.0) == pytest.approx(1.35)
        assert _lerp_toward_neutral(0.75, 1.0) == pytest.approx(0.75)

    def test_half_intensity_is_midpoint(self):
        # 1.0 + (2.0 - 1.0) * 0.5 = 1.5
        assert _lerp_toward_neutral(2.0, 0.5) == pytest.approx(1.5)

    def test_below_neutral_mult_interpolates_below_one(self):
        result = _lerp_toward_neutral(0.5, 0.5)
        assert result == pytest.approx(0.75)
        assert result < 1.0


class TestValidateClassificationPayload:
    def _valid(self, **overrides) -> dict:
        base = {
            "active_lobe": "frontal",
            "explanation": "Test explanation.",
            "dominant_neuromodulator": "dopamine",
            "neuromodulator_intensity": 0.7,
            "neuromodulator_rationale": "Reward signal.",
        }
        base.update(overrides)
        return base

    # --- happy-path ---

    def test_valid_payload_passes_through(self):
        result = validate_classification_payload(self._valid())
        assert result["active_lobe"] == "frontal"
        assert result["dominant_neuromodulator"] == "dopamine"
        assert result["neuromodulator_intensity"] == pytest.approx(0.7)

    def test_all_valid_lobes_accepted(self):
        for lobe in LOBE_NAMES:
            result = validate_classification_payload(self._valid(active_lobe=lobe))
            assert result["active_lobe"] == lobe

    def test_all_valid_neuromodulators_accepted(self):
        for mod in NEUROMODULATOR_NAMES:
            result = validate_classification_payload(self._valid(dominant_neuromodulator=mod))
            assert result["dominant_neuromodulator"] == mod

    def test_result_has_expected_keys(self):
        result = validate_classification_payload(self._valid())
        assert set(result.keys()) == {
            "active_lobe",
            "explanation",
            "dominant_neuromodulator",
            "neuromodulator_intensity",
            "neuromodulator_rationale",
        }

    # --- active_lobe fallbacks ---

    def test_missing_active_lobe_defaults_to_frontal(self):
        payload = self._valid()
        del payload["active_lobe"]
        assert validate_classification_payload(payload)["active_lobe"] == "frontal"

    def test_invalid_active_lobe_defaults_to_frontal(self):
        result = validate_classification_payload(self._valid(active_lobe="hypothalamus"))
        assert result["active_lobe"] == "frontal"

    # --- neuromodulator fallbacks and aliases ---

    def test_missing_neuromodulator_defaults_to_baseline(self):
        payload = self._valid()
        del payload["dominant_neuromodulator"]
        assert validate_classification_payload(payload)["dominant_neuromodulator"] == "baseline"

    def test_invalid_neuromodulator_defaults_to_baseline(self):
        result = validate_classification_payload(self._valid(dominant_neuromodulator="melatonin"))
        assert result["dominant_neuromodulator"] == "baseline"

    def test_alias_norepinephrine_maps_to_noradrenaline(self):
        result = validate_classification_payload(
            self._valid(dominant_neuromodulator="norepinephrine")
        )
        assert result["dominant_neuromodulator"] == "noradrenaline"

    def test_alias_epinephrine_maps_to_adrenaline(self):
        result = validate_classification_payload(self._valid(dominant_neuromodulator="epinephrine"))
        assert result["dominant_neuromodulator"] == "adrenaline"

    def test_alias_5ht_maps_to_serotonin(self):
        result = validate_classification_payload(self._valid(dominant_neuromodulator="5-ht"))
        assert result["dominant_neuromodulator"] == "serotonin"

    def test_alias_ach_maps_to_acetylcholine(self):
        result = validate_classification_payload(self._valid(dominant_neuromodulator="ach"))
        assert result["dominant_neuromodulator"] == "acetylcholine"

    def test_alias_hydrocortisone_maps_to_cortisol(self):
        result = validate_classification_payload(
            self._valid(dominant_neuromodulator="hydrocortisone")
        )
        assert result["dominant_neuromodulator"] == "cortisol"

    def test_alias_neutral_maps_to_baseline(self):
        result = validate_classification_payload(self._valid(dominant_neuromodulator="neutral"))
        assert result["dominant_neuromodulator"] == "baseline"

    # --- intensity clamping ---

    def test_intensity_above_one_clamped_to_one(self):
        result = validate_classification_payload(self._valid(neuromodulator_intensity=1.5))
        assert result["neuromodulator_intensity"] == pytest.approx(1.0)

    def test_intensity_below_zero_clamped_to_zero(self):
        result = validate_classification_payload(self._valid(neuromodulator_intensity=-0.3))
        assert result["neuromodulator_intensity"] == pytest.approx(0.0)

    def test_boolean_intensity_defaults_to_half(self):
        result = validate_classification_payload(self._valid(neuromodulator_intensity=True))
        assert result["neuromodulator_intensity"] == pytest.approx(0.5)

    def test_non_numeric_intensity_defaults_to_half(self):
        result = validate_classification_payload(self._valid(neuromodulator_intensity="high"))
        assert result["neuromodulator_intensity"] == pytest.approx(0.5)

    def test_missing_intensity_defaults_to_half(self):
        payload = self._valid()
        del payload["neuromodulator_intensity"]
        assert validate_classification_payload(payload)[
            "neuromodulator_intensity"
        ] == pytest.approx(0.5)

    # --- explanation / rationale truncation ---

    def test_explanation_truncated_at_2000_chars(self):
        result = validate_classification_payload(self._valid(explanation="x" * 3000))
        assert len(result["explanation"]) == 2000

    def test_empty_explanation_uses_fallback_text(self):
        result = validate_classification_payload(self._valid(explanation=""))
        assert result["explanation"] != ""
        assert "fallback" in result["explanation"].lower()

    def test_rationale_truncated_at_500_chars(self):
        result = validate_classification_payload(self._valid(neuromodulator_rationale="r" * 600))
        assert len(result["neuromodulator_rationale"]) == 500

    def test_missing_rationale_defaults_to_empty_string(self):
        payload = self._valid()
        del payload["neuromodulator_rationale"]
        assert validate_classification_payload(payload)["neuromodulator_rationale"] == ""

    # --- non-dict input ---

    def test_none_payload_falls_back_gracefully(self):
        result = validate_classification_payload(None)  # type: ignore[arg-type]
        assert result["active_lobe"] == "frontal"
        assert result["dominant_neuromodulator"] == "baseline"
        assert result["neuromodulator_intensity"] == pytest.approx(0.5)


class TestBuildVfxProfile:
    def test_all_non_cortisol_mods_have_glow_hex(self):
        for mod in NEUROMODULATOR_NAMES:
            if mod == "cortisol":
                continue
            profile = build_vfx_profile(mod, 0.5)
            assert "glow_hex" in profile
            assert profile["glow_hex"].startswith("#")

    def test_glow_hex_matches_canonical_table(self):
        for mod in NEUROMODULATOR_NAMES:
            if mod == "cortisol":
                continue
            profile = build_vfx_profile(mod, 1.0)
            assert profile["glow_hex"] == NEUROMOD_GLOW_HEX[mod]

    def test_glow_hex_interpolates_toward_baseline_by_intensity(self):
        baseline_hex = NEUROMOD_GLOW_HEX["baseline"]
        mod_hex = NEUROMOD_GLOW_HEX["dopamine"]
        assert build_vfx_profile("dopamine", 0.0)["glow_hex"] == baseline_hex
        assert build_vfx_profile("dopamine", 0.5)["glow_hex"] == _lerp_hex_rgb(
            baseline_hex, mod_hex, 0.5
        )
        assert build_vfx_profile("dopamine", 1.0)["glow_hex"] == mod_hex

    def test_zero_intensity_glow_hex_is_baseline_for_all_non_cortisol(self):
        baseline_hex = NEUROMOD_GLOW_HEX["baseline"]
        for mod in NEUROMODULATOR_NAMES:
            if mod == "cortisol":
                continue
            profile = build_vfx_profile(mod, 0.0)
            assert profile["glow_hex"] == baseline_hex, mod

    def test_zero_intensity_lerps_to_baseline_bloom(self):
        # tlerp(neutral, spec, 0.0) = neutral; baseline bloom_mult=1.0
        profile = build_vfx_profile("adrenaline", 0.0)
        assert profile["bloom_mult"] == pytest.approx(1.0)

    def test_full_intensity_equals_spec_bloom(self):
        # adrenaline bloom_mult spec = 1.25
        profile = build_vfx_profile("adrenaline", 1.0)
        assert profile["bloom_mult"] == pytest.approx(1.25)

    def test_intensity_clamped_above_one(self):
        p1 = build_vfx_profile("dopamine", 1.0)
        p_over = build_vfx_profile("dopamine", 1.5)
        assert p1["bloom_mult"] == pytest.approx(p_over["bloom_mult"])

    def test_intensity_clamped_below_zero(self):
        p0 = build_vfx_profile("dopamine", 0.0)
        p_neg = build_vfx_profile("dopamine", -0.5)
        assert p0["bloom_mult"] == pytest.approx(p_neg["bloom_mult"])

    def test_cortisol_optimal_branch_not_murky_glow(self):
        # intensity <= 0.5 → inverted-U optimal branch; glow is amber, not "#9A8F7A"
        profile = build_vfx_profile("cortisol", 0.3)
        assert profile["glow_hex"] != "#9A8F7A"

    def test_cortisol_toxic_branch_has_murky_glow(self):
        # intensity > 0.5 → toxic branch; glow is "#9A8F7A"
        profile = build_vfx_profile("cortisol", 0.8)
        assert profile["glow_hex"] == "#9A8F7A"

    def test_unknown_neuromodulator_behaves_like_baseline(self):
        p_unknown = build_vfx_profile("unknown_chemical", 0.5)
        p_baseline = build_vfx_profile("baseline", 0.5)
        assert p_unknown["bloom_mult"] == pytest.approx(p_baseline["bloom_mult"])
