// Small deterministic noise helpers shared by everything that grows or paints the world.
// Nothing here is random at run time: the same river is built on every visit.

/** A seeded generator: const rnd = rng(7); rnd() -> 0..1 */
export function rng(seed = 1) {
  let a = (seed * 2654435761) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const fract = (x) => x - Math.floor(x);
export function hash2(x, y) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smooth value noise, 0..1. */
export function noise2(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  let fx = x - xi, fy = y - yi;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

/** Fractal noise, 0..1, `oct` octaves. */
export function fbm2(x, y, oct = 4, gain = 0.5, lac = 2.03) {
  let amp = 0.5, sum = 0, norm = 0;
  for (let i = 0; i < oct; i++) { sum += amp * noise2(x, y); norm += amp; amp *= gain; x = x * lac + 17.13; y = y * lac + 9.71; }
  return sum / norm;
}

export const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, x) => { if (a === b) return x >= b ? 1 : 0; const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
export { fract };

/** Piecewise value along the river: keys = [[s, v], ...] sorted by s; smooth between them. */
export function track(keys, s) {
  if (s <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    if (s <= keys[i][0]) { const [s0, v0] = keys[i - 1], [s1, v1] = keys[i]; return v0 + (v1 - v0) * smooth(s0, s1, s); }
  }
  return keys[keys.length - 1][1];
}
