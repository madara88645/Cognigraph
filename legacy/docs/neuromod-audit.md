# Neuromodulation audit (SNN / VFX vs UI)

Educational demo only — mappings are metaphors, not neurochemistry measurements.

## High severity (user-facing; addressed in UI)

1. **Cortisol intensity as plain %** — Backend and LLM treat `neuromodulator_intensity` 0.5 as a regime switch (optimal acute vs chronic/toxic). The analysis panel previously showed only a percentage. **Fix:** regime label (`Optimal` / `Chronic load`) next to intensity when cortisol is dominant.
2. **HPA help toast always “elevated”** — Misleading for optimal cortisol (`intensity <= 0.5`). **Fix:** regime-aware toast copy in `hpaHelpToastMessage`.

## Medium severity (documented; not changed in this pass)

3. **Duplicate `glow_hex`** — adrenaline = noradrenaline (`#FF4500`); dopamine = acetylcholine (`#FFD700`); serotonin = baseline (`#E0FFFF`). Pill color cannot distinguish paired modulators.
4. **Acetylcholine SNN vs VFX** — Full-intensity ACh has higher `active_rate_hz` than adrenaline, but calmer VFX bloom/tweens.
5. **Serotonin `rate_active` 1.05** — Slight Poisson increase vs baseline; calming effect relies on threshold/tau/refractory only.
6. **GABA `idle_breath_amp_mult` 1.25** — Largest breath amplitude among non-cortisol profiles despite inhibitory framing.

## Low severity

7. **Dopamine sinusoidal glow** in `frontend/js/main.js` — Client-only; not in `vfx_profile` or SNN.
8. **Non-cortisol intensity** — Lerps numeric VFX toward baseline; `glow_hex` stays at full-mod color.

## Aligned / intentional

- GABA vs adrenaline spike ordering (tested).
- Noradrenaline vs adrenaline: higher active lobe drive, lower background (focus vs systemic arousal).
- Cortisol piecewise SNN + VFX at `CORTISOL_U_CRIT = 0.5` matches LLM prompt in `backend/main.py`.

See `backend/neuromodulation.py` for `NEUROMODULATOR_TABLE`, `resolve_cortisol_piecewise`, and `VFX_PROFILE_TABLE`.
