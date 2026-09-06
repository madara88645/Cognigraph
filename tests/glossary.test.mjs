import test from 'node:test';
import assert from 'node:assert/strict';
import { linkTerms, glossaryLookup } from '../src/ui/glossary.js';
import { GLOSSARY } from '../src/data/glossary.js';

const TERMS = (html) => [...html.matchAll(/data-term="([^"]*)"/g)].map((m) => m[1]);

test('wraps a known term in a .term span', () => {
  const out = linkTerms('<p>An action potential travels down the axon.</p>');
  assert.match(out, /<span class="term" data-term="Action potential">action potential<\/span>/);
});

test('is case-insensitive and keeps the original casing of the match', () => {
  const out = linkTerms('<p>Myelin and myelin.</p>');
  assert.ok(out.includes('>Myelin</span>'));
  assert.ok(out.includes('>myelin</span>'));
});

test('respects word boundaries', () => {
  // "myelination" must not be linked as "myelin"
  const out = linkTerms('<p>myelination happens early</p>');
  assert.equal(TERMS(out).length, 0);
});

test('longest match wins over a shorter overlapping term', () => {
  const idx = [
    { term: 'Working memory', plain_definition: 'the scratchpad' },
    { term: 'Memory', plain_definition: 'storage' },
  ];
  const out = linkTerms('<p>working memory is not just memory</p>', idx);
  assert.deepEqual(TERMS(out), ['Working memory', 'Memory']);
  assert.ok(out.includes('>working memory</span>'));
});

test('overlap: ERP inside "N170 ERP" links both terms, not a nested one', () => {
  const out = linkTerms('<p>the N170 ERP peaks early</p>');
  assert.deepEqual(TERMS(out), ['N170', 'ERP (event-related potential)']);
  assert.equal((out.match(/<span/g) || []).length, 2);
  assert.ok(!/<span[^>]*>[^<]*<span/.test(out), 'no nested term spans');
});

test('never links inside a tag or an attribute value', () => {
  const html = '<img alt="a neuron and a synapse" title="myelin" src="x.png"><p>ok</p>';
  assert.equal(linkTerms(html), html);
});

test('never links inside an existing .term span (including nested spans)', () => {
  const html = '<span class="term" data-term="Neuron"><span>neuron</span> and synapse</span> then myelin';
  const out = linkTerms(html);
  assert.deepEqual(TERMS(out), ['Neuron', 'Myelin']);
});

test('skips content marked data-nolink and <script>/<style>', () => {
  const out = linkTerms('<div data-nolink><b>neuron</b> synapse</div><script>var neuron = 1;</script><p>myelin</p>');
  assert.deepEqual(TERMS(out), ['Myelin']);
});

test('is idempotent', () => {
  const once = linkTerms('<p>A neuron has a synapse; the neuron fires. Neurons and neurons and neurons.</p>');
  assert.equal(linkTerms(once), once);
  assert.equal(linkTerms(linkTerms(once)), once);
});

test('links at most the first 2 occurrences of a term per call', () => {
  const out = linkTerms('<p>myelin myelin myelin myelin</p>');
  assert.equal((out.match(/data-term="Myelin"/g) || []).length, 2);
});

test('plural forms link back to the singular term', () => {
  const out = linkTerms('<p>Synapses everywhere</p>');
  assert.deepEqual(TERMS(out), ['Synapse']);
  assert.ok(out.includes('>Synapses</span>'));
});

test('entity safety: entities and quotes survive untouched', () => {
  const html = '<p>Glutamate &amp; GABA &mdash; the &quot;go&quot; and &quot;stop&quot; signals &lt;here&gt;</p>';
  const out = linkTerms(html);
  assert.ok(out.includes('&amp;') && out.includes('&mdash;') && out.includes('&quot;') && out.includes('&lt;here&gt;'));
  assert.ok(!out.includes('&amp;amp;'), 'entities must not be double-escaped');
  // the entity name itself must never be linked
  assert.ok(!/&<span/.test(out) && !/<span[^>]*>amp</.test(out));
});

test('handles empty / non-string input without throwing', () => {
  assert.equal(linkTerms(''), '');
  assert.equal(linkTerms(null), '');
  assert.equal(linkTerms(undefined), '');
});

test('parenthetical aliases resolve to the canonical term', () => {
  assert.deepEqual(TERMS(linkTerms('<p>event-related potential</p>')), ['ERP (event-related potential)']);
  assert.deepEqual(TERMS(linkTerms('<p>norepinephrine</p>')), ['Noradrenaline (norepinephrine)']);
});

test('glossaryLookup finds terms and aliases, case-insensitively', () => {
  assert.equal(glossaryLookup('n170').term, 'N170');
  assert.equal(glossaryLookup('LTP').term, 'Long-term potentiation (LTP)');
  assert.equal(glossaryLookup('not a term at all'), null);
});

test('every glossary entry has a term and a plain definition', () => {
  for (const g of GLOSSARY) {
    assert.ok(g.term && g.term.trim().length, 'missing term');
    assert.ok(g.plain_definition && g.plain_definition.length > 20, `thin definition for ${g.term}`);
  }
  const seen = new Set();
  for (const g of GLOSSARY) {
    const k = g.term.toLowerCase();
    assert.ok(!seen.has(k), `duplicate glossary term ${g.term}`);
    seen.add(k);
  }
});

test('the N170 entry carries the same "leading, not sole, contributor" hedge as the rest of the app', () => {
  const n170 = GLOSSARY.find((g) => g.term === 'N170');
  assert.ok(n170, 'N170 must be in the glossary');
  assert.match(n170.plain_definition, /fusiform gyrus\/FFA/, 'name the region the way the atlas does');
  assert.match(n170.plain_definition, /not sole|not the sole/i, 'the FFA must not be presented as the only generator');
  assert.match(n170.plain_definition, /occipital face area/i, 'the competing generators must be named');
});
