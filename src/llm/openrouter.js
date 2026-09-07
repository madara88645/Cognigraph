// OpenRouter client (Worker B). The ONLY runtime network call in the whole app, and it only happens
// when the user has pasted their own key into Scenario settings.
//
// Rules this file keeps:
//   * the key lives in localStorage under `cg.openrouter.key`, is read at call time, and is never
//     logged, never put in a message, never sent anywhere except openrouter.ai;
//   * nothing here throws — every failure comes back as `{ok:false, reason}` with a sentence a human
//     can act on, so Scenario mode can always fall back to the local heuristic;
//   * the STRUCTURE of whatever the model returns is treated as hostile input: unknown region ids are
//     dropped, numbers are clamped, text is capped, missing fields are defaulted. The CONTENT is not
//     checked — nothing here can tell a right claim from a wrong one. llmScreenText() is the single
//     exception, and it only flags diagnostic wording so the UI can add a note.
import { REGIONS } from '../data/regions.js';
import { LLM_MODULATORS, LLM_BASELINE, llmMarkLesionedSteps, llmLesionedInSteps } from './classify-local.js';

export const LLM_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
export const LLM_KEY_STORAGE = 'cg.openrouter.key';
export const LLM_MODEL_STORAGE = 'cg.openrouter.model';
export const LLM_DEFAULT_MODEL = 'openai/gpt-4o-mini';

/** The four models offered in Settings. Ids are just strings — OpenRouter validates them, we don't. */
export const LLM_MODELS = [
  { id: 'openai/gpt-4o-mini', label: 'GPT-4o mini — cheap, fast (default)' },
  { id: 'anthropic/claude-haiku-4.5', label: 'Claude Haiku 4.5 — careful prose' },
  { id: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash — fast, long context' },
  { id: 'meta-llama/llama-3.3-70b-instruct', label: 'Llama 3.3 70B — open weights' },
];

const LLM_MAX_STEPS = 6;
const LLM_MIN_STEPS = 1;
const LLM_MAX_TEXT = 400;        // per step field
const LLM_MAX_TITLE = 120;
const LLM_MAX_RATIONALE = 700;
const LLM_MAX_REGIONS_PER_STEP = 4;
const LLM_MAX_PROMPT_CHARS = 1200;
const LLM_MAX_TOKENS = 1500;   // 6 steps x 2 prose fields + rationale truncated at 900
const LLM_TEMPERATURE = 0.3;

/* ---------- storage (browser only; every access is guarded) ---------- */

function llmStore() {
  try { return (typeof localStorage !== 'undefined') ? localStorage : null; } catch (err) { return null; }
}

/** The user's key, or '' — read fresh at call time so clearing it takes effect immediately. */
export function llmStoredKey() {
  const s = llmStore();
  if (!s) return '';
  try { return String(s.getItem(LLM_KEY_STORAGE) || '').trim(); } catch (err) { return ''; }
}

export function llmSetStoredKey(key) {
  const s = llmStore();
  if (!s) return false;
  try {
    const v = String(key == null ? '' : key).trim();
    if (v) s.setItem(LLM_KEY_STORAGE, v); else s.removeItem(LLM_KEY_STORAGE);
    return true;
  } catch (err) { return false; }
}

export function llmStoredModel() {
  const s = llmStore();
  if (!s) return LLM_DEFAULT_MODEL;
  try { return String(s.getItem(LLM_MODEL_STORAGE) || '').trim() || LLM_DEFAULT_MODEL; } catch (err) { return LLM_DEFAULT_MODEL; }
}

export function llmSetStoredModel(model) {
  const s = llmStore();
  if (!s) return false;
  try {
    const v = String(model == null ? '' : model).trim();
    if (v && v !== LLM_DEFAULT_MODEL) s.setItem(LLM_MODEL_STORAGE, v); else s.removeItem(LLM_MODEL_STORAGE);
    return true;
  } catch (err) { return false; }
}

/** Never show a key in full. 'sk-or-v1-abc…xyz' — enough to recognise, not enough to use. */
export function llmMaskKey(key) {
  const k = String(key == null ? '' : key).trim();
  if (!k) return '';
  if (k.length <= 12) return k.slice(0, 3) + '…';
  return k.slice(0, 8) + '…' + k.slice(-4);
}

/* ---------- prompt ---------- */

let llmRegionListCache = null;

/** One line per allowed region id, built from REGIONS so the prompt can never drift from the data. */
export function llmRegionCatalogue() {
  if (llmRegionListCache) return llmRegionListCache;
  llmRegionListCache = REGIONS.map((r) => '  ' + r.id + ' — ' + r.name + ': ' + r.one_liner).join('\n');
  return llmRegionListCache;
}

/**
 * The system prompt. Adapted from the old CogniGraph backend's classification prompt (five lobes, one
 * modulator) to this app's schema (28 region ids, an ordered sequence, six modulator values), keeping
 * its cortisol acute-vs-chronic regime rule and its "educational, never medical" constraints.
 */
export function llmSystemPrompt(lesions) {
  const lesioned = (Array.isArray(lesions) ? lesions : []).filter((id) => typeof id === 'string' && id);
  const lesionLine = lesioned.length
    ? `\n\nLESIONS — the reader has switched these regions off in the Atlas. These regions are lesioned and cannot contribute: ${lesioned.join(', ')}; route the sequence around them where plausible and say so in the rationale.`
    : '';
  return `You are a cognitive neuroscientist writing for CogniGraph, an educational 3D brain simulation. The user describes a moment from ordinary life. You reply with ONE JSON object that turns it into a plausible teaching narrative: which brain regions are likely engaged, in what order, plus a neuromodulator profile.

ALLOWED REGION IDS — use only these, spelled exactly. Any other id is discarded by the app.
${llmRegionCatalogue()}${lesionLine}

OUTPUT — strict JSON, no markdown fences, no prose outside the object, no extra keys:
{"title":"short name for this moment","steps":[{"region_ids":["v1"],"approx_ms":55,"what_happens":"...","why_it_matters":"..."}],"neuromodulators":{"dopamine":0.3,"acetylcholine":0.3,"noradrenaline":0.3,"serotonin":0.5,"gaba":0.5,"cortisol":0.2},"intensity":0.5,"rationale":"...","confidence":0.5}

RULES
1. steps: 3 to 6 of them, in the order the regions are engaged, 1 to 3 region_ids each. Order matters more than anything else here.
2. approx_ms is the approximate latency after the triggering event, in milliseconds. Give a number ONLY where an experimental literature supports a rough value for that stage (for example ~55 for V1 onset, ~170 for the fusiform face area). If the episode unfolds over minutes, hours or nights, or you would be guessing, set approx_ms to null for EVERY step rather than inventing numbers. Never mix real latencies with invented ones.
3. what_happens: one or two plain-English sentences on what that region contributes here. why_it_matters: one sentence on why the step matters for this particular moment. Explain any term you use. Maximum 300 characters each.
4. neuromodulators: six values from 0 to 1 for how strongly each system is likely in play. About 0.5 is an ordinary resting level for serotonin and GABA; about 0.2 to 0.3 is ordinary for dopamine, acetylcholine, noradrenaline and cortisol. No concentrations, no units, no invented measurements.
5. Cortisol regime: 0.5 or below means acute, useful arousal (waking up, a short manageable challenge); above 0.5 means chronic or toxic load (sustained stress, exam panic, burnout, overtraining). Do not raise cortisol for a neutral scene unless stress is actually described. Use noradrenaline, not cortisol, for a fast startle or a moment of vigilance; use cortisol when the stress axis itself is the subject.
6. intensity: 0 to 1, how strongly the whole episode is driven. confidence: 0 to 1, how well this mapping is supported — be honest, 0.4 to 0.6 is normal for an everyday description.
7. rationale: 2 to 3 sentences of plain English on why you chose these regions and this profile. Hedge your claims ("likely", "typically", "in most textbook accounts"). It is shown to the reader word for word, so write it for them, not for me.
8. This is an educational visualisation, not medical software. Never diagnose, never suggest treatment, never claim to have measured this person's brain, hormones or mental state. If the description sounds like a health problem, answer only as a general teaching sketch and say so inside the rationale.
9. If the description is empty, nonsense, or not about a human moment, set confidence to 0.2 or below and return a generic sensory-to-prefrontal sequence rather than guessing.`;
}

/* ---------- validation / hardening ---------- */

let llmIdSetCache = null;
function llmKnownIds() {
  if (!llmIdSetCache) llmIdSetCache = new Set(REGIONS.map((r) => r.id));
  return llmIdSetCache;
}

function llmClampUnit(x) { return x < 0 ? 0 : (x > 1 ? 1 : x); }
function llmRound2(x) { return Math.round(x * 100) / 100; }

function llmNum(v, fallback) {
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
}

function llmText(v, max) {
  if (typeof v !== 'string') return '';
  const t = v.replace(/\s+/g, ' ').trim();
  return t.length > max ? t.slice(0, max - 1).trimEnd() + '…' : t;
}

/** Pull a JSON object out of a model reply: raw object, fenced block, or prose with an object in it. */
function llmExtractJson(raw) {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw;
  if (typeof raw !== 'string') return null;
  let s = raw.trim();
  const fence = s.match(/```(?:json|JSON)?\s*([\s\S]*?)```/);
  if (fence) s = fence[1].trim();
  try { const o = JSON.parse(s); return (o && typeof o === 'object' && !Array.isArray(o)) ? o : null; } catch (err) { /* fall through */ }
  const start = s.indexOf('{');
  if (start < 0) return null;
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') { inStr = true; continue; }
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) {
        try { const o = JSON.parse(s.slice(start, i + 1)); return (o && typeof o === 'object' && !Array.isArray(o)) ? o : null; } catch (err) { return null; }
      }
    }
  }
  return null;
}

/**
 * Phrases that turn a teaching sketch into a diagnosis or a prescription. This is a wording screen,
 * not a fact-check: it says nothing about whether the neuroscience is right, only that the model has
 * started addressing the reader as a patient. Scenario mode surfaces a note when it fires.
 *
 * Matched on a space-padded, single-spaced lowercase copy, so "you have " cannot fire on "you haven't".
 *
 * @param {string} str
 * @returns {{flagged:boolean, reason:string}}
 */
export const LLM_SCREEN_PHRASES = [
  'you have ', 'diagnosed with', 'you should take', 'prescribe', 'medication',
  'you suffer from', 'your condition',
];

export function llmScreenText(str) {
  if (typeof str !== 'string' || !str) return { flagged: false, reason: '' };
  const t = ' ' + str.toLowerCase().replace(/\s+/g, ' ').trim() + ' ';
  for (const p of LLM_SCREEN_PHRASES) {
    if (t.indexOf(p) >= 0) return { flagged: true, reason: p.trim() };
  }
  return { flagged: false, reason: '' };
}

/**
 * Turn whatever the model produced into a ScenarioResult, or say why it could not be used.
 * Never throws. `raw` may be an object, a JSON string, a fenced block, or garbage.
 * @param {*} raw
 * @param {object} [opts] {lesions: string[]} — a lesioned id that survives into the reply is flagged
 *                        `broken` rather than dropped: the model was told to route around it, and the
 *                        reader should see when it did not.
 * @returns {object} {ok:true, source:'llm', ...} or {ok:false, reason}
 */
export function validateScenarioResult(raw, opts = {}) {
  const obj = llmExtractJson(raw);
  if (!obj) return { ok: false, reason: 'The model did not return usable JSON.' };

  const known = llmKnownIds();
  const rawSteps = Array.isArray(obj.steps) ? obj.steps : [];
  const steps = [];
  // Two different things happen to a step, and the reader deserves to know which: `capped` is this
  // app refusing to show more than six, `malformed` is the model sending something unusable.
  let droppedIds = 0, capped = 0, malformed = 0;

  for (const s of rawSteps) {
    if (steps.length >= LLM_MAX_STEPS) { capped++; continue; }
    if (!s || typeof s !== 'object') { malformed++; continue; }
    const list = Array.isArray(s.region_ids) ? s.region_ids : (typeof s.region_ids === 'string' ? [s.region_ids] : []);
    const ids = [];
    for (const id of list) {
      const key = typeof id === 'string' ? id.trim() : '';
      if (!key) continue;
      if (!known.has(key)) { droppedIds++; continue; }
      if (ids.indexOf(key) < 0 && ids.length < LLM_MAX_REGIONS_PER_STEP) ids.push(key);
    }
    const what = llmText(s.what_happens, LLM_MAX_TEXT);
    const why = llmText(s.why_it_matters, LLM_MAX_TEXT);
    if (!ids.length || (!what && !why)) { malformed++; continue; }
    const ms = llmNum(s.approx_ms, null);
    steps.push({
      region_ids: ids,
      approx_ms: (ms !== null && ms >= 0 && ms < 1e9) ? Math.round(ms) : null,
      what_happens: what || why,
      why_it_matters: why || '',
    });
  }

  if (steps.length < LLM_MIN_STEPS) {
    return { ok: false, reason: 'The model returned no steps this app could use (no recognised region ids).' };
  }

  const nm = (obj.neuromodulators && typeof obj.neuromodulators === 'object') ? obj.neuromodulators : {};
  const neuromodulators = {};
  for (const k of LLM_MODULATORS) neuromodulators[k] = llmRound2(llmClampUnit(llmNum(nm[k], LLM_BASELINE[k])));

  const rationale = llmText(obj.rationale, LLM_MAX_RATIONALE);

  // Wording screen over the prose the reader will actually see. Nothing is rewritten or removed —
  // the mode adds a note, because silently editing a model's words would be its own dishonesty.
  const fields = [];
  steps.forEach((s, i) => {
    if (llmScreenText(s.what_happens).flagged) fields.push('steps[' + i + '].what_happens');
    if (llmScreenText(s.why_it_matters).flagged) fields.push('steps[' + i + '].why_it_matters');
  });
  if (llmScreenText(rationale).flagged) fields.push('rationale');

  const lesions = Array.isArray(opts.lesions) ? opts.lesions : [];
  const marked = llmMarkLesionedSteps(steps, lesions);

  return {
    ok: true,
    source: 'llm',
    title: llmText(obj.title, LLM_MAX_TITLE) || 'Your scenario',
    steps: marked,
    lesioned: llmLesionedInSteps(marked, lesions),
    neuromodulators,
    intensity: llmRound2(llmClampUnit(llmNum(obj.intensity, 0.5))),
    rationale,
    confidence: llmRound2(llmClampUnit(llmNum(obj.confidence, 0.5))),
    dropped: { region_ids: droppedIds, capped, malformed },
    screened: { flagged: fields.length > 0, fields },
  };
}

/* ---------- request ---------- */

function llmReferer() {
  try {
    if (typeof location !== 'undefined' && location && location.origin && location.origin !== 'null') return location.origin;
  } catch (err) { /* file:// and sandboxes */ }
  return null;
}

function llmHttpReason(status) {
  if (status === 401 || status === 403) return 'OpenRouter rejected the key (HTTP ' + status + '). Check it in Scenario settings.';
  if (status === 402) return 'OpenRouter says this account has no credit left (HTTP 402).';
  if (status === 404) return 'OpenRouter does not know that model id (HTTP 404). Pick another one in settings.';
  if (status === 408) return 'OpenRouter timed out (HTTP 408).';
  if (status === 429) return 'OpenRouter is rate-limiting this key (HTTP 429). Wait a moment and try again.';
  if (status >= 500) return 'OpenRouter had a server error (HTTP ' + status + '). Not your fault; try again shortly.';
  return 'OpenRouter returned HTTP ' + status + '.';
}

/**
 * Ask an LLM through OpenRouter to describe a scenario in this app's schema.
 * Resolves to a ScenarioResult ({ok:true, source:'llm', model}) or {ok:false, reason} — never rejects.
 *
 * @param {string} text        the user's description
 * @param {object} opts        {key, model, fetchImpl, signal, lesions}
 */
export async function classifyWithOpenRouter(text, opts = {}) {
  const key = String(opts.key == null ? '' : opts.key).trim();
  const model = String(opts.model || LLM_DEFAULT_MODEL).trim() || LLM_DEFAULT_MODEL;
  const prompt = String(text == null ? '' : text).trim().slice(0, LLM_MAX_PROMPT_CHARS);
  const doFetch = opts.fetchImpl || (typeof fetch === 'function' ? fetch : null);
  const lesions = Array.isArray(opts.lesions) ? opts.lesions.filter((id) => typeof id === 'string' && id) : [];

  if (!key) return { ok: false, reason: 'No OpenRouter key. Add one in Scenario settings, or keep using the local heuristic.' };
  if (!prompt) return { ok: false, reason: 'Nothing to classify — describe a moment first.' };
  if (!doFetch) return { ok: false, reason: 'This environment has no fetch, so the LLM path is unavailable.' };

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + key,
    'X-Title': 'CogniGraph',
  };
  const referer = llmReferer();
  if (referer) headers['HTTP-Referer'] = referer;

  const body = {
    model,
    messages: [
      { role: 'system', content: llmSystemPrompt(lesions) },
      { role: 'user', content: prompt },
    ],
    response_format: { type: 'json_object' },
    temperature: LLM_TEMPERATURE,
    max_tokens: LLM_MAX_TOKENS,
  };

  let res;
  try {
    res = await doFetch(LLM_ENDPOINT, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: opts.signal,
    });
  } catch (err) {
    const name = err && err.name;
    if (name === 'AbortError' || (opts.signal && opts.signal.aborted)) {
      return { ok: false, aborted: true, reason: 'The request was cancelled or timed out.' };
    }
    // A TypeError from fetch before any response means the request never left the page: CSP, an
    // offline machine, or a blocked sandbox. The mode turns this into the sandbox explanation.
    return {
      ok: false, blocked: true,
      reason: 'Could not reach openrouter.ai — the request was blocked before it left the page, or the network is down.',
    };
  }

  if (!res || typeof res.status !== 'number') return { ok: false, reason: 'OpenRouter sent a reply this app could not read.' };
  if (!res.ok) return { ok: false, status: res.status, reason: llmHttpReason(res.status) };

  let payload;
  try { payload = await res.json(); } catch (err) { return { ok: false, reason: 'OpenRouter sent a reply that was not JSON.' }; }

  const choice = payload && Array.isArray(payload.choices) ? payload.choices[0] : null;
  const content = choice && choice.message ? choice.message.content : null;
  if (!content) {
    const apiErr = payload && payload.error && payload.error.message;
    return { ok: false, reason: apiErr ? 'OpenRouter: ' + llmText(apiErr, 200) : 'OpenRouter returned no message content.' };
  }

  const result = validateScenarioResult(content, { lesions });
  if (!result.ok) return result;
  result.model = model;
  return result;
}
