"""Edge-case tests for backend.neuromodulation pure functions.

The existing test_neuromodulation.py covers the main happy paths.
This file targets boundary conditions and fallback paths not covered there.
"""
from __future__ import annotations

import pytest

from backend.neuromodulation import (
    NEUROMOD_GLOW_HEX,
    NEUROMODULATOR_TABLE,
    VFX_PROFILE_TABLE,
    build_vfx_profile,
    resolve_cortisol_piecewise,
    resolve_snn_modulation,
)


class TestResolveCortisolPiecewise:
    def test_invalid_lobe_raises_value_error(self) -> None:
        with pytest.raises(ValueError, match="invalid active_lobe"):
            resolve_cortisol_piecewise("invalid_lobe", 0.5)

    def test_intensity_clamped_below_zero(self) -> None:
        r_neg = resolve_cortisol_piecewise("frontal", -1.0)
        r_zero = resolve_cortisol_piecewise("frontal", 0.0)
        assert r_neg.v_thresh == pytest.approx(r_zero.v_thresh)
        assert r_neg.active_rate_hz == pytest.approx(r_zero.active_rate_hz)
        assert r_neg.lobe_rates_hz is None  # clamped into optimal leg

    def test_intensity_clamped_above_one(self) -> None:
        r_over = resolve_cortisol_piecewise("occipital", 2.0)
        r_one = resolve_cortisol_piecewise("occipital", 1.0)
        assert r_over.v_thresh == pytest.approx(r_one.v_thresh)
        assert r_over.active_rate_hz == pytest.approx(r_one.active_rate_hz)


class TestResolveSnnModulation:
    def test_unknown_neuromodulator_falls_back_to_baseline(self) -> None:
        r_unknown = resolve_snn_modulation("glutamate", 1.0)
        r_baseline = resolve_snn_modulation("baseline", 1.0)
        assert r_unknown.v_thresh == pytest.approx(r_baseline.v_thresh)
        assert r_unknown.active_rate_hz == pytest.approx(r_baseline.active_rate_hz)
        assert r_unknown.background_rate_hz == pytest.approx(r_baseline.background_rate_hz)

    def test_intensity_clamped_below_zero(self) -> None:
        r_neg = resolve_snn_modulation("dopamine", -0.5)
        r_zero = resolve_snn_modulation("dopamine", 0.0)
        assert r_neg.active_rate_hz == pytest.approx(r_zero.active_rate_hz)
        assert r_neg.v_thresh == pytest.approx(r_zero.v_thresh)

    def test_intensity_clamped_above_one(self) -> None:
        r_over = resolve_snn_modulation("serotonin", 1.5)
        r_one = resolve_snn_modulation("serotonin", 1.0)
        assert r_over.v_thresh == pytest.approx(r_one.v_thresh)
        assert r_over.active_rate_hz == pytest.approx(r_one.active_rate_hz)

    def test_zero_intensity_returns_neutral_params_for_all_mods(self) -> None:
        # At intensity=0 every lerp collapses to 1.0 so all mods share base params.
        r_ref = resolve_snn_modulation("baseline", 0.0)
        for mod in NEUROMODULATOR_TABLE:
            r = resolve_snn_modulation(mod, 0.0)
            assert r.active_rate_hz == pytest.approx(r_ref.active_rate_hz), mod
            assert r.background_rate_hz == pytest.approx(r_ref.background_rate_hz), mod
            assert r.v_thresh == pytest.approx(r_ref.v_thresh), mod

    def test_all_non_cortisol_mods_resolve_without_error(self) -> None:
        for mod in NEUROMODULATOR_TABLE:
            r = resolve_snn_modulation(mod, 0.5)
            assert r.v_thresh > 0, mod
            assert r.active_rate_hz > 0, mod

    def test_serotonin_higher_threshold_than_adrenaline_at_full_intensity(self) -> None:
        r_ser = resolve_snn_modulation("serotonin", 1.0)
        r_adr = resolve_snn_modulation("adrenaline", 1.0)
        assert r_ser.v_thresh > r_adr.v_thresh

    def test_non_cortisol_mods_have_no_lobe_rates(self) -> None:
        for mod in NEUROMODULATOR_TABLE:
            r = resolve_snn_modulation(mod, 0.8)
            assert r.lobe_rates_hz is None, mod


class TestBuildVfxProfile:
    def test_intensity_zero_returns_baseline_values_for_all_mods(self) -> None:
        # tlerp(neutral, base, 0) == neutral == baseline table values
        baseline_bloom = VFX_PROFILE_TABLE["baseline"]["bloom_mult"]
        baseline_burst = VFX_PROFILE_TABLE["baseline"]["burst_threshold"]
        non_cortisol = [m for m in NEUROMOD_GLOW_HEX if m != "cortisol"]
        for mod in non_cortisol:
            v = build_vfx_profile(mod, 0.0)
            assert v["bloom_mult"] == pytest.approx(baseline_bloom, abs=1e-9), mod
            assert v["burst_threshold"] == pytest.approx(baseline_burst, abs=1e-9), mod

    def test_intensity_one_returns_table_values_for_non_cortisol(self) -> None:
        # tlerp(neutral, base, 1) == base == VFX_PROFILE_TABLE[mod]
        for mod in ("adrenaline", "dopamine", "serotonin", "gaba", "noradrenaline", "acetylcholine"):
            v = build_vfx_profile(mod, 1.0)
            expected = VFX_PROFILE_TABLE[mod]["bloom_mult"]
            assert v["bloom_mult"] == pytest.approx(expected, abs=1e-9), mod

    def test_glow_hex_present_for_every_neuromodulator(self) -> None:
        for mod in NEUROMOD_GLOW_HEX:
            v = build_vfx_profile(mod, 0.5)
            assert "glow_hex" in v, mod
            assert isinstance(v["glow_hex"], str) and v["glow_hex"].startswith("#"), mod

    def test_non_cortisol_mods_have_zero_chaos_desaturate_scatter(self) -> None:
        non_cortisol = [
            "adrenaline", "noradrenaline", "dopamine",
            "serotonin", "gaba", "acetylcholine", "baseline",
        ]
        for mod in non_cortisol:
            v = build_vfx_profile(mod, 0.5)
            assert v.get("global_chaos_mult") == pytest.approx(1.0), mod
            assert v.get("desaturate") == pytest.approx(0.0), mod
            assert v.get("scatter_flash_prob") == pytest.approx(0.0), mod

    def test_cortisol_toxic_leg_has_high_chaos_and_desaturate(self) -> None:
        v = build_vfx_profile("cortisol", 0.9)
        assert v["global_chaos_mult"] > 1.0
        assert v["desaturate"] > 0.0
        assert v["scatter_flash_prob"] > 0.0
