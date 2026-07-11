"""Parametric numerical assertions for resolve_snn_modulation and build_vfx_profile.

Tests exact outputs for each neuromodulator at intensity=1.0 against values
derivable from NEUROMODULATOR_TABLE and VFX_PROFILE_TABLE constants. Complements
test_neuromodulation_edge_cases.py which checks positivity only (v_thresh > 0).
"""

from __future__ import annotations

import pytest

from backend.neuromodulation import (
    build_vfx_profile,
    resolve_snn_modulation,
    _lerp_hex_rgb,
    NEUROMOD_GLOW_HEX,
)

# ---------------------------------------------------------------------------
# Expected values at intensity=1.0, derived from NEUROMODULATOR_TABLE constants.
# Format: (v_thresh, tau_ms, refractory_ms, epsp, active_hz, bg_hz)
# ---------------------------------------------------------------------------
_SNN_FULL = {
    "dopamine": (0.77, 19.0, 4.5, 0.46, 125.0, 10.5),
    "serotonin": (0.84, 23.0, 5.75, 0.38, 105.0, 10.0),
    "acetylcholine": (0.78, 19.0, 5.0, 0.44, 140.0, 7.5),
    "noradrenaline": (0.76, 18.0, 4.25, 0.42, 145.0, 8.5),
    "baseline": (0.80, 20.0, 5.0, 0.40, 100.0, 10.0),
    "adrenaline": (0.74, 17.0, 3.75, 0.44, 135.0, 12.5),
    "gaba": (0.88, 25.0, 6.0, 0.30, 75.0, 7.0),
}

# Expected values at intensity=1.0, derived from VFX_PROFILE_TABLE + NEUROMOD_GLOW_HEX.
# Format: (glow_hex, bloom_mult, tween_in_ms, burst_threshold, active_lobe_bloom_scale)
_VFX_FULL = {
    "dopamine": ("#FFD700", 1.12, 480, 0.52, 1.05),
    "serotonin": ("#E0FFFF", 0.95, 720, 0.68, 1.00),
    "acetylcholine": ("#FFD700", 1.05, 520, 0.55, 1.12),
    "adrenaline": ("#FF4500", 1.25, 350, 0.45, 1.00),
    "gaba": ("#8A2BE2", 0.80, 900, 0.72, 1.00),
    "baseline": ("#E0FFFF", 1.00, 600, 0.60, 1.00),
    "noradrenaline": ("#FF4500", 1.20, 420, 0.50, 1.35),
}


class TestResolveSnnModulationParametric:
    """Exact numerical outputs for each neuromodulator at intensity=1.0."""

    @pytest.mark.parametrize("neuromod,expected", list(_SNN_FULL.items()))
    def test_full_intensity_snn_params(self, neuromod: str, expected: tuple) -> None:
        v_thresh_exp, tau_ms_exp, ref_ms_exp, epsp_exp, active_hz_exp, bg_hz_exp = expected
        r = resolve_snn_modulation(neuromod, 1.0)
        assert r.v_thresh == pytest.approx(v_thresh_exp, abs=1e-9)
        assert r.tau_ms == pytest.approx(tau_ms_exp, abs=1e-9)
        assert r.refractory_ms == pytest.approx(ref_ms_exp, abs=1e-9)
        assert r.epsp == pytest.approx(epsp_exp, abs=1e-9)
        assert r.active_rate_hz == pytest.approx(active_hz_exp, abs=1e-9)
        assert r.background_rate_hz == pytest.approx(bg_hz_exp, abs=1e-9)

    @pytest.mark.parametrize("neuromod", list(_SNN_FULL.keys()))
    def test_lobe_rates_hz_absent_for_all_non_cortisol(self, neuromod: str) -> None:
        r = resolve_snn_modulation(neuromod, 1.0)
        assert r.lobe_rates_hz is None

    def test_half_intensity_dopamine_active_hz(self) -> None:
        # lerp(1.25, 0.5) * 100 = (1 + 0.25*0.5) * 100 = 112.5
        r = resolve_snn_modulation("dopamine", 0.5)
        assert r.active_rate_hz == pytest.approx(112.5, abs=1e-9)

    def test_half_intensity_gaba_active_hz(self) -> None:
        # lerp(0.75, 0.5) * 100 = (1 - 0.25*0.5) * 100 = 87.5
        r = resolve_snn_modulation("gaba", 0.5)
        assert r.active_rate_hz == pytest.approx(87.5, abs=1e-9)

    def test_unknown_neuromod_exact_params_match_baseline(self) -> None:
        r_unknown = resolve_snn_modulation("unknown_xyz", 1.0)
        r_baseline = resolve_snn_modulation("baseline", 1.0)
        assert r_unknown.v_thresh == pytest.approx(r_baseline.v_thresh)
        assert r_unknown.tau_ms == pytest.approx(r_baseline.tau_ms)
        assert r_unknown.refractory_ms == pytest.approx(r_baseline.refractory_ms)
        assert r_unknown.epsp == pytest.approx(r_baseline.epsp)
        assert r_unknown.active_rate_hz == pytest.approx(r_baseline.active_rate_hz)
        assert r_unknown.background_rate_hz == pytest.approx(r_baseline.background_rate_hz)

    def test_serotonin_highest_threshold_among_excitatory(self) -> None:
        # serotonin threshold_add=+0.04 → v_thresh 0.84, higher than dopamine (0.77)
        r_ser = resolve_snn_modulation("serotonin", 1.0)
        r_dop = resolve_snn_modulation("dopamine", 1.0)
        assert r_ser.v_thresh > r_dop.v_thresh

    def test_noradrenaline_fastest_active_rate(self) -> None:
        # noradrenaline rate_active=1.45 is highest → active_hz=145
        r_nor = resolve_snn_modulation("noradrenaline", 1.0)
        for mod in ["dopamine", "serotonin", "acetylcholine", "baseline", "adrenaline"]:
            assert r_nor.active_rate_hz >= resolve_snn_modulation(mod, 1.0).active_rate_hz


class TestBuildVfxProfileParametric:
    """Exact table values returned by build_vfx_profile at intensity=1.0."""

    @pytest.mark.parametrize("neuromod,expected", list(_VFX_FULL.items()))
    def test_full_intensity_vfx_table_values(self, neuromod: str, expected: tuple) -> None:
        glow_hex, bloom_mult, tween_in_ms, burst_threshold, lobe_bloom_scale = expected
        p = build_vfx_profile(neuromod, 1.0)
        assert p["glow_hex"] == glow_hex
        assert p["bloom_mult"] == pytest.approx(bloom_mult, abs=1e-9)
        assert p["tween_in_ms"] == pytest.approx(tween_in_ms, abs=1e-9)
        assert p["burst_threshold"] == pytest.approx(burst_threshold, abs=1e-9)
        assert p["active_lobe_bloom_scale"] == pytest.approx(lobe_bloom_scale, abs=1e-9)

    def test_gaba_slowest_tween_in_at_full_intensity(self) -> None:
        # gaba tween_in_ms=900 is highest among all non-cortisol mods
        gaba_tween = build_vfx_profile("gaba", 1.0)["tween_in_ms"]
        for mod in ["dopamine", "serotonin", "adrenaline", "baseline", "acetylcholine"]:
            assert gaba_tween >= build_vfx_profile(mod, 1.0)["tween_in_ms"]

    def test_adrenaline_fastest_tween_in_at_full_intensity(self) -> None:
        # adrenaline tween_in_ms=350 is lowest among all non-cortisol mods
        adr_tween = build_vfx_profile("adrenaline", 1.0)["tween_in_ms"]
        for mod in ["dopamine", "serotonin", "gaba", "baseline", "acetylcholine", "noradrenaline"]:
            assert adr_tween <= build_vfx_profile(mod, 1.0)["tween_in_ms"]

    def test_zero_intensity_bloom_equals_baseline_for_all_mods(self) -> None:
        # At intensity=0 tlerp returns neutral (baseline) value for all mods
        baseline_bloom = build_vfx_profile("baseline", 1.0)["bloom_mult"]
        for mod in _VFX_FULL:
            p = build_vfx_profile(mod, 0.0)
            assert p["bloom_mult"] == pytest.approx(baseline_bloom, abs=1e-9), mod

    @pytest.mark.parametrize(
        "neuromod,intensity",
        [
            ("dopamine", 0.0),
            ("dopamine", 0.5),
            ("dopamine", 1.0),
            ("adrenaline", 0.0),
            ("adrenaline", 0.5),
            ("adrenaline", 1.0),
        ],
    )
    def test_glow_hex_interpolates_toward_baseline(self, neuromod: str, intensity: float) -> None:
        baseline_hex = NEUROMOD_GLOW_HEX["baseline"]
        mod_hex = NEUROMOD_GLOW_HEX[neuromod]
        expected = _lerp_hex_rgb(baseline_hex, mod_hex, intensity)
        p = build_vfx_profile(neuromod, intensity)
        assert p["glow_hex"] == expected
