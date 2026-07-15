// Node test for the pure response-validation/formatting helpers in
// frontend/js/simulation.js.
// Run with:
//   node --import ../../tests/helpers/registerThreeStub.js --test frontend/js/simulation.test.mjs
//
// simulation.js transitively imports "three" via constants.js (loaded via a
// browser import map, not an npm package), so the run must go through the
// registered stub loader — see tests/helpers/registerThreeStub.js and
// tests/helpers/threeStubLoader.js.

import test from "node:test";
import assert from "node:assert/strict";

import {
  assertValidResponse,
  formatFastApiDetail,
  isSimulationCanceledError,
} from "./simulation.js";

function validPayload(overrides = {}) {
  return {
    active_lobe: "frontal",
    explanation: "The frontal lobe activated.",
    duration_ms: 1200,
    spikes: { frontal: [1, 2, 3] },
    dominant_neuromodulator: "dopamine",
    neuromodulator_intensity: 0.5,
    neuromodulator_rationale: "reward prediction error",
    snn_modulation: { gain: 1.1 },
    vfx_profile: { glow_hex: "#E0FFFF" },
    ...overrides,
  };
}

// --- assertValidResponse ------------------------------------------------

test("assertValidResponse accepts a fully valid payload without throwing", () => {
  assert.doesNotThrow(() => assertValidResponse(validPayload()));
});

test("assertValidResponse coerces duration_ms to a number", () => {
  const payload = validPayload({ duration_ms: "1200" });
  assertValidResponse(payload);
  assert.equal(payload.duration_ms, 1200);
  assert.equal(typeof payload.duration_ms, "number");
});

test("assertValidResponse clamps neuromodulator_intensity above 1 down to 1", () => {
  const payload = validPayload({ neuromodulator_intensity: 4.2 });
  assertValidResponse(payload);
  assert.equal(payload.neuromodulator_intensity, 1);
});

test("assertValidResponse clamps neuromodulator_intensity below 0 up to 0", () => {
  const payload = validPayload({ neuromodulator_intensity: -3 });
  assertValidResponse(payload);
  assert.equal(payload.neuromodulator_intensity, 0);
});

test("assertValidResponse allows a null neuromodulator_rationale", () => {
  const payload = validPayload({ neuromodulator_rationale: null });
  assert.doesNotThrow(() => assertValidResponse(payload));
});

test("assertValidResponse rejects a non-object payload", () => {
  assert.throws(() => assertValidResponse(null), /API response is invalid/);
  assert.throws(() => assertValidResponse("nope"), /API response is invalid/);
  assert.throws(() => assertValidResponse(undefined), /API response is invalid/);
});

test("assertValidResponse rejects an unknown active_lobe", () => {
  assert.throws(
    () => assertValidResponse(validPayload({ active_lobe: "not-a-lobe" })),
    /active_lobe missing or invalid/,
  );
});

test("assertValidResponse rejects a non-string explanation", () => {
  assert.throws(
    () => assertValidResponse(validPayload({ explanation: 42 })),
    /explanation missing/,
  );
});

test("assertValidResponse rejects a non-finite duration_ms", () => {
  assert.throws(
    () => assertValidResponse(validPayload({ duration_ms: "not-a-number" })),
    /duration_ms missing or invalid/,
  );
});

test("assertValidResponse rejects a missing spikes object", () => {
  assert.throws(
    () => assertValidResponse(validPayload({ spikes: null })),
    /spikes missing/,
  );
});

test("assertValidResponse rejects an unknown dominant_neuromodulator", () => {
  assert.throws(
    () => assertValidResponse(validPayload({ dominant_neuromodulator: "adrenochrome" })),
    /dominant_neuromodulator missing or invalid/,
  );
});

test("assertValidResponse rejects a non-finite neuromodulator_intensity", () => {
  assert.throws(
    () => assertValidResponse(validPayload({ neuromodulator_intensity: "high" })),
    /neuromodulator_intensity missing or invalid/,
  );
});

test("assertValidResponse rejects a non-string neuromodulator_rationale", () => {
  assert.throws(
    () => assertValidResponse(validPayload({ neuromodulator_rationale: 7 })),
    /neuromodulator_rationale must be a string/,
  );
});

test("assertValidResponse rejects a missing snn_modulation object", () => {
  assert.throws(
    () => assertValidResponse(validPayload({ snn_modulation: null })),
    /snn_modulation missing/,
  );
});

test("assertValidResponse rejects a missing vfx_profile object", () => {
  assert.throws(
    () => assertValidResponse(validPayload({ vfx_profile: undefined })),
    /vfx_profile missing/,
  );
});

// --- formatFastApiDetail -------------------------------------------------

test("formatFastApiDetail returns a non-empty string detail as-is", () => {
  assert.equal(formatFastApiDetail("boom", 500), "boom");
});

test("formatFastApiDetail falls back to a generic message for a blank string", () => {
  assert.equal(formatFastApiDetail("   ", 500), "Simulation failed (500)");
});

test("formatFastApiDetail joins an array of FastAPI validation errors by msg", () => {
  const detail = [{ msg: "field required" }, { msg: "invalid type" }];
  assert.equal(formatFastApiDetail(detail, 422), "field required; invalid type");
});

test("formatFastApiDetail stringifies array entries without a msg field", () => {
  const detail = [{ msg: "ok" }, "raw-string-entry", 42];
  assert.equal(
    formatFastApiDetail(detail, 422),
    'ok; "raw-string-entry"; 42',
  );
});

test("formatFastApiDetail JSON-stringifies a plain object detail", () => {
  const detail = { code: "rate_limited" };
  assert.equal(formatFastApiDetail(detail, 429), JSON.stringify(detail));
});

test("formatFastApiDetail falls back to a generic message when the object can't be serialized", () => {
  const circular = {};
  circular.self = circular;
  assert.equal(formatFastApiDetail(circular, 500), "Simulation failed (500)");
});

test("formatFastApiDetail falls back to a generic message for null/undefined detail", () => {
  assert.equal(formatFastApiDetail(null, 503), "Simulation failed (503)");
  assert.equal(formatFastApiDetail(undefined, 503), "Simulation failed (503)");
});

// --- isSimulationCanceledError -------------------------------------------

test("isSimulationCanceledError recognizes the sentinel cancellation error", () => {
  assert.equal(isSimulationCanceledError(new Error("SIMULATION_CANCELED")), true);
});

test("isSimulationCanceledError returns false for other Errors", () => {
  assert.equal(isSimulationCanceledError(new Error("network failure")), false);
});

test("isSimulationCanceledError returns false for non-Error values", () => {
  assert.equal(isSimulationCanceledError("SIMULATION_CANCELED"), false);
  assert.equal(isSimulationCanceledError(null), false);
  assert.equal(isSimulationCanceledError(undefined), false);
});
