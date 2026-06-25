// tests/test_simulation_pure.mjs
// Run with: node --test tests/test_simulation_pure.mjs
// Requires Node.js >= 22.3.0 for mock.module() ES module mocking.
//
// Tests three pure helpers in frontend/js/simulation.js:
//   * formatFastApiDetail  - normalises detail payloads from FastAPI
//   * assertValidResponse  - validates and normalises /simulate response shape
//   * isSimulationCanceledError - type guard for the user-abort sentinel error
//
// constants.js is mocked to avoid the Three.js renderer dependency.

import { mock, test, describe } from "node:test";
import assert from "node:assert/strict";

// Mock constants.js BEFORE any import of simulation.js.
// This avoids pulling in Three.js (a browser renderer) which would fail in Node.
mock.module("../frontend/js/constants.js", {
  namedExports: {
    LOBES: ["frontal", "parietal", "occipital", "temporal", "cerebellum"],
    NEUROMODS: [
      "adrenaline", "noradrenaline", "dopamine", "serotonin",
      "gaba", "acetylcholine", "cortisol", "baseline",
    ],
    REQUEST_TIMEOUT_MS: 120_000,
  },
});

// Dynamic import must come AFTER mock.module() so the mock intercepts the
// transitive import when simulation.js first loads.
const { formatFastApiDetail, assertValidResponse, isSimulationCanceledError } =
  await import("../frontend/js/simulation.js");

// -- formatFastApiDetail ------------------------------------------------------

describe("formatFastApiDetail", () => {
  test("returns a trimmed plain string detail unchanged", () => {
    assert.equal(formatFastApiDetail("  rate limit exceeded  ", 429), "rate limit exceeded");
  });
  test("returns fallback 'Simulation failed' message for empty string detail", () => {
    assert.match(formatFastApiDetail("", 500), /Simulation failed/);
  });
  test("returns fallback message for null detail", () => {
    assert.match(formatFastApiDetail(null, 500), /Simulation failed/);
  });
  test("joins array detail items that have a msg property", () => {
    const detail = [{ msg: "field required" }, { msg: "value is not a valid integer" }];
    assert.equal(formatFastApiDetail(detail, 422), "field required; value is not a valid integer");
  });
  test("serialises unknown array items via JSON.stringify", () => {
    const detail = [{ type: "missing" }];
    assert.match(formatFastApiDetail(detail, 422), /missing/);
  });
  test("serialises a plain object detail via JSON.stringify", () => {
    assert.match(formatFastApiDetail({ error: "quota_exceeded" }, 429), /quota_exceeded/);
  });
});

// -- assertValidResponse ------------------------------------------------------

function makeValidPayload(overrides = {}) {
  return {
    active_lobe: "frontal",
    explanation: "The frontal lobe is active.",
    duration_ms: 320,
    spikes: { frontal: [0.8, 0.6] },
    dominant_neuromodulator: "dopamine",
    neuromodulator_intensity: 0.75,
    snn_modulation: { dopamine: 1.2 },
    vfx_profile: { bloom: 0.9 },
    ...overrides,
  };
}

describe("assertValidResponse", () => {
  test("accepts a fully-valid payload without throwing", () => {
    assert.doesNotThrow(() => assertValidResponse(makeValidPayload()));
  });
  test("clamps neuromodulator_intensity above 1 to 1", () => {
    const payload = makeValidPayload({ neuromodulator_intensity: 1.8 });
    assertValidResponse(payload);
    assert.equal(payload.neuromodulator_intensity, 1);
  });
  test("clamps neuromodulator_intensity below 0 to 0", () => {
    const payload = makeValidPayload({ neuromodulator_intensity: -0.5 });
    assertValidResponse(payload);
    assert.equal(payload.neuromodulator_intensity, 0);
  });
  test("coerces numeric-string duration_ms to a number", () => {
    const payload = makeValidPayload({ duration_ms: "450" });
    assertValidResponse(payload);
    assert.strictEqual(payload.duration_ms, 450);
  });
  test("throws when payload is null", () => {
    assert.throws(() => assertValidResponse(null), /invalid/i);
  });
  test("throws when active_lobe is not in LOBES", () => {
    assert.throws(() => assertValidResponse(makeValidPayload({ active_lobe: "brainstem" })), /active_lobe/);
  });
  test("throws when explanation is missing", () => {
    const { explanation: _, ...payload } = makeValidPayload();
    assert.throws(() => assertValidResponse(payload), /explanation/);
  });
  test("throws when duration_ms is non-numeric", () => {
    assert.throws(() => assertValidResponse(makeValidPayload({ duration_ms: "fast" })), /duration_ms/);
  });
  test("throws when spikes is missing", () => {
    const { spikes: _, ...payload } = makeValidPayload();
    assert.throws(() => assertValidResponse(payload), /spikes/);
  });
  test("throws when dominant_neuromodulator is not in NEUROMODS", () => {
    assert.throws(
      () => assertValidResponse(makeValidPayload({ dominant_neuromodulator: "caffeine" })),
      /dominant_neuromodulator/
    );
  });
  test("throws when snn_modulation is missing", () => {
    const { snn_modulation: _, ...payload } = makeValidPayload();
    assert.throws(() => assertValidResponse(payload), /snn_modulation/);
  });
  test("throws when vfx_profile is missing", () => {
    const { vfx_profile: _, ...payload } = makeValidPayload();
    assert.throws(() => assertValidResponse(payload), /vfx_profile/);
  });
  test("accepts null neuromodulator_rationale (optional field)", () => {
    assert.doesNotThrow(() => assertValidResponse(makeValidPayload({ neuromodulator_rationale: null })));
  });
  test("throws when neuromodulator_rationale is a non-string non-null value", () => {
    assert.throws(
      () => assertValidResponse(makeValidPayload({ neuromodulator_rationale: 42 })),
      /neuromodulator_rationale/
    );
  });
});

// -- isSimulationCanceledError ------------------------------------------------

describe("isSimulationCanceledError", () => {
  test("returns false for a non-Error value", () => {
    assert.equal(isSimulationCanceledError("oops"), false);
    assert.equal(isSimulationCanceledError(null), false);
    assert.equal(isSimulationCanceledError(42), false);
  });
  test("returns false for a generic Error", () => {
    assert.equal(isSimulationCanceledError(new Error("network timeout")), false);
  });
  test("returns true only for the exact cancel sentinel message", () => {
    assert.equal(isSimulationCanceledError(new Error("SIMULATION_CANCELED")), true);
  });
  test("returns false for a close-but-wrong message", () => {
    assert.equal(isSimulationCanceledError(new Error("simulation canceled")), false);
    assert.equal(isSimulationCanceledError(new Error("SIMULATION_CANCELLED")), false);
  });
});
