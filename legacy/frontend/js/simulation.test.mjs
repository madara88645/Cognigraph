import test from "node:test";
import assert from "node:assert/strict";

import {
  formatFastApiDetail,
  assertValidResponse,
  isSimulationCanceledError,
} from "./simulation.js";

function validPayload(overrides = {}) {
  return {
    active_lobe: "frontal",
    explanation: "Focused planning activity.",
    duration_ms: 500,
    spikes: { indices: [], times_ms: [] },
    dominant_neuromodulator: "dopamine",
    neuromodulator_intensity: 0.5,
    snn_modulation: {},
    vfx_profile: {},
    ...overrides,
  };
}

// --- formatFastApiDetail -----------------------------------------------------

test("formatFastApiDetail returns a non-empty string detail as-is", () => {
  assert.equal(formatFastApiDetail("Model unavailable", 503), "Model unavailable");
});

test("formatFastApiDetail falls back to the status message for a blank string", () => {
  assert.equal(formatFastApiDetail("   ", 500), "Simulation failed (500)");
});

test("formatFastApiDetail joins FastAPI validation-error arrays by their msg field", () => {
  const detail = [{ msg: "field required" }, { msg: "invalid type" }];
  assert.equal(formatFastApiDetail(detail, 422), "field required; invalid type");
});

test("formatFastApiDetail stringifies array entries without a msg field", () => {
  const detail = [{ loc: ["body", "prompt"] }];
  assert.equal(formatFastApiDetail(detail, 422), '{"loc":["body","prompt"]}');
});

test("formatFastApiDetail JSON-stringifies a plain object detail", () => {
  assert.equal(formatFastApiDetail({ error: "bad" }, 500), '{"error":"bad"}');
});

test("formatFastApiDetail falls back to the status message when detail is missing", () => {
  assert.equal(formatFastApiDetail(undefined, 500), "Simulation failed (500)");
  assert.equal(formatFastApiDetail(null, 500), "Simulation failed (500)");
});

// --- assertValidResponse -----------------------------------------------------

test("assertValidResponse accepts a well-formed payload", () => {
  assert.doesNotThrow(() => assertValidResponse(validPayload()));
});

test("assertValidResponse rejects a non-object payload", () => {
  assert.throws(() => assertValidResponse(null), /API response is invalid/);
  assert.throws(() => assertValidResponse("nope"), /API response is invalid/);
});

test("assertValidResponse rejects an unknown active_lobe", () => {
  assert.throws(
    () => assertValidResponse(validPayload({ active_lobe: "hippocampus" })),
    /active_lobe missing or invalid/
  );
});

test("assertValidResponse rejects a non-string explanation", () => {
  assert.throws(
    () => assertValidResponse(validPayload({ explanation: 123 })),
    /explanation missing/
  );
});

test("assertValidResponse rejects a non-numeric duration_ms", () => {
  assert.throws(
    () => assertValidResponse(validPayload({ duration_ms: "soon" })),
    /duration_ms missing or invalid/
  );
});

test("assertValidResponse coerces a numeric string duration_ms in place", () => {
  const payload = validPayload({ duration_ms: "750" });
  assertValidResponse(payload);
  assert.equal(payload.duration_ms, 750);
});

test("assertValidResponse rejects a missing spikes object", () => {
  assert.throws(() => assertValidResponse(validPayload({ spikes: null })), /spikes missing/);
});

test("assertValidResponse rejects an unknown dominant_neuromodulator", () => {
  assert.throws(
    () => assertValidResponse(validPayload({ dominant_neuromodulator: "unknown" })),
    /dominant_neuromodulator missing or invalid/
  );
});

test("assertValidResponse clamps neuromodulator_intensity into [0, 1]", () => {
  const high = validPayload({ neuromodulator_intensity: 5 });
  assertValidResponse(high);
  assert.equal(high.neuromodulator_intensity, 1);

  const low = validPayload({ neuromodulator_intensity: -2 });
  assertValidResponse(low);
  assert.equal(low.neuromodulator_intensity, 0);
});

test("assertValidResponse rejects a non-numeric neuromodulator_intensity", () => {
  assert.throws(
    () => assertValidResponse(validPayload({ neuromodulator_intensity: "high" })),
    /neuromodulator_intensity missing or invalid/
  );
});

test("assertValidResponse rejects a non-string neuromodulator_rationale when present", () => {
  assert.throws(
    () => assertValidResponse(validPayload({ neuromodulator_rationale: 42 })),
    /neuromodulator_rationale must be a string/
  );
});

test("assertValidResponse allows a null or missing neuromodulator_rationale", () => {
  assert.doesNotThrow(() => assertValidResponse(validPayload({ neuromodulator_rationale: null })));
});

test("assertValidResponse rejects a missing snn_modulation", () => {
  assert.throws(
    () => assertValidResponse(validPayload({ snn_modulation: undefined })),
    /snn_modulation missing/
  );
});

test("assertValidResponse rejects a missing vfx_profile", () => {
  assert.throws(
    () => assertValidResponse(validPayload({ vfx_profile: undefined })),
    /vfx_profile missing/
  );
});

// --- isSimulationCanceledError -----------------------------------------------

test("isSimulationCanceledError recognizes the cancellation sentinel error", () => {
  assert.equal(isSimulationCanceledError(new Error("SIMULATION_CANCELED")), true);
});

test("isSimulationCanceledError rejects other errors and non-errors", () => {
  assert.equal(isSimulationCanceledError(new Error("network down")), false);
  assert.equal(isSimulationCanceledError("SIMULATION_CANCELED"), false);
  assert.equal(isSimulationCanceledError(null), false);
  assert.equal(isSimulationCanceledError(undefined), false);
});
