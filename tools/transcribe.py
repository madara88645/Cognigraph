#!/usr/bin/env python3
"""One-shot: research/research.json -> src/data/*.js (mechanical). Worker B edits the JS afterwards; do not re-run blindly."""
import json, pathlib
ROOT = pathlib.Path(__file__).parent.parent
R = json.load(open(ROOT / "research/research.json", encoding="utf-8"))
D = ROOT / "src/data"; D.mkdir(exist_ok=True)
def js(name, value, comment):
    return f"// {comment}\n// Source: research/research.json (mechanically transcribed 2026-09-06), then hand-edited.\nexport const {name} = {json.dumps(value, ensure_ascii=False, indent=2)};\n"
c, n = R["content"], R["neuron"]
(D / "regions.js").write_text(js("REGIONS", c["regions"], "28 brain regions used by all modes. Fields: id, name, group, one_liner, functions[], key_connections[], lesion_effects, famous_case_or_evidence, approx_location."), encoding="utf-8")
(D / "pathways.js").write_text(js("PATHWAYS", c["pathways"], "8 cognitive pathway scenarios. steps[]: region_ids[], approx_ms, what_happens, why_it_matters, evidence_or_method; accuracy_caveats."), encoding="utf-8")
(D / "glossary.js").write_text(js("GLOSSARY", c["glossary"], "Glossary terms auto-linked in rendered text. Fields: term, plain_definition."), encoding="utf-8")
presets = {
  "RS":  {"name": "Regular spiking (excitatory cortical)", "a": 0.02, "b": 0.2,  "c": -65, "d": 8,    "note": "Fires regularly, then adapts (slows) under sustained input."},
  "IB":  {"name": "Intrinsically bursting",                "a": 0.02, "b": 0.2,  "c": -55, "d": 4,    "note": "Initial burst, then single spikes."},
  "CH":  {"name": "Chattering",                            "a": 0.02, "b": 0.2,  "c": -50, "d": 2,    "note": "Repeated high-frequency bursts."},
  "FS":  {"name": "Fast spiking (inhibitory interneuron)", "a": 0.1,  "b": 0.2,  "c": -65, "d": 2,    "note": "Very fast, little adaptation."},
  "LTS": {"name": "Low-threshold spiking",                 "a": 0.02, "b": 0.25, "c": -65, "d": 2,    "note": "Bursts at low input; adapts."},
  "TC":  {"name": "Thalamocortical",                       "a": 0.02, "b": 0.25, "c": -65, "d": 0.05, "note": "Tonic or rebound-bursting depending on holding current, not only on (a,b,c,d)."},
}
neuro = "// Neuron-simulation content: neuromodulator mappings (with honesty ratings), Izhikevich presets, misconceptions list.\n"
neuro += "// Source: research/research.json (mechanically transcribed 2026-09-06), then hand-edited.\n"
neuro += f"export const NEURON_MODEL = {json.dumps({'model_choice': n['model_choice'], 'equations_plain': n['equations_plain'], 'default_params': n['default_params'], 'population_design': n['population_design'], 'visualizations': n['visualizations'], 'explanations_to_include': n['explanations_to_include'], 'pitfalls': n['pitfalls']}, ensure_ascii=False, indent=2)};\n"
neuro += f"export const NEUROMOD_DEFS = {json.dumps(n['neuromodulator_mappings'], ensure_ascii=False, indent=2)};\n"
neuro += f"export const NEURON_PRESETS = {json.dumps(presets, ensure_ascii=False, indent=2)};\n"
neuro += f"export const ACCURACY_PITFALLS = {json.dumps(c['accuracy_pitfalls'], ensure_ascii=False, indent=2)};\n"
(D / "neuro.js").write_text(neuro, encoding="utf-8")
print("ok", [p.name for p in sorted(D.glob('*.js'))])
