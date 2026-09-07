// Grounded "Ask about this" (Worker Q). Key-gated, and the second — and last — network call in the app.
//
// The difference from Scenario's classifier is the whole point of this file: Scenario asks a model to
// invent a plausible narrative and labels it as invented. Ask does the opposite. It hands the model a
// small JSON copy of the record the user is looking at, forbids everything else, and requires every
// claim to carry the id of the record it came from in square brackets. An answer with no usable
// citation is shown as ungrounded rather than quietly presented as fact.
//
// What this can and cannot do: citations are checked for EXISTENCE, not for support. A model can cite
// [hippocampus] and still say something the hippocampus record does not say. The badge says "from this
// app's data only", never "correct".
import { REGIONS } from '../data/regions.js';
import { PATHWAYS } from '../data/pathways.js';
import { LLM_ENDPOINT, LLM_DEFAULT_MODEL } from './openrouter.js';

export const ASK_MAX_QUESTION = 400;
export const ASK_MAX_ANSWER = 900;
export const ASK_MAX_SENTENCES = 3;
export const ASK_MAX_TOKENS = 400;
export const ASK_TEMPERATURE = 0.1;
export const ASK_CONTEXT_CHARS = 6000;
/** The exact sentence the prompt demands when the answer is not in the context. */
export const ASK_CANT_TELL = "I can't tell from this app's data";

/* ---------- context ---------- */

function askText(v, max) {
  if (typeof v !== 'string') return '';
  const t = v.replace(/\s+/g, ' ').trim();
  return t.length > max ? t.slice(0, max - 1).trimEnd() + '…' : t;
}

/** Accept a record, an array of records, or {label, records}. Always returns the normalised form. */
export function askNormaliseContext(context) {
  if (!context) return { label: '', records: [] };
  if (Array.isArray(context)) return { label: '', records: context.filter(Boolean) };
  if (Array.isArray(context.records)) {
    return { label: String(context.label || ''), records: context.records.filter(Boolean) };
  }
  return { label: String(context.label || ''), records: context.id ? [context] : [] };
}

/** Every id a citation is allowed to use, in the order the records were given. */
export function askContextIds(context) {
  const out = [];
  for (const r of askNormaliseContext(context).records) {
    const id = r && typeof r.id === 'string' ? r.id.trim() : '';
    if (id && out.indexOf(id) < 0) out.push(id);
  }
  return out;
}

/** The context as compact JSON — this is literally what the model is given, and nothing else. */
export function askContextJson(context) {
  const ctx = askNormaliseContext(context);
  const json = JSON.stringify({ records: ctx.records });
  return json.length > ASK_CONTEXT_CHARS ? json.slice(0, ASK_CONTEXT_CHARS) + '…(truncated)' : json;
}

/* ---------- record builders (used by the modes, so every context has the same shape) ---------- */

export function askRegionRecord(id) {
  const r = REGIONS.find((x) => x.id === id);
  if (!r) return null;
  return {
    id: r.id, kind: 'region', name: r.name, group: r.group, one_liner: r.one_liner,
    functions: r.functions || [], key_connections: r.key_connections || [],
    lesion_effects: r.lesion_effects || '', evidence: r.famous_case_or_evidence || '',
    approx_location: r.approx_location || '',
  };
}

/** A pathway step, cited as `recall_word#2` (1-based, the number the timeline shows). */
export function askStepRecord(pathwayId, index) {
  const p = PATHWAYS.find((x) => x.id === pathwayId);
  if (!p || !p.steps[index]) return null;
  const s = p.steps[index];
  return {
    id: p.id + '#' + (index + 1), kind: 'pathway_step', pathway: p.title, step: index + 1,
    of: p.steps.length, region_ids: s.region_ids.slice(),
    approx_ms: p.timeline === 'ms' ? s.approx_ms : null,
    what_happens: s.what_happens, why_it_matters: s.why_it_matters,
    evidence_or_method: s.evidence_or_method || '',
  };
}

/** A Scenario result, cited as `scenario` (its steps ride along inside the one record). */
export function askScenarioRecord(result) {
  if (!result || !Array.isArray(result.steps)) return null;
  return {
    id: 'scenario', kind: 'scenario_result', title: result.title || 'Your scenario',
    source: result.source === 'llm' ? 'language model' : 'local keyword heuristic',
    steps: result.steps.map((s, i) => ({
      n: i + 1, region_ids: s.region_ids.slice(), approx_ms: s.approx_ms,
      what_happens: s.what_happens, broken: !!s.broken,
    })),
    neuromodulators: result.neuromodulators || {},
    rationale: result.rationale || '',
    confidence: result.confidence,
  };
}

/* ---------- prompt ---------- */

export function askSystemPrompt(context) {
  const ids = askContextIds(context);
  return `You answer questions about ONE record from CogniGraph, an educational brain simulation. The record is given to you as JSON. It is the only source you may use.

RULES
1. Use ONLY the JSON below. Do not add anything you know from elsewhere, however certain you are of it. If the JSON does not answer the question, reply exactly: "${ASK_CANT_TELL}." and nothing else.
2. Cite the record every claim comes from by putting its id in square brackets, like [${ids[0] || 'hippocampus'}]. Every answer that is not the "can't tell" line must contain at least one citation.
3. Allowed ids, exactly as written: ${ids.length ? ids.map((i) => '[' + i + ']').join(' ') : '(none)'} . Never invent an id.
4. At most ${ASK_MAX_SENTENCES} sentences. Plain English, no lists, no headings, no markdown.
5. Never diagnose, never give medical or personal advice, and never claim anything was measured about the reader.

RECORD JSON
${askContextJson(context)}`;
}

/* ---------- answer validation ---------- */

function askSentenceCap(text, max) {
  const parts = String(text).match(/[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g);
  if (!parts || parts.length <= max) return String(text).trim();
  return parts.slice(0, max).join('').trim();
}

/**
 * Pull the bracketed ids out of an answer and check them against the context.
 * Unknown ids are a hallucination, so they are reported separately and never returned as citations.
 * @returns {{citations:string[], unknown:string[]}}
 */
export function askParseCitations(answer, ids) {
  const known = new Set(Array.isArray(ids) ? ids : []);
  const citations = [], unknown = [];
  const re = /\[([^\][]{1,80})\]/g;
  let m;
  while ((m = re.exec(String(answer == null ? '' : answer)))) {
    const id = m[1].trim();
    if (!id) continue;
    if (known.has(id)) { if (citations.indexOf(id) < 0) citations.push(id); }
    else if (unknown.indexOf(id) < 0) unknown.push(id);
  }
  return { citations, unknown };
}

/**
 * Turn a model reply into the value the UI shows.
 *
 * `ungrounded` is true whenever the answer cannot be traced to the context: no citation at all, an
 * invented id, or the model saying it cannot tell. All three mean the same thing to a reader — do not
 * trust this as coming from the app's data — so they get the same red badge.
 *
 * @returns {{ok:boolean, answer:string, citations:string[], ungrounded:boolean, unknown:string[], cantTell:boolean}}
 */
export function askValidateAnswer(raw, context) {
  const ids = askContextIds(context);
  const text = askText(raw, ASK_MAX_ANSWER);
  if (!text) {
    return { ok: false, reason: 'The model returned an empty answer.', answer: '', citations: [], ungrounded: true, unknown: [], cantTell: false };
  }
  const answer = askSentenceCap(text, ASK_MAX_SENTENCES);
  const { citations, unknown } = askParseCitations(answer, ids);
  const cantTell = answer.toLowerCase().indexOf(ASK_CANT_TELL.toLowerCase()) >= 0;
  return {
    ok: true,
    answer,
    citations,
    unknown,
    cantTell,
    ungrounded: cantTell || unknown.length > 0 || citations.length === 0,
  };
}

/* ---------- request ---------- */

function askReferer() {
  try {
    if (typeof location !== 'undefined' && location && location.origin && location.origin !== 'null') return location.origin;
  } catch (err) { /* file:// and sandboxes */ }
  return null;
}

function askHttpReason(status) {
  if (status === 401 || status === 403) return 'OpenRouter rejected the key (HTTP ' + status + '). Check it in Settings.';
  if (status === 402) return 'OpenRouter says this account has no credit left (HTTP 402).';
  if (status === 404) return 'OpenRouter does not know that model id (HTTP 404). Pick another one in Settings.';
  if (status === 429) return 'OpenRouter is rate-limiting this key (HTTP 429). Wait a moment and try again.';
  if (status >= 500) return 'OpenRouter had a server error (HTTP ' + status + '). Not your fault; try again shortly.';
  return 'OpenRouter returned HTTP ' + status + '.';
}

/**
 * Ask a question about the record(s) in `context`. Never rejects; every failure is a value.
 * @param {string} question
 * @param {object} context  a record, an array of records, or {label, records}
 * @param {object} opts     {key, model, fetchImpl, signal}
 * @returns {Promise<{ok:boolean, answer?:string, citations?:string[], ungrounded?:boolean, reason?:string}>}
 */
export async function askGrounded(question, context, opts = {}) {
  const key = String(opts.key == null ? '' : opts.key).trim();
  const model = String(opts.model || LLM_DEFAULT_MODEL).trim() || LLM_DEFAULT_MODEL;
  const q = String(question == null ? '' : question).trim().slice(0, ASK_MAX_QUESTION);
  const ids = askContextIds(context);
  const doFetch = opts.fetchImpl || (typeof fetch === 'function' ? fetch : null);

  if (!key) return { ok: false, reason: 'No OpenRouter key. Add one in Settings to use Ask.' };
  if (!q) return { ok: false, reason: 'Type a question first.' };
  if (!ids.length) return { ok: false, reason: 'Nothing is selected, so there is no record to ask about.' };
  if (!doFetch) return { ok: false, reason: 'This environment has no fetch, so Ask is unavailable.' };

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + key,
    'X-Title': 'CogniGraph',
  };
  const referer = askReferer();
  if (referer) headers['HTTP-Referer'] = referer;

  let res;
  try {
    res = await doFetch(LLM_ENDPOINT, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: askSystemPrompt(context) },
          { role: 'user', content: q },
        ],
        temperature: ASK_TEMPERATURE,
        max_tokens: ASK_MAX_TOKENS,
      }),
      signal: opts.signal,
    });
  } catch (err) {
    const name = err && err.name;
    if (name === 'AbortError' || (opts.signal && opts.signal.aborted)) {
      return { ok: false, aborted: true, reason: 'The request was cancelled or timed out.' };
    }
    return {
      ok: false, blocked: true,
      reason: 'Could not reach openrouter.ai — the request was blocked before it left the page, or the network is down.',
    };
  }

  if (!res || typeof res.status !== 'number') return { ok: false, reason: 'OpenRouter sent a reply this app could not read.' };
  if (!res.ok) return { ok: false, status: res.status, reason: askHttpReason(res.status) };

  let payload;
  try { payload = await res.json(); } catch (err) { return { ok: false, reason: 'OpenRouter sent a reply that was not JSON.' }; }

  const choice = payload && Array.isArray(payload.choices) ? payload.choices[0] : null;
  const content = choice && choice.message ? choice.message.content : null;
  if (!content) {
    const apiErr = payload && payload.error && payload.error.message;
    return { ok: false, reason: apiErr ? 'OpenRouter: ' + askText(apiErr, 200) : 'OpenRouter returned no message content.' };
  }

  const out = askValidateAnswer(content, context);
  out.model = model;
  return out;
}
