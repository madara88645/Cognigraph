// Glossary auto-linker + popover (Worker B).
//   linkTerms(html)  -> same html with glossary terms wrapped in <span class="term" data-term="...">
//   initGlossary(app) -> delegated .term clicks open #glossary-popover; #gp-more opens the drawer tab.
// Rules: longest match first, word boundaries, case-insensitive, never inside a tag/attribute or an
// existing .term span (or anything marked data-nolink), idempotent, at most 2 links per term per call.
import { GLOSSARY } from '../data/glossary.js';
import { openDrawer } from './panels.js';

const GL_MAX_PER_TERM = 2;
const GL_SKIP_TAGS = { script: 1, style: 1, textarea: 1 };
const GL_VOID_TAGS = { br: 1, hr: 1, img: 1, input: 1, meta: 1, link: 1, source: 1, wbr: 1, col: 1, area: 1 };
let glIndex = null;
let glInited = false;

/* ---------- index ---------- */

function glKey(s) { return String(s).toLowerCase().replace(/\s+/g, ' ').trim(); }
function glEscapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function glEscapeAttr(s) { return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }
function glUnescapeAttr(s) { return String(s).replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&amp;/g, '&'); }

/** Derive the matchable surface forms of one glossary term ("ERP (event-related potential)" -> both). */
function glAliases(term) {
  const out = [];
  const push = (s) => {
    const t = String(s).replace(/[\s,;.]+$/, '').trim();
    if (t.length >= 3 && !out.some((x) => glKey(x) === glKey(t))) out.push(t);
  };
  const split = (s) => {
    const paren = s.match(/^(.+?)\s*\(([^()]+)\)$/);
    if (paren) { split(paren[1]); split(paren[2]); return; }
    if (/\s(?:vs\.?|&|\/)\s/.test(s)) { s.split(/\s(?:vs\.?|&|\/)\s/).forEach(split); return; }
    push(s);
  };
  push(term);
  split(term.trim());
  return out;
}

function glBuildIndex(entries) {
  const map = new Map();       // alias key -> {term, definition}
  const byTerm = new Map();    // term key  -> {term, definition}
  const aliases = [];
  for (const e of entries) {
    if (!e || !e.term) continue;
    const rec = { term: e.term, definition: e.plain_definition || '' };
    byTerm.set(glKey(e.term), rec);
    for (const a of glAliases(e.term)) {
      const k = glKey(a);
      if (map.has(k)) continue;            // first term wins a shared alias
      map.set(k, rec);
      aliases.push(a);
    }
  }
  // longest first so "working memory" beats "memory" at the same position
  aliases.sort((a, b) => b.length - a.length || a.localeCompare(b));
  const body = aliases.map(glEscapeRe).join('|');
  const re = body
    ? new RegExp('(^|[^A-Za-z0-9_])((?:' + body + ')s?)(?![A-Za-z0-9_])', 'gi')
    : null;
  return { map, byTerm, aliases, re };
}

function glGetIndex() {
  if (!glIndex) glIndex = glBuildIndex(GLOSSARY);
  return glIndex;
}

function glLookupAlias(idx, hit) {
  const k = glKey(hit);
  return idx.map.get(k) || (k.endsWith('s') ? idx.map.get(k.slice(0, -1)) : null) || null;
}

/* ---------- linker ---------- */

function glLinkText(text, idx, counts) {
  if (!idx.re || !text) return text;
  idx.re.lastIndex = 0;
  return text.replace(idx.re, (full, pre, hit) => {
    const rec = glLookupAlias(idx, hit);
    if (!rec) return full;
    const k = glKey(rec.term);
    const c = counts.get(k) || 0;
    if (c >= GL_MAX_PER_TERM) return full;
    counts.set(k, c + 1);
    return pre + '<span class="term" data-term="' + glEscapeAttr(rec.term) + '">' + hit + '</span>';
  });
}

/**
 * Wrap glossary terms in clickable spans. Safe to call on already-linked html.
 * @param {string} html trusted app-authored markup
 * @param {object} [index] test hook: a prebuilt index (see glBuildIndex)
 */
export function linkTerms(html, index) {
  if (typeof html !== 'string' || html === '') return typeof html === 'string' ? html : '';
  const idx = index && index.re !== undefined ? index : (Array.isArray(index) ? glBuildIndex(index) : glGetIndex());
  if (!idx.re) return html;

  // Count links that already exist so a second pass cannot add more of the same term.
  const counts = new Map();
  const seed = /data-term="([^"]*)"/g;
  let s;
  while ((s = seed.exec(html))) {
    const k = glKey(glUnescapeAttr(s[1]));
    counts.set(k, (counts.get(k) || 0) + 1);
  }

  const tagRe = /<[^>]*>/g;
  let out = '', pos = 0, skipDepth = 0, skipTag = '', m;
  while ((m = tagRe.exec(html))) {
    const chunk = html.slice(pos, m.index);
    out += skipDepth > 0 ? chunk : glLinkText(chunk, idx, counts);
    out += m[0];
    pos = m.index + m[0].length;

    const tag = m[0];
    const named = tag.match(/^<(\/?)([a-zA-Z][a-zA-Z0-9-]*)/);
    if (!named) continue;                                  // comment / doctype / stray
    const closing = named[1] === '/';
    const name = named[2].toLowerCase();
    const selfClosing = /\/>$/.test(tag) || GL_VOID_TAGS[name];
    if (skipDepth > 0) {
      if (name === skipTag && !selfClosing) skipDepth += closing ? -1 : 1;
      if (skipDepth <= 0) { skipDepth = 0; skipTag = ''; }
    } else if (!closing && !selfClosing) {
      const isTerm = /\sclass\s*=\s*("[^"]*\bterm\b[^"]*"|'[^']*\bterm\b[^']*')/.test(tag);
      if (isTerm || /\sdata-nolink\b/.test(tag) || GL_SKIP_TAGS[name]) { skipDepth = 1; skipTag = name; }
    }
  }
  const tail = html.slice(pos);
  out += skipDepth > 0 ? tail : glLinkText(tail, idx, counts);
  return out;
}

/** Definition for a term (case-insensitive); null when unknown. Used by the popover and the drawer tab. */
export function glossaryLookup(term) {
  const idx = glGetIndex();
  return idx.byTerm.get(glKey(term)) || glLookupAlias(idx, term) || null;
}

/* ---------- popover ---------- */

function glHide() {
  const pop = document.getElementById('glossary-popover');
  if (pop) pop.hidden = true;
}

function glShow(el) {
  const pop = document.getElementById('glossary-popover');
  if (!pop) return;
  const term = el.getAttribute('data-term') || el.textContent || '';
  const rec = glossaryLookup(term);
  document.getElementById('gp-term').textContent = rec ? rec.term : term;
  document.getElementById('gp-def').textContent = rec ? rec.definition : 'No definition recorded for this term yet.';
  pop.hidden = false;
  pop.style.left = '0px'; pop.style.top = '0px';

  const r = el.getBoundingClientRect();
  const w = pop.offsetWidth || 300, h = pop.offsetHeight || 120, pad = 12;
  let left = r.left, top = r.bottom + 8;
  if (left + w > window.innerWidth - pad) left = window.innerWidth - w - pad;   // flip/clamp right edge
  if (left < pad) left = pad;
  if (top + h > window.innerHeight - pad) top = Math.max(pad, r.top - h - 8);   // flip above
  pop.style.left = Math.round(left) + 'px';
  pop.style.top = Math.round(top) + 'px';
}

export function initGlossary(app) {
  if (glInited) return;
  glInited = true;
  glGetIndex();

  document.addEventListener('click', (e) => {
    const pop = document.getElementById('glossary-popover');
    const target = e.target;
    const more = target && target.closest ? target.closest('#gp-more') : null;
    if (more) { glHide(); if (typeof openDrawer === 'function') openDrawer('glossary'); return; }
    const term = target && target.closest ? target.closest('.term') : null;
    if (term) { e.preventDefault(); glShow(term); return; }
    if (pop && !pop.hidden && !(target && target.closest && target.closest('#glossary-popover'))) glHide();
  });
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape') glHide(); });
  window.addEventListener('resize', glHide);
}
