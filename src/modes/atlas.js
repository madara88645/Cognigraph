// modes/atlas.js — browse the 28 regions, read what each one does, and lesion them.
// No top-level side effects; all state lives on `app` or in module-level `let` slots that
// are only written from enter()/exit().

import { explain, setSidePanel, hoverLabel, registerDrawerTab, toast } from '../ui/panels.js';
import { REGIONS } from '../data/regions.js';
import { regionColor } from '../brain/geometry.js';

/* ------------------------------------------------------------------ grouping */
// REGIONS[].group is free text ("frontal lobe (language-dominant hemisphere)"), so the
// panel headings are derived from it by an ordered set of substring rules. Order matters:
// "basal ganglia (ventral striatum) / limbic" must land under Basal ganglia, and
// "frontal/temporal (folded cortex)" (the insula) under Frontal.
const ATLAS_GROUP_RULES = [
  ['Basal ganglia', ['basal ganglia']],
  ['White matter', ['white matter', 'commissure']],
  ['Brainstem & cerebellum', ['brainstem', 'cerebellum']],
  ['Subcortical & limbic', ['diencephalon', 'limbic/subcortical']],
  ['Occipital lobe', ['occipit']],
  ['Frontal lobe', ['frontal']],
  ['Parietal lobe', ['parietal']],
  ['Temporal lobe', ['temporal']],
];
const ATLAS_GROUP_ORDER = [
  'Frontal lobe', 'Parietal lobe', 'Temporal lobe', 'Occipital lobe',
  'Subcortical & limbic', 'Basal ganglia', 'Brainstem & cerebellum', 'White matter',
];

export function atlasGroupOf(region) {
  const g = String(region.group || '').toLowerCase();
  for (const [label, needles] of ATLAS_GROUP_RULES) {
    for (const n of needles) if (g.includes(n)) return label;
  }
  return 'Other';
}

/* ------------------------------------------------------ text helpers / matching */

function atlasEsc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function atlasCss(hex) { return '#' + (hex >>> 0).toString(16).padStart(6, '0'); }
function atlasNorm(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }

/** Every string that should resolve to this region ("V4", "ffa", "posterior parietal cortex"). */
function atlasKeys(r) {
  const keys = new Set();
  keys.add(atlasNorm(r.id));
  keys.add(atlasNorm(r.name));
  keys.add(atlasNorm(r.name.replace(/\s*\([^)]*\)\s*/g, ' ')));
  const parens = r.name.match(/\(([^)]*)\)/g) || [];
  for (const p of parens) for (const part of p.slice(1, -1).split(/[\/,+]/)) {
    const k = atlasNorm(part); if (k) keys.add(k);
  }
  keys.delete('');
  return [...keys];
}

/** Longest name that fits the list row before it gets ellipsised. */
const ATLAS_NAME_MAX = 34;

/**
 * A list label for a name too long to survive the row, tried in this order:
 *   1. a trailing parenthesised abbreviation that is itself two-part
 *      ("Ventromedial Prefrontal Cortex / Orbitofrontal Cortex (vmPFC/OFC)" -> "vmPFC / OFC"),
 *      because that is the compact way to say a two-part name;
 *   2. the name with its trailing parenthetical stripped, if that now fits
 *      ("Dorsolateral Prefrontal Cortex (dlPFC)" -> "Dorsolateral Prefrontal Cortex") —
 *      a single abbreviation on its own says less than the words it stands for;
 *   3. whatever comes before " / ".
 * The FULL name always stays reachable: it is the row's title attribute, the row's
 * screen-reader text, and the heading of the Explain card.
 */
export function atlasShortName(name) {
  const s = String(name == null ? '' : name).trim();
  if (s.length <= ATLAS_NAME_MAX) return s;
  const paren = s.match(/\(([^()]+)\)\s*$/);
  if (paren && /[\/,+]/.test(paren[1])) {
    const abbr = paren[1].trim().replace(/\s*\/\s*/g, ' / ');
    if (abbr && abbr.length < s.length) return abbr;
  }
  if (paren) {
    const stripped = s.slice(0, s.length - paren[0].length).trim();
    if (stripped && stripped.length <= ATLAS_NAME_MAX) return stripped;
  }
  const head = s.split(' / ')[0].trim();
  if (head && head.length < s.length) return head;
  return s;
}

/**
 * Resolve a free-text connection label ("Thalamus (LGN)", "FFA/fusiform gyrus") to a
 * region id, or null when nothing matches well enough.
 */
export function atlasMatchRegion(text) {
  const base = atlasNorm(String(text).replace(/\s*\([^)]*\)\s*/g, ' '));
  if (!base) return null;
  let exact = null, contained = null;
  for (const r of REGIONS) {
    for (const k of atlasKeys(r)) {
      if (k === base) { exact = r.id; break; }
      if (!contained) {
        const asWord = new RegExp('(^| )' + k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '( |$)');
        if (k.length >= 2 && asWord.test(base)) contained = r.id;
        else if (base.length >= 4 && k.includes(base)) contained = r.id;
      }
    }
    if (exact) break;
  }
  return exact || contained;
}

/* -------------------------------------------------------------- module state */

let atlasBody = null;
let atlasListEl = null;
let atlasSearchEl = null;
let atlasLesionBtn = null;
let atlasLesionBar = null;
let atlasVisible = [];        // ordered region ids currently shown in the list
let atlasCursor = -1;         // keyboard cursor into atlasVisible
let atlasLesionMode = false;
let atlasChipHandler = null;
let atlasHovered = null;      // region id currently under the cursor (3D hover highlight)

/* ------------------------------------------------------------------ rendering */

function atlasRenderList(app, query) {
  const q = atlasNorm(query || '');
  const matches = REGIONS.filter((r) => {
    if (!q) return true;
    const hay = atlasNorm([r.name, r.id, r.group, r.one_liner, (r.functions || []).join(' ')].join(' '));
    return hay.includes(q);
  });
  const byGroup = new Map();
  for (const r of matches) {
    const g = atlasGroupOf(r);
    if (!byGroup.has(g)) byGroup.set(g, []);
    byGroup.get(g).push(r);
  }
  const order = ATLAS_GROUP_ORDER.filter((g) => byGroup.has(g))
    .concat([...byGroup.keys()].filter((g) => !ATLAS_GROUP_ORDER.includes(g)));

  atlasVisible = [];
  let html = '';
  for (const g of order) {
    html += `<h3>${atlasEsc(g)}</h3><div class="list">`;
    for (const r of byGroup.get(g)) {
      atlasVisible.push(r.id);
      const les = app.lesions.has(r.id);
      const short = atlasShortName(r.name);
      // title = the FULL name. It used to be the one-liner, which meant a truncated row
      // like "Ventromedial Prefrontal Cortex / Orbitofro…" had no way back to its own name.
      html += `<div class="list-item${app.selection === r.id ? ' active' : ''}${les ? ' atlas-lesioned' : ''}"`
        + ` data-region="${atlasEsc(r.id)}" style="--dot:${atlasCss(regionColor(r.id))}" title="${atlasEsc(r.name)}">`
        + `<span class="dot"></span><span class="atlas-name">${atlasEsc(short)}</span>`
        + (short !== r.name ? `<span class="atlas-full">${atlasEsc(r.name)}</span>` : '')
        + (les ? '<span class="atlas-flag">lesioned</span>' : '') + '</div>';
    }
    html += '</div>';
  }
  if (!matches.length) html = '<p class="muted">No region matches that.</p>';
  atlasListEl.innerHTML = html;
  if (atlasCursor >= atlasVisible.length) atlasCursor = atlasVisible.length - 1;
  atlasPaintCursor();
}

function atlasPaintCursor() {
  if (!atlasListEl) return;
  atlasListEl.querySelectorAll('.list-item').forEach((el) => el.classList.remove('atlas-cursor'));
  const id = atlasVisible[atlasCursor];
  if (!id) return;
  const el = atlasListEl.querySelector(`.list-item[data-region="${id}"]`);
  if (el) { el.classList.add('atlas-cursor'); el.scrollIntoView({ block: 'nearest' }); }
}

function atlasSyncActive(app) {
  if (!atlasListEl) return;
  atlasListEl.querySelectorAll('.list-item').forEach((el) => {
    const id = el.dataset.region;
    el.classList.toggle('active', id === app.selection);
    const les = app.lesions.has(id);
    el.classList.toggle('atlas-lesioned', les);
    let flag = el.querySelector('.atlas-flag');
    if (les && !flag) { flag = document.createElement('span'); flag.className = 'atlas-flag'; flag.textContent = 'lesioned'; el.appendChild(flag); }
    if (!les && flag) flag.remove();
  });
}

/* ------------------------------------------------------------- explain cards */

function atlasConnectionChips(r) {
  const list = r.key_connections || [];
  if (!list.length) return '';
  const chips = list.map((c) => {
    const id = atlasMatchRegion(c);
    if (id && id !== r.id) return `<button class="atlas-chip" data-region="${atlasEsc(id)}">${atlasEsc(c)}</button>`;
    return `<span class="atlas-chip is-plain">${atlasEsc(c)}</span>`;
  }).join('');
  return `<h4 class="atlas-h">Key connections</h4><div class="atlas-chips">${chips}</div>`;
}

function atlasRegionCard(r, app) {
  const fns = (r.functions || []).map((f) => `<li>${atlasEsc(f)}</li>`).join('');
  const html = [
    `<p>${atlasEsc(r.one_liner || '')}</p>`,
    fns ? `<h4 class="atlas-h">What it does</h4><ul>${fns}</ul>` : '',
    `<dl class="kv"><dt>Location</dt><dd>${atlasEsc(r.approx_location || '')}</dd>`
      + `<dt>System</dt><dd>${atlasEsc(r.group || '')}</dd></dl>`,
    atlasConnectionChips(r),
    r.lesion_effects ? `<div class="note"><strong>If it is damaged: </strong>${atlasEsc(r.lesion_effects)}</div>` : '',
    r.famous_case_or_evidence ? `<p class="muted">${atlasEsc(r.famous_case_or_evidence)}</p>` : '',
    r.id === 'insula'
      ? '<p class="muted">Drawing note: the insula is shown here as a small exposed patch. In a real brain it is completely buried inside the lateral sulcus, hidden by the frontal, parietal and temporal opercula.</p>'
      : '',
  ].join('');
  explain({
    title: r.name,
    html,
    badge: app.lesions.has(r.id) ? 'lesioned' : null,
    badgeClass: app.lesions.has(r.id) ? 'low' : '',
  });
}

function atlasLesionCard(r, app) {
  explain({
    title: 'Lesion: ' + r.name,
    html: [
      `<p><strong>${atlasEsc(r.lesion_effects || 'No lesion description available.')}</strong></p>`,
      `<p class="muted">${atlasEsc(r.one_liner || '')}</p>`,
      r.famous_case_or_evidence ? `<p class="muted">${atlasEsc(r.famous_case_or_evidence)}</p>` : '',
      '<div class="note">A real lesion is never this clean. Damage crosses region boundaries, cuts passing fibres, and the rest of the network reorganises over months. Treat this as "what tends to break", not "what will happen".</div>',
      `<p class="muted">${app.lesions.size} region${app.lesions.size === 1 ? '' : 's'} currently lesioned. Click again to repair.</p>`,
    ].join(''),
    badge: 'lesioned',
    badgeClass: 'low',
  });
}

function atlasIntroCard(app) {
  explain({
    title: 'Atlas',
    html: [
      '<p>Twenty-eight regions: thirteen cortical patches painted onto the hemispheres, fifteen structures modelled as their own meshes underneath.</p>',
      '<p>Click a region in the brain or in the list. Drag the <strong>Cortex</strong> slider down to see the deep structures through the shell.</p>',
      '<div class="note">Turn on <strong>Lesion mode</strong> (or press <code>L</code>) to knock regions out one at a time and read what tends to break.</div>',
      '<p class="muted">Positions are proportionally plausible, not MNI coordinates. Colours are chosen so the structures stay distinguishable, not because brains look like that.</p>',
    ].join(''),
  });
}

/* ------------------------------------------------------------------ selection */

function atlasSelect(id, app, { fly = true } = {}) {
  const r = REGIONS.find((x) => x.id === id);
  if (!r) return;
  app.selection = id;
  app.scene.clearHighlights();   // also wipes the hover glow, so forget it
  atlasHovered = null;
  app.scene.highlight(id, 1, AtlasMode.accent);
  if (fly) app.scene.flyTo(id, { distance: 3.5, duration: 0.85 });
  atlasRegionCard(r, app);
  atlasSyncActive(app);
  const i = atlasVisible.indexOf(id);
  if (i >= 0) { atlasCursor = i; atlasPaintCursor(); }
}

function atlasToggleLesion(id, app) {
  const r = REGIONS.find((x) => x.id === id);
  if (!r) return;
  if (app.lesions.has(id)) {
    app.lesions.delete(id);
    app.scene.setLesion(id, false);
    toast(r.name + ' repaired');
  } else {
    app.lesions.add(id);
    app.scene.setLesion(id, true);
  }
  app.selection = id;
  if (app.lesions.has(id)) atlasLesionCard(r, app); else atlasRegionCard(r, app);
  atlasSyncActive(app);
  atlasUpdateLesionChrome(app);
}

function atlasUpdateLesionChrome(app) {
  if (atlasLesionBtn) {
    atlasLesionBtn.textContent = atlasLesionMode ? 'On' : 'Off';
    atlasLesionBtn.classList.toggle('active', atlasLesionMode);
  }
  if (atlasLesionBar) {
    atlasLesionBar.hidden = app.lesions.size === 0;
    const c = atlasLesionBar.querySelector('.atlas-lesion-count');
    if (c) c.textContent = app.lesions.size + ' lesioned';
  }
  if (atlasBody) atlasBody.classList.toggle('atlas-lesion-on', atlasLesionMode);
}

function atlasSetLesionMode(on, app) {
  atlasLesionMode = !!on;
  atlasUpdateLesionChrome(app);
  toast(atlasLesionMode ? 'Lesion mode on — click a region to knock it out' : 'Lesion mode off');
}

/* ----------------------------------------------------------------- the mode */

export const AtlasMode = {
  id: 'atlas',
  label: 'Atlas',
  accent: 0xa98ef2,

  enter(app) {
    atlasRegisterRenderingTab();
    atlasBody = setSidePanel([
      '<div class="panel-title">Atlas</div>',
      `<div class="panel-sub">${REGIONS.length} regions · click the brain or the list</div>`,
      '<input class="search atlas-search" type="search" placeholder="Search regions and functions…" autocomplete="off" spellcheck="false">',
      '<div class="toggle-row atlas-toggle">',
      '  <span><span class="atlas-toggle-label">Lesion mode</span><span class="muted atlas-toggle-sub">Click regions to knock them out (L)</span></span>',
      '  <button class="text-btn atlas-lesion-btn" type="button">Off</button>',
      '</div>',
      '<div class="atlas-lesion-bar" hidden><span class="atlas-lesion-count">0 lesioned</span>',
      '  <button class="text-btn atlas-lesion-reset" type="button">Reset lesions</button></div>',
      '<div class="atlas-list"></div>',
    ].join(''));

    atlasListEl = atlasBody.querySelector('.atlas-list');
    atlasSearchEl = atlasBody.querySelector('.atlas-search');
    atlasLesionBtn = atlasBody.querySelector('.atlas-lesion-btn');
    atlasLesionBar = atlasBody.querySelector('.atlas-lesion-bar');

    atlasSearchEl.addEventListener('input', () => { atlasCursor = -1; atlasRenderList(app, atlasSearchEl.value); });
    atlasLesionBtn.addEventListener('click', () => atlasSetLesionMode(!atlasLesionMode, app));
    atlasBody.querySelector('.atlas-lesion-reset').addEventListener('click', () => {
      app.lesions.clear();
      app.scene.clearLesions();
      atlasSyncActive(app);
      atlasUpdateLesionChrome(app);
      toast('All lesions repaired');
    });
    atlasListEl.addEventListener('click', (e) => {
      const el = e.target.closest('.list-item');
      if (!el) return;
      const id = el.dataset.region;
      if (atlasLesionMode) atlasToggleLesion(id, app); else atlasSelect(id, app);
    });

    // connection chips inside the Explain card select the connected region
    atlasChipHandler = (e) => {
      const b = e.target.closest('.atlas-chip[data-region]');
      if (!b) return;
      e.preventDefault();
      atlasSelect(b.dataset.region, app);
    };
    document.getElementById('explain-body').addEventListener('click', atlasChipHandler);

    // re-apply whatever was lesioned last time we were in this mode
    for (const id of app.lesions) app.scene.setLesion(id, true);
    atlasRenderList(app, '');
    atlasUpdateLesionChrome(app);
    if (app.selection && REGIONS.some((r) => r.id === app.selection)) {
      atlasSelect(app.selection, app, { fly: false });
    } else {
      atlasIntroCard(app);
    }
  },

  exit(app) {
    hoverLabel(null);
    app.scene.clearHighlights();
    app.scene.clearLesions();          // visual only — app.lesions keeps the state
    if (atlasChipHandler) {
      const el = document.getElementById('explain-body');
      if (el) el.removeEventListener('click', atlasChipHandler);
      atlasChipHandler = null;
    }
    atlasBody = atlasListEl = atlasSearchEl = atlasLesionBtn = atlasLesionBar = null;
    atlasVisible = []; atlasCursor = -1; atlasHovered = null;
  },

  update() { /* the scene does the smoothing */ },

  onPick(id, app) {
    if (!id) return;
    if (atlasLesionMode) atlasToggleLesion(id, app); else atlasSelect(id, app);
  },

  onHover(id, app, pos) {
    const r = (id && REGIONS.find((x) => x.id === id)) || null;
    const next = r ? r.id : null;
    if (next !== atlasHovered) {
      // Drop the old hover glow, then raise the new one — but never touch the SELECTED
      // region: it owns a full-strength highlight and hovering it must not dim it.
      if (atlasHovered && atlasHovered !== app.selection) app.scene.highlight(atlasHovered, 0);
      if (next && next !== app.selection) app.scene.highlight(next, 0.35, AtlasMode.accent);
      atlasHovered = next;
    }
    // A lesioned region still answers with its name — that is how you find out what you broke.
    hoverLabel(r ? (app.lesions.has(r.id) ? r.name + ' — lesioned' : r.name) : null, pos);
  },

  onKey(e, app) {
    if (e.key === 'l' || e.key === 'L') { atlasSetLesionMode(!atlasLesionMode, app); return true; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!atlasVisible.length) return false;
      const step = e.key === 'ArrowDown' ? 1 : -1;
      if (atlasCursor < 0) atlasCursor = step > 0 ? 0 : atlasVisible.length - 1;
      else atlasCursor = (atlasCursor + step + atlasVisible.length) % atlasVisible.length;
      atlasPaintCursor();
      return true;
    }
    if (e.key === 'Enter') {
      const id = atlasVisible[atlasCursor];
      if (!id) return false;
      if (atlasLesionMode) atlasToggleLesion(id, app); else atlasSelect(id, app);
      return true;
    }
    return false;
  },
};

/* ------------------------------------------------ "How this works" drawer tab */

export function atlasRegisterRenderingTab() {
  registerDrawerTab('rendering', 'Rendering', [
    '<p>There is no scanned brain in this file. Every surface you see is generated by code when the page loads, from spheres, tubes and a lathe — about 108,000 triangles in total.</p>',

    '<h3>The folded cortex</h3>',
    '<p>Each hemisphere starts as a subdivided icosahedron — a sphere of about 44,000 triangles — squashed into a brain-shaped ellipsoid: longer front-to-back than it is wide, narrower at both poles, flat on the inner face so the two halves can sit against each other, lifted under the frontal lobe and pulled down and forward where the temporal lobe hangs.</p>',
    '<p>The folds come from <strong>noise</strong>: a smooth, seeded random field sampled in 3D. Two things are done with it that a plain bump map does not do. First, the point being sampled is itself displaced by a second, even lower-frequency field — <em>domain warping</em> — which is what makes the folds meander instead of running in parallel stripes. Second, the surface is not pushed out by the field; grooves are carved along the places where the field is <em>zero</em>. The zero set of a smooth random field is a network of long wandering curves, which is what a sulcus looks like. The field is stretched front-to-back, so the grooves come out running the way the real superior, middle and inferior gyri run.</p>',
    '<p>The result is deliberately shallow and broad: two octaves, no fine detail, grooves about 6% of the brain\'s length wide and only <strong>3% of its radius deep</strong>. Two named grooves are not random at all — the <strong>lateral (Sylvian) fissure</strong> and the <strong>central sulcus</strong> are carved along hand-placed lines, a little deeper, because those two are what make a side view read as a brain rather than a walnut.</p>',
    '<p>Then the whole mesh is <strong>relaxed</strong>: two passes of Laplacian smoothing, which just means every vertex is moved a little towards the average of its neighbours. That erases anything varying at the scale of a single triangle — including the icosahedron\'s own structure — while a fold fifteen triangles wide loses under a tenth of its depth.</p>',
    '<p class="muted">Getting this wrong is easy and looks bad in one specific way. Any displacement whose wavelength is close to the distance between two vertices reads as crumpled foil rather than as folds, and there are more ways in than you would think: a second high-frequency octave, per-vertex jitter, a groove narrower than a few triangles, even a plain <code>Math.abs()</code> in the groove profile — that last one puts a one-vertex-wide crease along the centre line of every sulcus, which the renderer then draws as a zip fastener zig-zagging from triangle to triangle. Every fold here is smooth-bottomed and at least six triangles wide.</p>',

    '<h3>Why the sulci are dark</h3>',
    '<p>A groove 3% of the radius deep is almost invisible through a shell you can see through. A real sulcus does not read dark because of its silhouette — it reads dark because light does not reach the bottom of it. So every vertex also carries a number saying how deep in a groove it sits, and the shader uses it to darken the surface there and to lift the gyral crowns by about as much. That number is relaxed too, three passes rather than two: an unsmoothed vertex attribute keeps its saw-tooth even when the geometry underneath is smooth.</p>',

    '<h3>Cortical regions are painted, not modelled</h3>',
    '<p>The thirteen cortical regions are not separate meshes. Every vertex of the hemisphere is tagged at build time with the region whose centre direction is nearest, within an angular radius — a small "parcellation by angle" table — and the tint fades out across the outer third of each patch, so a region looks like part of the surface rather than a decal stuck on it. Clicking raycasts the hemisphere, takes the triangle it hit, and takes the majority vote of its three vertices. Cortex outside any of the thirteen falls back to a lobe label, which is deliberately <em>not</em> a region, so clicking there selects nothing.</p>',
    '<p>Highlighting is a per-vertex weight fed into the material shader, faded in over a few frames. That is why a selected region glows softly from within instead of getting an outline. Hovering raises the same weight part of the way (0.35), so the thing under your cursor lifts without competing with whatever is selected.</p>',

    '<h3>Everything under the cortex</h3>',
    '<p>The fifteen deep structures are individual meshes, each the simplest primitive that reads as its real shape: stretched spheres for the thalamus and amygdala, curved tubes for the hippocampus, the caudate and the corpus callosum, a lathe-turned profile for the brainstem, a string of small spheres for the raphe nuclei. Paired structures are two meshes sharing one identity. The cerebellum is its own ellipsoid, scored with fine parallel ripples for the folia and bent by a low-frequency warp so they curve.</p>',

    '<h3>Depth: what you are meant to look at first</h3>',
    '<p>The cortex is the primary object, so it gets the light: a cool blue-grey, desaturated so it belongs to this page, semi-matte with a faint clearcoat sheen along the crowns, and a shell opacity of <strong>0.55</strong> — solid enough to hold its own shape, sheer enough to see what is underneath. Grooves are drawn slightly thinner than crowns, so the dark page shows through them and gives back some of the contrast the blend takes away. The lighting is one warm key from the upper left, a cool fill from the right, a soft rim from behind and a dim sky-and-ground term; there are no shadow maps anywhere.</p>',
    '<p>The deep structures are <em>lit</em>, not self-lit: their glow at rest is almost nothing (an emissive intensity of 0.04). Hover and selection ramp that up to about 1.9, which is why a selected structure is unmistakable while the resting brain still looks like a brain.</p>',
    '<p>The shell renders front faces only and does not write depth, so there is exactly one skin between you and the structures. The far hemisphere\'s inner wall — the one surface of it still facing you in a side view — is faded out almost completely; left visible it hangs inside the near hemisphere as a flat sheet and flattens the whole image.</p>',
    '<p>The default camera is a lateral three-quarter of the <strong>left</strong> hemisphere, fifteen degrees above the horizontal, with the frontal pole on your left and the cerebellum low and to the right. Left, because Broca\'s and Wernicke\'s areas only exist on that side. The whole rig is panned a little so the brain sits right of centre and the side panel does not cover it. <strong>Reset view</strong> (or <code>R</code>) returns to exactly this pose.</p>',

    '<h3>Why the colours are wrong on purpose</h3>',
    '<p>A real brain is uniformly pinkish-grey. These colours exist so that twenty-eight structures stay <strong>distinguishable</strong> — through a translucent shell, and as an 8-pixel dot in the list. The palette was generated by spreading hues around the colour wheel and then maximising the smallest distance between any two of them. The deep structures were then desaturated by about a fifth, and the palette re-optimised around that, so they sit inside the brain instead of shouting through it.</p>',

    '<h3>Quality and speed</h3>',
    '<p><strong>High</strong> adds a bloom pass (a glow around bright pixels), renders at full pixel density, and gives the cortex its clearcoat sheen. <strong>Low</strong> drops all three. <strong>Auto</strong> starts High, measures the first sixty frames, and falls back to Low if a frame is taking longer than 20 ms. There is no light transmission through the shell at any setting — it cost a second full scene render every frame and made the cortex look like glass rather than tissue.</p>',

    '<h3>What is deliberately simplified</h3>',
    '<ul>',
    '<li>Positions are <em>proportionally</em> plausible. They are not MNI coordinates and you should not measure anything off them.</li>',
    '<li>A real cortex has far more folding than this, and the folds are not random — the big ones are in the same place in everybody. Here only two of them are.</li>',
    '<li>The <strong>insula</strong> is drawn as a small exposed patch. In reality it is completely buried inside the lateral sulcus and you would have to pull the opercula apart to see it.</li>',
    '<li>Cortical regions are round patches with soft edges. Real ones have ragged, individually variable borders — M1 and S1 are strips along a sulcus, not discs.</li>',
    '<li>Broca\'s and Wernicke\'s areas are drawn on the left hemisphere only. That matches the usual case, not everybody.</li>',
    '<li>Ventricles, cranial nerves, the anterior commissure, white-matter tracts other than the corpus callosum, and the whole cerebellar-peduncle system are not modelled at all.</li>',
    '<li>Both hemispheres use the same folding pattern, mirrored. Real hemispheres are not symmetric.</li>',
    '</ul>',
  ].join(''));
}
