// lib/noise.js — seeded 3D simplex noise + fractal Brownian motion.
// PURE: no THREE, no DOM, no top-level side effects (only literal declarations).
// Inlined on purpose: one less CDN dependency (see research.json → tech.single_file_constraints).

// 12 edge-midpoint gradients of a cube — the classic Gustavson simplex gradient set.
const NS_GRAD3 = [
  [1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0],
  [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1],
  [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1],
];

const NS_F3 = 1 / 3;
const NS_G3 = 1 / 6;

/** Small, fast, fully deterministic 32-bit PRNG (Mulberry32). Same seed → same stream. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Build a seeded 3D simplex noise sampler.
 * @param {number} seed
 * @returns {(x:number,y:number,z:number)=>number} value in [-1, 1]
 */
export function createNoise3D(seed = 1337) {
  const rnd = mulberry32(seed);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) { // Fisher-Yates with the seeded PRNG
    const j = (rnd() * (i + 1)) | 0;
    const t = p[i]; p[i] = p[j]; p[j] = t;
  }
  const perm = new Uint8Array(512);
  const permMod12 = new Uint8Array(512);
  for (let i = 0; i < 512; i++) { perm[i] = p[i & 255]; permMod12[i] = perm[i] % 12; }

  return function noise3(xin, yin, zin) {
    // Skew the input space to determine which simplex cell we are in.
    const s = (xin + yin + zin) * NS_F3;
    const i = Math.floor(xin + s), j = Math.floor(yin + s), k = Math.floor(zin + s);
    const t = (i + j + k) * NS_G3;
    const x0 = xin - (i - t), y0 = yin - (j - t), z0 = zin - (k - t);

    // Which of the six tetrahedra of the unit cube are we in?
    let i1, j1, k1, i2, j2, k2;
    if (x0 >= y0) {
      if (y0 >= z0)      { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
      else if (x0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1; }
      else               { i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1; }
    } else {
      if (y0 < z0)       { i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1; }
      else if (x0 < z0)  { i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1; }
      else               { i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
    }

    const x1 = x0 - i1 + NS_G3, y1 = y0 - j1 + NS_G3, z1 = z0 - k1 + NS_G3;
    const x2 = x0 - i2 + 2 * NS_G3, y2 = y0 - j2 + 2 * NS_G3, z2 = z0 - k2 + 2 * NS_G3;
    const x3 = x0 - 1 + 3 * NS_G3, y3 = y0 - 1 + 3 * NS_G3, z3 = z0 - 1 + 3 * NS_G3;

    const ii = i & 255, jj = j & 255, kk = k & 255;
    let n = 0;

    let t0 = 0.6 - x0 * x0 - y0 * y0 - z0 * z0;
    if (t0 > 0) {
      const g = NS_GRAD3[permMod12[ii + perm[jj + perm[kk]]]];
      t0 *= t0; n += t0 * t0 * (g[0] * x0 + g[1] * y0 + g[2] * z0);
    }
    let t1 = 0.6 - x1 * x1 - y1 * y1 - z1 * z1;
    if (t1 > 0) {
      const g = NS_GRAD3[permMod12[ii + i1 + perm[jj + j1 + perm[kk + k1]]]];
      t1 *= t1; n += t1 * t1 * (g[0] * x1 + g[1] * y1 + g[2] * z1);
    }
    let t2 = 0.6 - x2 * x2 - y2 * y2 - z2 * z2;
    if (t2 > 0) {
      const g = NS_GRAD3[permMod12[ii + i2 + perm[jj + j2 + perm[kk + k2]]]];
      t2 *= t2; n += t2 * t2 * (g[0] * x2 + g[1] * y2 + g[2] * z2);
    }
    let t3 = 0.6 - x3 * x3 - y3 * y3 - z3 * z3;
    if (t3 > 0) {
      const g = NS_GRAD3[permMod12[ii + 1 + perm[jj + 1 + perm[kk + 1]]]];
      t3 *= t3; n += t3 * t3 * (g[0] * x3 + g[1] * y3 + g[2] * z3);
    }
    n *= 32;
    return n < -1 ? -1 : (n > 1 ? 1 : n); // contract: always inside [-1, 1]
  };
}

// Lazily created default sampler so fbm3() can keep the documented 6-arg signature
// without doing any work at module load time. (Declaration only — not a side effect.)
let nsDefaultNoise = null;

/**
 * Fractal Brownian motion: sum of `octaves` simplex octaves, each `lacunarity`x the
 * frequency and `gain`x the amplitude, normalised so the result stays in [-1, 1].
 * Pass your own sampler as `noise3` to use a different seed.
 */
export function fbm3(x, y, z, octaves = 4, lacunarity = 2, gain = 0.5, noise3) {
  const n = noise3 || (nsDefaultNoise || (nsDefaultNoise = createNoise3D(1337)));
  let freq = 1, amp = 1, sum = 0, norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += n(x * freq, y * freq, z * freq) * amp;
    norm += amp;
    freq *= lacunarity;
    amp *= gain;
  }
  const v = norm > 0 ? sum / norm : 0;
  return v < -1 ? -1 : (v > 1 ? 1 : v);
}
