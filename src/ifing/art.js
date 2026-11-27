// Art: every picture in the game is painted here, in code, when the page opens. There are no image files.
// Each painter lays down strokes on a canvas the way a brush would (dark masses first, then the half-tones, then a
// few lights), so that the result has a hand in it and tints well under the reach's light.
import * as THREE from 'three';
import { rng, fbm2, noise2, clamp } from './noise.js';

const TAU = Math.PI * 2;

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
const rgb = (r, g, b, a = 1) => `rgba(${r | 0},${g | 0},${b | 0},${a})`;
const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

/**
 * A canvas as a texture whose transparent parts carry the colour of the paint next to them: a cut-out sampled
 * between a leaf and nothing then takes leaf colour, not a dark fringe. `bleed` is the colour given to empty pixels.
 */
function cutTexture(cv, bleed, opts = {}) {
  const g = cv.getContext('2d'), im = g.getImageData(0, 0, cv.width, cv.height), d = im.data;
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3];
    if (a < 250) { const k = a / 250; d[i] = d[i] * k + bleed[0] * (1 - k); d[i + 1] = d[i + 1] * k + bleed[1] * (1 - k); d[i + 2] = d[i + 2] * k + bleed[2] * (1 - k); }
  }
  const t = new THREE.DataTexture(new Uint8Array(d.buffer), cv.width, cv.height, THREE.RGBAFormat);
  t.colorSpace = THREE.SRGBColorSpace; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  t.anisotropy = 4;
  if (opts.repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; } else if (opts.repeatX) { t.wrapS = THREE.RepeatWrapping; }
  t.needsUpdate = true;
  return t;
}
function plainTexture(cv, opts = {}) {
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = opts.data ? THREE.NoColorSpace : THREE.SRGBColorSpace; t.flipY = false;
  t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.anisotropy = 4;
  if (opts.repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// ------------------------------------------------------------------------------------------------ the brush
/** The shared dry-brush tile: streaks of a loaded and a starved brush on mid grey. It repeats without a seam. */
export function brushTile() {
  const n = 512, cv = canvas(n, n), g = cv.getContext('2d'), rnd = rng(11);
  g.fillStyle = '#808080'; g.fillRect(0, 0, n, n);
  g.lineCap = 'round';
  const streak = (x, y, len, ang, w, v, a) => {
    for (const ox of [-n, 0, n]) for (const oy of [-n, 0, n]) {
      const x0 = x + ox, y0 = y + oy;
      if (x0 < -120 || x0 > n + 120 || y0 < -120 || y0 > n + 120) continue;
      g.strokeStyle = rgb(v, v, v, a); g.lineWidth = w;
      g.beginPath(); g.moveTo(x0, y0);
      const bend = (rnd() - 0.5) * 0.5;
      g.quadraticCurveTo(x0 + Math.cos(ang + bend) * len * 0.5, y0 + Math.sin(ang + bend) * len * 0.5, x0 + Math.cos(ang) * len, y0 + Math.sin(ang) * len);
      g.stroke();
    }
  };
  for (let i = 0; i < 1500; i++) {            // broad washes
    const ang = (rnd() - 0.5) * 0.9 + (rnd() < 0.2 ? Math.PI / 2 : 0);
    streak(rnd() * n, rnd() * n, 40 + rnd() * 90, ang, 5 + rnd() * 12, rnd() < 0.5 ? 60 + rnd() * 40 : 160 + rnd() * 50, 0.05 + rnd() * 0.06);
  }
  for (let i = 0; i < 3800; i++) {            // the bristles
    const ang = (rnd() - 0.5) * 0.7 + (rnd() < 0.15 ? Math.PI / 2 : 0);
    streak(rnd() * n, rnd() * n, 14 + rnd() * 60, ang, 0.8 + rnd() * 2.2, rnd() < 0.5 ? 20 + rnd() * 60 : 180 + rnd() * 70, 0.06 + rnd() * 0.12);
  }
  return plainTexture(cv, { repeat: true, data: true });
}

// ------------------------------------------------------------------------------------------------ water and air
/** A wave field that repeats: rg = its slope, b = its height. Built from waves that fit the tile a whole number of times. */
export function waveTile() {
  const n = 256, data = new Uint8Array(n * n * 4), rnd = rng(5), waves = [];
  for (let i = 0; i < 26; i++) {
    const k = 2 + Math.floor(rnd() * rnd() * 22), ang = (rnd() - 0.5) * 2.4;
    let kx = Math.round(Math.cos(ang) * k), ky = Math.round(Math.sin(ang) * k);
    if (!kx && !ky) kx = 1;
    waves.push({ kx, ky, a: 1 / Math.pow(Math.hypot(kx, ky), 1.15), p: rnd() * TAU });
  }
  let max = 0;
  const sx = new Float32Array(n * n), sy = new Float32Array(n * n), hh = new Float32Array(n * n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    let dx = 0, dy = 0, h = 0;
    for (const w of waves) { const ph = TAU * (w.kx * x + w.ky * y) / n + w.p, c = Math.cos(ph) * w.a; dx += c * w.kx; dy += c * w.ky; h += Math.sin(ph) * w.a; }
    const i = y * n + x; sx[i] = dx; sy[i] = dy; hh[i] = h; max = Math.max(max, Math.abs(dx), Math.abs(dy));
  }
  for (let i = 0; i < n * n; i++) {
    data[i * 4] = Math.round(clamp(sx[i] / max * 0.5 + 0.5) * 255); data[i * 4 + 1] = Math.round(clamp(sy[i] / max * 0.5 + 0.5) * 255);
    data[i * 4 + 2] = Math.round(clamp(hh[i] * 0.25 + 0.5) * 255); data[i * 4 + 3] = 255;
  }
  const t = new THREE.DataTexture(data, n, n, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

/** A soft round of light for halos. */
export function glowDisc() {
  const n = 128, cv = canvas(n, n), g = cv.getContext('2d'), gr = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.1, 'rgba(255,255,255,0.72)'); gr.addColorStop(0.3, 'rgba(255,255,255,0.24)');
  gr.addColorStop(0.62, 'rgba(255,255,255,0.055)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, n, n);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.NoColorSpace; return t;
}

/** A torn piece of mist: thick in the middle, wisps at its edges. */
export function mistPuff() {
  const n = 256, data = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const u = x / n - 0.5, v = y / n - 0.5, r = Math.hypot(u * 1.0, v * 1.9) * 2;
    const f = fbm2(x * 0.018 + 3, y * 0.03 + 7, 4), wisp = fbm2(x * 0.05 + 40, y * 0.012, 3);
    let a = clamp(1.15 - r - (1 - f) * 0.9) * (0.55 + 0.45 * wisp);
    a = a * a * (3 - 2 * a);
    const i = (y * n + x) * 4; data[i] = data[i + 1] = data[i + 2] = 255; data[i + 3] = Math.round(a * 255);
  }
  const t = new THREE.DataTexture(data, n, n, THREE.RGBAFormat); t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.needsUpdate = true;
  return t;
}

/** Long bars of cloud lying over one another, as they do in a northern dusk: r = how much cloud, all round the sky. */
export function cloudBand() {
  const w = 1024, h = 256, data = new Uint8Array(w * h * 4);
  const per = (x, y, f) => {                       // noise that closes on itself round the sky
    const a = x / w * TAU, R = f * w / TAU;
    return fbm2(Math.cos(a) * R * 0.012 + 50, Math.sin(a) * R * 0.012 + y * 0.045 * f + 50, 4);
  };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const v = y / h;                               // 0 at the horizon .. 1 high up
    const bars = per(x, y * 3.2, 1), fine = per(x + 300, y * 6, 2.2);
    let d = clamp((bars * 0.75 + fine * 0.25 - 0.47) * 4.2);
    d *= clamp(v * 9) * clamp((1 - v) * 2.2);       // none on the horizon line itself, thinning toward the top
    const i = (y * w + x) * 4; data[i] = Math.round(d * 255); data[i + 1] = Math.round(clamp(fine * 1.4 - 0.2) * 255); data[i + 2] = 0; data[i + 3] = 255;
  }
  const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat); t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping;
  t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.needsUpdate = true;
  return t;
}

/** Noise that repeats: for the ceiling of cloud (r = the long bars, g = the small breaks in them) and the moon's seas. */
export function cloudTile() {
  const n = 256, data = new Uint8Array(n * n * 4);
  const lattice = (x, y, p, seed) => {
    const xi = Math.floor(x), yi = Math.floor(y); let fx = x - xi, fy = y - yi;
    fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
    const w = (i, j) => { const a = ((i % p) + p) % p, b = ((j % p) + p) % p; const s = Math.sin(a * 127.1 + b * 311.7 + seed * 74.7) * 43758.5453; return s - Math.floor(s); };
    const a = w(xi, yi), b = w(xi + 1, yi), c = w(xi, yi + 1), d = w(xi + 1, yi + 1);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
  const fbm = (x, y, p, seed, oct) => { let amp = 0.5, sum = 0, norm = 0; for (let o = 0; o < oct; o++) { sum += amp * lattice(x * p / n, y * p / n, p, seed + o); norm += amp; amp *= 0.5; p *= 2; } return sum / norm; };
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const i = (y * n + x) * 4;
    data[i] = Math.round(clamp(fbm(x, y, 4, 1, 5)) * 255); data[i + 1] = Math.round(clamp(fbm(x, y, 8, 9, 5)) * 255); data[i + 2] = Math.round(clamp(fbm(x, y, 16, 5, 4)) * 255); data[i + 3] = 255;
  }
  const t = new THREE.DataTexture(data, n, n, THREE.RGBAFormat); t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.needsUpdate = true;
  return t;
}

// ------------------------------------------------------------------------------------------------ what grows
// One sheet holds every cut-out that grows on the river. A region is [u0, v0, u1, v1] with v down the picture.
const SHEET = 1024, SHEET_SCALE = 2;                // regions are laid out on a 1024 grid and painted at twice that
export const FLORA = {
  spruceA: [0, 0, 256, 256], spruceB: [256, 0, 256, 256], spruceC: [512, 0, 256, 256], pine: [768, 0, 256, 256],
  birch: [0, 256, 256, 256], birchB: [256, 256, 256, 256], fern: [512, 256, 256, 256], reed: [768, 256, 128, 256], beard: [896, 256, 128, 256],
  grass: [0, 512, 256, 256], heath: [256, 512, 256, 256], lily: [512, 512, 128, 128], bloom: [640, 512, 128, 128], leaf: [768, 512, 128, 128], moth: [896, 512, 128, 128],
  twigs: [512, 640, 256, 128], shelf: [768, 640, 128, 128],
};
export function region(name, inset = 1.5) {
  const [x, y, w, h] = FLORA[name];
  return [(x + inset) / SHEET, (y + inset) / SHEET, (x + w - inset) / SHEET, (y + h - inset) / SHEET];
}

function dab(g, x, y, len, ang, w, col, a) {
  g.strokeStyle = rgb(col[0], col[1], col[2], a); g.lineWidth = w;
  g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len); g.stroke();
}

// One skirt of a spruce as it is seen from outside the tree, unrolled: dense where it leaves the trunk (the top of
// the picture), breaking into drooping fingers with ragged tips at the bottom. It repeats sideways, so that it can
// be wrapped round a tier. Painted pale, so that the tree's own colour tints it.
function paintSpruce(g, ox, oy, seed) {
  const rnd = rng(seed), S = 256;
  g.save(); g.translate(ox, oy); g.beginPath(); g.rect(0, 0, S, S); g.clip(); g.lineCap = 'round';
  const dark = [58, 78, 72], mid = [116, 142, 120], light = [186, 206, 168];
  const wdab = (x, y, len, ang, w, col, a) => { for (const o of [-S, 0, S]) if (x + o > -40 && x + o < S + 40) dab(g, x + o, y, len, ang, w, col, a); };
  const fingers = 8, finger = [];
  for (let i = 0; i < fingers; i++) {
    const u = (i + 0.5 + (rnd() - 0.5) * 0.7) / fingers;
    finger.push({ x: u * S, len: S * (0.56 + rnd() * 0.42), sway: (rnd() - 0.5) * 26, w: S / fingers * (0.85 + rnd() * 0.4), gap: 0.5 + rnd() * 0.3 });
  }
  // the shoulder of the skirt: closed, dark, needles lying down the slope
  for (let k = 0; k < 700; k++) { const x = rnd() * S, y = rnd() * S * 0.46 * (0.75 + 0.5 * noise2(x * 0.04 + seed, 2.2)); wdab(x, y - 6, 12 + rnd() * 12, Math.PI / 2 + (rnd() - 0.5) * 0.9, 6, mixc(dark, mid, rnd() * 0.3), 0.95); }
  // the hanging sprays: each finger is two or three clumps of short twigs with a thin place between, three passes dark to light
  for (let pass = 0; pass < 3; pass++) {
    const col = pass === 0 ? dark : pass === 1 ? mid : light;
    const count = pass === 0 ? 1300 : pass === 1 ? 1000 : 320;
    for (let k = 0; k < count; k++) {
      const f = finger[Math.floor(rnd() * fingers)], t = Math.pow(rnd(), pass === 2 ? 0.55 : 0.8);
      const thin = Math.abs(t - f.gap) < 0.07 ? 0.35 : 1, taper = (1 - Math.pow(t, 2.4) * 0.85) * thin, cx = f.x + f.sway * t * t;
      if (thin < 1 && rnd() < 0.6) continue;
      const y = t * f.len, x = cx + (rnd() - 0.5) * f.w * taper * (pass === 0 ? 1.15 : 1);
      const ang = Math.PI / 2 + (rnd() - 0.5) * (0.9 - t * 0.4);
      const c = mixc(col, pass === 2 ? [214, 228, 190] : col, rnd() * 0.5);
      wdab(x, y - 4, (pass === 0 ? 12 : 8) + rnd() * 9, ang, pass === 0 ? 5 : pass === 1 ? 2.8 : 1.5, c, pass === 0 ? 0.95 : 0.8);
    }
  }
  for (const f of finger) for (let k = 0; k < 2; k++) wdab(f.x + f.sway + (rnd() - 0.5) * 10, f.len - 6, 6 + rnd() * 12, Math.PI / 2 + (rnd() - 0.5) * 0.5, 1.4, dark, 0.9);
  g.restore();
}

// One bough of a spruce seen flat, from its foot (left) to its tip (right): the stem, the side twigs swept
// forward, the needles as short strokes along them.
function paintBough(g, ox, oy, seed) {
  const rnd = rng(seed), S = 256, mid = S / 2;
  g.save(); g.translate(ox, oy); g.beginPath(); g.rect(0, 0, S, S); g.clip(); g.lineCap = 'round';
  const dark = [58, 78, 72], md = [112, 138, 116], light = [182, 202, 164];
  for (let pass = 0; pass < 3; pass++) {
    const col = pass === 0 ? dark : pass === 1 ? md : light, n = pass === 0 ? 34 : pass === 1 ? 30 : 16;
    for (let i = 0; i < n; i++) {
      const t = (i + rnd()) / n, x = 6 + t * (S - 26), half = S * 0.44 * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.7)), 0.8) * (1 - t * 0.3) + 4;
      for (const side of [-1, 1]) {
        const len = half * (0.7 + rnd() * 0.35), ang = side * (1.0 - t * 0.35) + (rnd() - 0.5) * 0.25;
        for (let k = 0; k < 9; k++) {
          const u = (k + rnd()) / 9, px = x + Math.cos(ang) * len * u, py = mid + Math.sin(ang) * len * u;
          dab(g, px, py, (pass === 0 ? 13 : 9) * (1 - u * 0.4), ang + (rnd() - 0.5) * 1.3, pass === 0 ? 5 : pass === 1 ? 2.8 : 1.5, mixc(col, light, pass === 2 ? rnd() * 0.5 : 0), 0.92);
        }
      }
    }
  }
  g.strokeStyle = rgb(52, 46, 42, 1); g.lineWidth = 3; g.beginPath(); g.moveTo(0, mid); g.lineTo(S * 0.8, mid); g.stroke();
  g.restore();
}

// The cloud of a pine's crown, unrolled: tufts of long needles standing up and out, closed at the top of the picture
// and bumpy along the bottom. It repeats sideways.
function paintPine(g, ox, oy, seed) {
  const rnd = rng(seed), S = 256;
  g.save(); g.translate(ox, oy); g.beginPath(); g.rect(0, 0, S, S); g.clip(); g.lineCap = 'round';
  const dark = [54, 76, 72], mid = [112, 138, 118], light = [180, 200, 164];
  const wdab = (x, y, len, ang, w, col, a) => { for (const o of [-S, 0, S]) if (x + o > -40 && x + o < S + 40) dab(g, x + o, y, len, ang, w, col, a); };
  const hem = (x) => S * (0.7 + 0.22 * noise2(x / S * 6.0 + seed, 3.3) + 0.08 * Math.sin(x / S * TAU * 3));     // where the cloud ends, across the picture
  for (let k = 0; k < 900; k++) { const x = rnd() * S, y = rnd() * hem(x) * 0.96; wdab(x, y, 12 + rnd() * 12, rnd() * TAU, 6.5, mixc(dark, mid, rnd() * 0.25), 0.95); }
  for (let pass = 1; pass < 3; pass++) for (let k = 0; k < (pass === 1 ? 70 : 46); k++) {
    const cx = rnd() * S, cy = rnd() * hem(cx) * 0.98, n = 9 + Math.floor(rnd() * 7);
    for (let q = 0; q < n; q++) {
      const ang = -Math.PI / 2 + (rnd() - 0.5) * 2.6;
      wdab(cx, cy, 11 + rnd() * 13, ang, pass === 1 ? 2.2 : 1.3, pass === 1 ? mixc(mid, dark, rnd() * 0.4) : mixc(light, mid, rnd() * 0.5), 0.9);
    }
  }
  g.restore();
}

// A birch's crown, unrolled: leaves close together at the top of the picture, and below them the long threads of
// twig that hang, each strung with small leaves. It repeats sideways. Pale, to be tinted green or gold.
function paintBirch(g, ox, oy, seed, thin) {
  const rnd = rng(seed), S = 256;
  g.save(); g.translate(ox, oy); g.beginPath(); g.rect(0, 0, S, S); g.clip(); g.lineCap = 'round';
  const tones = [[104, 112, 92], [176, 186, 142], [236, 240, 200]];
  const leafAt = (x, y, tone, sz = 1) => { const c = tones[tone], a = rnd() * TAU; g.fillStyle = rgb(c[0], c[1], c[2], 0.96);
    for (const o of [-S, 0, S]) if (x + o > -12 && x + o < S + 12) { g.beginPath(); g.ellipse(x + o, y, (4.4 + rnd() * 2.6) * sz, (2.8 + rnd() * 1.4) * sz, a, 0, TAU); g.fill(); } };
  // the closed top
  const top = S * (thin ? 0.24 : 0.34);
  for (let pass = 0; pass < 3; pass++) for (let k = 0; k < (pass === 0 ? 520 : pass === 1 ? 420 : 150); k++) { const x = rnd() * S, y = rnd() * top * (0.8 + 0.5 * noise2(x * 0.05 + seed, 1.7)); leafAt(x, y - 3, pass, 1.15); }
  // the hanging threads
  const threads = thin ? 12 : 17;
  for (let i = 0; i < threads; i++) {
    let x = (i + rnd()) / threads * S, y = top * 0.6;
    const len = S * (0.5 + rnd() * 0.5), lean = (rnd() - 0.5) * 0.3, pts = [];
    g.strokeStyle = rgb(60, 50, 46, 0.85); g.lineWidth = 1.4;
    for (const o of [-S, 0, S]) { let xx = x + o, r2 = rng(seed * 31 + i); g.beginPath(); g.moveTo(xx, y); for (let t = y; t < len; t += 9) { xx += lean * 3 + (r2() - 0.5) * 2.4; g.lineTo(xx, t); if (o === 0) pts.push([xx, t]); } g.stroke(); }
    for (const [px, py] of pts) for (let k = 0; k < (thin ? 2 : 3); k++) { if (rnd() < 0.2) continue; const v = rnd(); leafAt(px + (rnd() - 0.5) * 15, py + (rnd() - 0.5) * 9, v < 0.3 ? 0 : v < 0.8 ? 1 : 2); }
  }
  g.restore();
}

// A fern frond lying along the picture from its foot (left) to its tip (right).
function paintFern(g, ox, oy, seed) {
  const rnd = rng(seed), S = 256;
  g.save(); g.translate(ox, oy); g.beginPath(); g.rect(0, 0, S, S); g.clip(); g.lineCap = 'round';
  const mid = S / 2;
  for (let i = 0; i < 46; i++) {
    const t = i / 46, x = 8 + t * (S - 16), half = (S * 0.44) * Math.sin(Math.PI * Math.pow(t, 0.62)) * (1 - t * 0.25) + 3;
    for (const side of [-1, 1]) {
      const tipx = x + 9, tipy = mid + side * half, v = rnd();
      const col = v < 0.4 ? [92, 124, 70] : v < 0.85 ? [140, 170, 92] : [192, 208, 128];
      g.strokeStyle = rgb(col[0], col[1], col[2], 0.96); g.lineWidth = 3.6 * (1 - t * 0.5);
      g.beginPath(); g.moveTo(x, mid); g.quadraticCurveTo(x + 2, mid + side * half * 0.6, tipx, tipy); g.stroke();
    }
  }
  g.strokeStyle = rgb(70, 86, 52, 1); g.lineWidth = 2.4; g.beginPath(); g.moveTo(0, mid); g.lineTo(S - 8, mid); g.stroke();
  g.restore();
}

// Blades that stand up from the bottom of the picture: reeds (tall, with a few seed heads) or grass.
function paintBlades(g, ox, oy, w, h, seed, kind) {
  const rnd = rng(seed);
  g.save(); g.translate(ox, oy); g.beginPath(); g.rect(0, 0, w, h); g.clip(); g.lineCap = 'round';
  const n = kind === 'reed' ? 20 : kind === 'grass' ? 70 : 60;
  for (let i = 0; i < n; i++) {
    const x0 = w * (0.12 + rnd() * 0.76), ht = h * (kind === 'reed' ? 0.6 + rnd() * 0.38 : 0.3 + rnd() * 0.62), lean = (rnd() - 0.5) * w * (kind === 'reed' ? 0.3 : 0.7);
    const v = rnd(), col = kind === 'heath' ? (v < 0.5 ? [96, 84, 70] : v < 0.85 ? [140, 112, 104] : [176, 132, 150])
      : v < 0.35 ? [104, 118, 78] : v < 0.8 ? [158, 166, 108] : [214, 208, 150];
    g.strokeStyle = rgb(col[0], col[1], col[2], 0.96); g.lineWidth = kind === 'reed' ? 2.6 : 2.2;
    g.beginPath(); g.moveTo(x0, h); g.quadraticCurveTo(x0 + lean * 0.2, h - ht * 0.6, x0 + lean, h - ht); g.stroke();
    if (kind === 'reed' && rnd() < 0.45) { g.strokeStyle = rgb(120, 92, 70, 1); g.lineWidth = 5; g.beginPath(); g.moveTo(x0 + lean, h - ht); g.lineTo(x0 + lean * 1.04, h - ht - 20 - rnd() * 14); g.stroke(); }
    if (kind === 'heath') for (let k = 0; k < 5; k++) { g.fillStyle = rgb(col[0] + 20, col[1], col[2] + 16, 0.9); g.beginPath(); g.arc(x0 + lean * (0.5 + k * 0.1) + (rnd() - 0.5) * 9, h - ht * (0.5 + k * 0.1), 2.6, 0, TAU); g.fill(); }
  }
  g.restore();
}

// Old man's beard: the grey lichen that hangs from the dead lower boughs of old spruce.
function paintBeard(g, ox, oy, seed) {
  const rnd = rng(seed), w = 128, h = 256;
  g.save(); g.translate(ox, oy); g.beginPath(); g.rect(0, 0, w, h); g.clip(); g.lineCap = 'round';
  for (let i = 0; i < 46; i++) {
    let x = w * (0.2 + rnd() * 0.6), y = 0; const len = h * (0.35 + rnd() * 0.6), v = rnd();
    g.strokeStyle = v < 0.5 ? rgb(150, 164, 150, 0.9) : rgb(202, 212, 190, 0.9); g.lineWidth = 1.5 + rnd() * 1.4; g.beginPath(); g.moveTo(x, y);
    for (let t = 0; t < len; t += 10) { x += (rnd() - 0.5) * 7; y = t; g.lineTo(x, y); }
    g.stroke();
  }
  g.restore();
}

function paintSmall(g) {
  // a lily pad, seen from above, with its notch
  { const [x, y, w] = FLORA.lily, c = x + w / 2, cy = y + w / 2; g.fillStyle = rgb(94, 122, 84, 1); g.beginPath(); g.moveTo(c, cy); g.arc(c, cy, w * 0.46, 0.22, TAU - 0.22); g.closePath(); g.fill();
    g.strokeStyle = rgb(150, 176, 120, 0.8); g.lineWidth = 1.5; for (let i = 0; i < 9; i++) { const a = 0.4 + i * (TAU - 0.8) / 8; g.beginPath(); g.moveTo(c, cy); g.lineTo(c + Math.cos(a) * w * 0.42, cy + Math.sin(a) * w * 0.42); g.stroke(); }
    g.strokeStyle = rgb(60, 84, 60, 0.9); g.lineWidth = 3; g.beginPath(); g.arc(c, cy, w * 0.45, 0.22, TAU - 0.22); g.stroke(); }
  // a white water lily: two rings of petals round a gold heart
  { const [x, y, w] = FLORA.bloom, c = x + w / 2, cy = y + w / 2;
    for (let ring = 0; ring < 2; ring++) for (let i = 0; i < 10; i++) { const a = i / 10 * TAU + ring * 0.31, r = w * (ring ? 0.2 : 0.36); g.fillStyle = ring ? rgb(255, 252, 240, 1) : rgb(226, 230, 232, 1);
      g.beginPath(); g.ellipse(c + Math.cos(a) * r * 0.6, cy + Math.sin(a) * r * 0.6, r * 0.62, r * 0.26, a, 0, TAU); g.fill(); }
    g.fillStyle = rgb(240, 190, 70, 1); g.beginPath(); g.arc(c, cy, w * 0.07, 0, TAU); g.fill(); }
  // one leaf, pale (it is tinted red-gold where it falls)
  { const [x, y, w] = FLORA.leaf, c = x + w / 2, cy = y + w / 2; g.fillStyle = rgb(236, 226, 200, 1); g.beginPath(); g.moveTo(x + 12, cy);
    g.quadraticCurveTo(c, y + 14, x + w - 10, cy); g.quadraticCurveTo(c, y + w - 14, x + 12, cy); g.fill(); g.strokeStyle = rgb(150, 130, 110, 0.9); g.lineWidth = 2.5; g.beginPath(); g.moveTo(x + 6, cy); g.lineTo(x + w - 12, cy); g.stroke(); }
  // a moth with its wings open
  { const [x, y, w] = FLORA.moth, c = x + w / 2, cy = y + w / 2; g.fillStyle = rgb(236, 228, 210, 1);
    for (const sd of [-1, 1]) { g.beginPath(); g.moveTo(c, cy - 6); g.quadraticCurveTo(c + sd * w * 0.5, cy - w * 0.42, c + sd * w * 0.44, cy + 2); g.quadraticCurveTo(c + sd * w * 0.3, cy + w * 0.34, c, cy + 10); g.fill(); }
    g.fillStyle = rgb(120, 104, 90, 1); g.beginPath(); g.ellipse(c, cy, 5, 20, 0, 0, TAU); g.fill(); }
  // bare twigs, for dead boughs and winter crowns
  { const [x, y, w, h] = FLORA.twigs, rnd = rng(77); g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip(); g.lineCap = 'round';
    const grow = (px, py, ang, len, wd, depth) => { const ex = px + Math.cos(ang) * len, ey = py + Math.sin(ang) * len; g.strokeStyle = rgb(74, 66, 62, 1); g.lineWidth = wd; g.beginPath(); g.moveTo(px, py); g.lineTo(ex, ey); g.stroke();
      if (depth > 0) for (let k = 0; k < 2; k++) grow(px + (ex - px) * (0.4 + rnd() * 0.5), py + (ey - py) * (0.4 + rnd() * 0.5), ang + (rnd() - 0.5) * 1.5, len * (0.5 + rnd() * 0.25), wd * 0.62, depth - 1); };
    for (let i = 0; i < 4; i++) grow(x + 4, y + h * (0.2 + i * 0.2), (rnd() - 0.5) * 0.5, w * (0.5 + rnd() * 0.3), 3.6, 4);
    g.restore(); }
  // a bracket fungus, seen from the side
  { const [x, y, w, h] = FLORA.shelf; g.fillStyle = rgb(206, 186, 150, 1); g.beginPath(); g.moveTo(x + 4, y + h * 0.5); g.quadraticCurveTo(x + w * 0.5, y + h * 0.1, x + w - 6, y + h * 0.56); g.quadraticCurveTo(x + w * 0.5, y + h * 0.74, x + 4, y + h * 0.5); g.fill();
    g.strokeStyle = rgb(120, 96, 70, 0.9); g.lineWidth = 3; g.beginPath(); g.moveTo(x + 8, y + h * 0.46); g.quadraticCurveTo(x + w * 0.5, y + h * 0.2, x + w - 12, y + h * 0.52); g.stroke(); }
}

/** The sheet of everything that grows. */
export function floraSheet() {
  if (floraSheet.made) return floraSheet.made;
  const cv = canvas(SHEET * SHEET_SCALE, SHEET * SHEET_SCALE), g = cv.getContext('2d');
  g.scale(SHEET_SCALE, SHEET_SCALE);
  paintSpruce(g, 0, 0, 21, false); paintSpruce(g, 256, 0, 22, false); paintBough(g, 512, 0, 23); paintPine(g, 768, 0, 31);
  paintBirch(g, 0, 256, 41, false); paintBirch(g, 256, 256, 42, true); paintFern(g, 512, 256, 51);
  paintBlades(g, 768, 256, 128, 256, 61, 'reed'); paintBeard(g, 896, 256, 71);
  paintBlades(g, 0, 512, 256, 256, 62, 'grass'); paintBlades(g, 256, 512, 256, 256, 63, 'heath');
  paintSmall(g);
  return (floraSheet.made = cutTexture(cv, [96, 116, 96]));
}

// ------------------------------------------------------------------------------------------------ bark
/**
 * Four barks side by side, each a strip that repeats up the trunk: spruce (scales), the foot of a pine (plates and
 * furrows), the red upper trunk of a pine (paper flakes), birch (white, with its dashes and black eyes).
 * A trunk's corners say which strip by their u: BARK_U[kind] = [u0, u1].
 */
export const BARK_U = { spruce: [0.004, 0.246], pine: [0.254, 0.496], red: [0.504, 0.746], birch: [0.754, 0.996] };
export function barkSheet() {
  if (barkSheet.made) return barkSheet.made;
  const S = 512, W = 128, cv = canvas(S, S), g = cv.getContext('2d'); g.lineCap = 'round';
  const strip = (i, base, paint) => { g.save(); g.beginPath(); g.rect(i * W, 0, W, S); g.clip(); g.fillStyle = rgb(base[0], base[1], base[2], 1); g.fillRect(i * W, 0, W, S); g.translate(i * W, 0); paint(rng(300 + i)); g.restore(); };
  const vline = (x, y, len, w, c, a, wob, rnd) => { for (const o of [-S, 0, S]) { g.strokeStyle = rgb(c[0], c[1], c[2], a); g.lineWidth = w; g.beginPath(); let xx = x; g.moveTo(xx, y + o); const r2 = rng(Math.floor(x * 7 + y * 13)); for (let t = 0; t < len; t += 8) { xx += (r2() - 0.5) * wob; g.lineTo(xx, y + o + t); } g.stroke(); } };
  const flake = (x, y, w, h, c, a) => { for (const o of [-S, 0, S]) { g.fillStyle = rgb(c[0], c[1], c[2], a); g.beginPath(); g.ellipse(x, y + o, w, h, 0, 0, TAU); g.fill(); } };
  // spruce: grey-brown scales, each with a lighter upper lip
  strip(0, [112, 98, 90], (rnd) => {
    for (let k = 0; k < 420; k++) { const x = rnd() * W, y = rnd() * S, w = 5 + rnd() * 9, h = 4 + rnd() * 7, v = rnd(); flake(x, y, w, h, v < 0.5 ? [84, 72, 66] : [134, 120, 108], 0.8); flake(x, y - h * 0.5, w * 0.8, 1.4, [168, 154, 138], 0.6); }
    for (let k = 0; k < 40; k++) vline(rnd() * W, rnd() * S, 30 + rnd() * 70, 1.6, [52, 44, 42], 0.8, 3, rnd);
  });
  // pine, low: thick plates between deep furrows
  strip(1, [120, 104, 98], (rnd) => {
    for (let k = 0; k < 150; k++) { const x = rnd() * W, y = rnd() * S; flake(x, y, 7 + rnd() * 8, 14 + rnd() * 22, rnd() < 0.5 ? [140, 120, 110] : [104, 90, 88], 0.85); }
    for (let k = 0; k < 46; k++) vline(rnd() * W, rnd() * S, 50 + rnd() * 120, 2.6 + rnd() * 2, [48, 40, 42], 0.92, 4, rnd);
    for (let k = 0; k < 90; k++) flake(rnd() * W, rnd() * S, 3 + rnd() * 4, 1.5, [176, 156, 138], 0.5);
  });
  // pine, high: thin red-gold paper, peeling
  strip(2, [190, 128, 84], (rnd) => {
    for (let k = 0; k < 260; k++) { const x = rnd() * W, y = rnd() * S, v = rnd(); flake(x, y, 6 + rnd() * 12, 3 + rnd() * 6, v < 0.4 ? [158, 100, 68] : v < 0.8 ? [208, 150, 100] : [230, 184, 134], 0.75); }
    for (let k = 0; k < 60; k++) { const x = rnd() * W, y = rnd() * S; flake(x, y, 5 + rnd() * 8, 1.2, [110, 92, 84], 0.8); }
  });
  // birch: white, with its fine dark dashes, the black eyes where a limb was, and grey rubbed patches
  strip(3, [222, 220, 212], (rnd) => {
    for (let k = 0; k < 40; k++) flake(rnd() * W, rnd() * S, 14 + rnd() * 22, 10 + rnd() * 24, [198, 198, 194], 0.5);
    for (let k = 0; k < 520; k++) { const x = rnd() * W, y = rnd() * S; flake(x, y, 2.5 + rnd() * 7, 0.8, [70, 64, 62], 0.75); }
    for (let k = 0; k < 15; k++) { const x = rnd() * W, y = rnd() * S, w = 6 + rnd() * 9; for (const o of [-S, 0, S]) { g.fillStyle = rgb(34, 30, 30, 0.95); g.beginPath(); g.moveTo(x - w, y + o); g.quadraticCurveTo(x, y + o - w * 0.9, x + w, y + o); g.quadraticCurveTo(x, y + o + w * 0.5, x - w, y + o); g.fill(); }
      for (let q = 0; q < 3; q++) flake(x + (rnd() - 0.5) * w * 2.6, y + (rnd() - 0.5) * 6, w * 0.9, 1.3, [50, 44, 44], 0.8); }
    for (let k = 0; k < 24; k++) flake(rnd() * W, rnd() * S, 8 + rnd() * 10, 1.6, [246, 244, 236], 0.9);
  });
  const t = plainTexture(cv, { repeat: true });
  t.wrapS = THREE.ClampToEdgeWrapping;
  return (barkSheet.made = t);
}

// ------------------------------------------------------------------------------------------------ the far wood
// A wall of forest painted flat, for where the wood is too far off to be told from a painting of it: spruces as
// stacked drooping skirts, the way the northern illustrators drew them, in three depths of tone. It repeats sideways.
export function treeWall(seed, kind = 'spruce') {
  const w = 1024, h = 512, cv = canvas(w, h), g = cv.getContext('2d'), rnd = rng(seed);
  g.lineCap = 'round'; g.lineJoin = 'round';
  const spruce = (x, base, ht, wd, tone) => {
    for (const ox of [-w, 0, w]) {
      const cx = x + ox; if (cx < -wd * 1.3 || cx > w + wd * 1.3) continue;
      g.fillStyle = rgb(tone[0], tone[1], tone[2], 1);
      g.fillRect(cx - wd * 0.035, base - ht * 0.98, wd * 0.07, ht);
      const tiers = Math.round(8 + ht / 26);
      for (let i = 0; i < tiers; i++) {
        const t = i / (tiers - 1), y = base - ht * (0.1 + 0.9 * (1 - t)) , r = wd * 0.5 * (0.14 + 0.86 * Math.pow(t, 0.78)) * (0.86 + 0.28 * hashf(seed * 3.1 + x * 0.7 + i));
        const droop = ht / tiers * (0.95 + t * 0.9);
        g.beginPath(); g.moveTo(cx, y - droop * 0.55);
        g.quadraticCurveTo(cx + r * 0.55, y - droop * 0.2, cx + r, y + droop * 0.42);
        // the ragged fringe of the skirt
        const teeth = 5;
        for (let k = teeth; k >= -teeth; k--) { const u = k / teeth, px = cx + u * r, py = y + droop * (0.42 + 0.3 * (1 - Math.abs(u))) + ((k & 1) ? droop * 0.34 : 0) * (0.6 + 0.8 * hashf(seed + x + i * 7 + k)); g.lineTo(px, py); }
        g.quadraticCurveTo(cx - r * 0.55, y - droop * 0.2, cx, y - droop * 0.55);
        g.fill();
      }
      g.beginPath(); g.moveTo(cx, base - ht * 1.07); g.lineTo(cx + wd * 0.03, base - ht * 0.94); g.lineTo(cx - wd * 0.03, base - ht * 0.94); g.fill();      // the leader
    }
  };
  const pine = (x, base, ht, wd, tone) => {
    for (const ox of [-w, 0, w]) {
      const cx = x + ox; if (cx < -wd * 1.3 || cx > w + wd * 1.3) continue;
      g.strokeStyle = rgb(tone[0], tone[1], tone[2], 1); g.fillStyle = g.strokeStyle; g.lineWidth = wd * 0.06;
      const lean = (hashf(seed + x) - 0.5) * wd * 0.5;
      g.beginPath(); g.moveTo(cx, base); g.quadraticCurveTo(cx + lean * 0.3, base - ht * 0.5, cx + lean, base - ht * 0.86); g.stroke();
      for (let i = 0; i < 6; i++) { const a = hashf(seed + x * 1.3 + i), px = cx + lean + (a - 0.5) * wd * 0.95, py = base - ht * (0.74 + 0.26 * hashf(seed * 2 + x + i * 3));
        g.beginPath(); g.ellipse(px, py, wd * (0.2 + 0.16 * a), ht * 0.045 * (1 + a), 0, 0, TAU); g.fill();
        g.lineWidth = wd * 0.025; g.beginPath(); g.moveTo(cx + lean * 0.8, base - ht * 0.72); g.lineTo(px, py); g.stroke(); }
    }
  };
  const hashf = (v) => { const s = Math.sin(v * 127.1) * 43758.5453; return s - Math.floor(s); };
  // three depths: far and pale first, then nearer and darker, each a little lower in the picture
  const tones = [[150, 164, 170], [96, 112, 116], [44, 56, 60]];
  for (let layer = 0; layer < 3; layer++) {
    const n = 20 + layer * 3, base = h + 4, mean = h * (0.86 - layer * 0.15);
    g.fillStyle = rgb(tones[layer][0], tones[layer][1], tones[layer][2], 1); g.fillRect(0, h * (0.55 + layer * 0.14), w, h);
    for (let i = 0; i < n; i++) {
      const x = (i + rnd() * 0.9) / n * w, big = rnd() < 0.2 ? 1.22 : 1, ht = mean * (0.62 + rnd() * 0.42) * big, wd = ht * (0.3 + rnd() * 0.1);
      if (kind === 'pine' && rnd() < 0.7) pine(x, base, ht, wd * 1.3, tones[layer]); else spruce(x, base, ht, wd, tones[layer]);
    }
  }
  return cutTexture(cv, [70, 84, 88], { repeatX: true });
}

/** A far line of fells under the sky: two ridges, cut out. It repeats sideways. */
export function fellLine(seed) {
  const w = 1024, h = 128, cv = canvas(w, h), g = cv.getContext('2d');
  for (let layer = 0; layer < 2; layer++) {
    g.fillStyle = layer ? rgb(60, 72, 80, 1) : rgb(130, 144, 156, 1);
    g.beginPath(); g.moveTo(0, h);
    for (let x = 0; x <= w; x += 4) {
      const a = x / w * TAU, R = 2.2 + layer * 1.4;
      const y = fbm2(Math.cos(a) * R + seed + layer * 9, Math.sin(a) * R + seed, 5);
      g.lineTo(x, h * (0.92 - (y - 0.2) * (layer ? 0.7 : 1.15)) + layer * 14);
    }
    g.lineTo(w, h); g.closePath(); g.fill();
  }
  return cutTexture(cv, [96, 110, 120], { repeatX: true });
}

// ------------------------------------------------------------------------------------------------ worked wood
/**
 * The kinds of worked wood side by side, each a strip that runs along the grain and repeats: planking black with
 * pine tar, grey wood that has stood out in the weather, pale oiled ash (a paddle, a gunwale, a new post), and a
 * band of carving (two strands plaited, the oldest pattern there is), and a roof's shingles. WOOD_U[kind] = [u0, u1],
 * as with the barks; the sheet has room for eight.
 */
const WOOD_SLOT = (i) => [i / 8 + 0.003, (i + 1) / 8 - 0.003];
export const WOOD_U = { tar: WOOD_SLOT(0), grey: WOOD_SLOT(1), pale: WOOD_SLOT(2), carved: WOOD_SLOT(3), shingle: WOOD_SLOT(4) };
export function woodSheet() {
  if (woodSheet.made) return woodSheet.made;
  const S = 512, W = 128, cv = canvas(W * 8, S), g = cv.getContext('2d'); g.lineCap = 'round';
  const strip = (i, base, paint) => { g.save(); g.beginPath(); g.rect(i * W, 0, W, S); g.clip(); g.fillStyle = rgb(base[0], base[1], base[2], 1); g.fillRect(i * W, 0, W, S); g.translate(i * W, 0); paint(rng(500 + i)); g.restore(); };
  // a line of grain: long, nearly straight, running the length of the strip and closing on itself
  const grain = (x, w, c, a, wob, rnd, y0 = 0, len = S) => {
    for (const o of [-S, 0, S]) { g.strokeStyle = rgb(c[0], c[1], c[2], a); g.lineWidth = w; g.beginPath(); let xx = x; const r2 = rng(Math.floor(x * 91 + y0 * 7 + 3)); g.moveTo(xx, y0 + o);
      for (let t = 12; t <= len; t += 12) { xx += (r2() - 0.5) * wob; g.lineTo(xx, y0 + o + t); } g.stroke(); }
  };
  const knot = (x, y, r, dark, lightc) => { for (const o of [-S, 0, S]) { for (let k = 4; k >= 0; k--) { g.strokeStyle = rgb(...(k % 2 ? lightc : dark), 0.7); g.lineWidth = 1.3; g.beginPath(); g.ellipse(x, y + o, r * (0.3 + k * 0.32), r * (0.5 + k * 0.6), 0, 0, TAU); g.stroke(); } g.fillStyle = rgb(dark[0] * 0.6, dark[1] * 0.6, dark[2] * 0.6, 0.9); g.beginPath(); g.ellipse(x, y + o, r * 0.3, r * 0.45, 0, 0, TAU); g.fill(); } };
  // tarred planking: near black-brown, the tar pooled dark in the grain and worn to red wood on the high places
  strip(0, [84, 62, 48], (rnd) => {
    for (let k = 0; k < 46; k++) grain(rnd() * W, 2 + rnd() * 5, rnd() < 0.6 ? [62, 44, 36] : [104, 76, 56], 0.22 + rnd() * 0.2, 1.6, rnd);
    for (let k = 0; k < 50; k++) grain(rnd() * W, 0.9, [44, 30, 26], 0.5, 1.2, rnd, rnd() * S, 60 + rnd() * 200);
    for (let k = 0; k < 10; k++) grain(rnd() * W, 1.1, [128, 96, 68], 0.3, 1.0, rnd, rnd() * S, 30 + rnd() * 90);
    for (let k = 0; k < 3; k++) knot(18 + rnd() * (W - 36), rnd() * S, 5 + rnd() * 4, [46, 32, 26], [100, 74, 54]);
  });
  // weathered: silver-grey, checked and cracked along the grain
  strip(1, [150, 146, 138], (rnd) => {
    for (let k = 0; k < 60; k++) grain(rnd() * W, 1.5 + rnd() * 4, rnd() < 0.5 ? [124, 120, 114] : [176, 172, 162], 0.4, 1.8, rnd);
    for (let k = 0; k < 44; k++) grain(rnd() * W, 1.1 + rnd(), [66, 62, 60], 0.75, 1.4, rnd, rnd() * S, 40 + rnd() * 160);
    for (let k = 0; k < 3; k++) knot(18 + rnd() * (W - 36), rnd() * S, 5 + rnd() * 5, [70, 66, 62], [170, 166, 156]);
    for (let k = 0; k < 30; k++) { g.fillStyle = rgb(142, 156, 120, 0.25); g.beginPath(); g.ellipse(rnd() * W, rnd() * S, 3 + rnd() * 6, 4 + rnd() * 9, 0, 0, TAU); g.fill(); }
  });
  // oiled ash: pale and warm, a fine close grain
  strip(2, [198, 164, 118], (rnd) => {
    for (let k = 0; k < 70; k++) grain(rnd() * W, 0.8 + rnd() * 2.2, rnd() < 0.55 ? [164, 126, 84] : [222, 192, 146], 0.4, 1.0, rnd);
    for (let k = 0; k < 2; k++) knot(22 + rnd() * (W - 44), rnd() * S, 4 + rnd() * 3, [120, 86, 58], [214, 182, 136]);
  });
  // carving: a plait of two strands in low relief, lit from above, with a bead down each edge. It repeats every 128.
  strip(3, [132, 100, 70], (rnd) => {
    for (let k = 0; k < 40; k++) grain(rnd() * W, 1 + rnd() * 2.4, rnd() < 0.5 ? [106, 78, 54] : [156, 122, 88], 0.35, 1.0, rnd);
    const strand = (ph, over) => {
      for (const [off, c, w] of [[2.5, [50, 34, 26], 15], [0, [168, 132, 92], 11], [-2, [214, 180, 132], 3]]) {
        g.strokeStyle = rgb(c[0], c[1], c[2], 1); g.lineWidth = w; g.lineJoin = 'round';
        for (let seg = 0; seg < 8; seg++) {
          if ((seg % 2 === 0) !== over) continue;                       // each strand goes over, then under
          g.beginPath();
          for (let t = 0; t <= 64; t += 4) { const y = seg * 64 + t, x = W / 2 + Math.sin(y / 128 * TAU + ph) * 30; if (t === 0) g.moveTo(x, y + off); else g.lineTo(x, y + off); }
          g.stroke();
        }
      }
    };
    strand(0, false); strand(Math.PI, false); strand(0, true); strand(Math.PI, true);
    for (const x of [9, W - 9]) for (let y = 8; y < S; y += 16) { g.fillStyle = rgb(60, 42, 32, 1); g.beginPath(); g.arc(x, y + 1.5, 4.6, 0, TAU); g.fill(); g.fillStyle = rgb(190, 154, 110, 1); g.beginPath(); g.arc(x, y, 3.6, 0, TAU); g.fill(); }
  });
  // shingles: a roof of split pine cut to a round end and tarred, each course lying on the one below. Four to the
  // strip and eight courses to its length, every other course set half a shingle over (the halves at the strip's
  // edges are the same shingle, so that strips laid side by side make one roof)
  strip(4, [40, 32, 28], () => {
    const R = S / 8, n = 4, w = W / n;
    for (let r = 8; r >= -1; r--) for (let k = -1; k <= n; k++) {
      const x = k * w + (r & 1 ? w / 2 : 0), y = r * R, rnd = rng(900 + ((r + 8) % 8) * 16 + ((k + n) % n) + (r & 1 ? 8 : 0));
      const v = 0.78 + rnd() * 0.44, silver = rnd() < 0.24, c = silver ? [132 * v, 126 * v, 116 * v] : [96 * v, 76 * v, 60 * v];
      const tab = (dy, fill, inset) => { g.fillStyle = fill; g.beginPath(); g.moveTo(x + inset, y - 12 + dy); g.lineTo(x + w - inset, y - 12 + dy); g.lineTo(x + w - inset, y + R - 16 + dy);
        g.quadraticCurveTo(x + w - inset, y + R + 5 + dy, x + w / 2, y + R + 7 + dy); g.quadraticCurveTo(x + inset, y + R + 5 + dy, x + inset, y + R - 16 + dy); g.closePath(); g.fill(); };
      tab(6, rgb(16, 12, 11, 0.92), 0);                                   // the shadow it lays on the course below
      tab(0, rgb(c[0], c[1], c[2], 1), 1.2);
      for (let q = 0; q < 5; q++) { g.strokeStyle = rgb(c[0] * 0.66, c[1] * 0.66, c[2] * 0.66, 0.55); g.lineWidth = 0.9 + rnd(); const gx = x + 4 + rnd() * (w - 8); g.beginPath(); g.moveTo(gx, y - 8); g.lineTo(gx + (rnd() - 0.5) * 2.4, y + R - 6 + rnd() * 8); g.stroke(); }
      g.strokeStyle = rgb(Math.min(255, c[0] * 1.5), Math.min(255, c[1] * 1.5), Math.min(255, c[2] * 1.45), 0.6); g.lineWidth = 1.6;       // the worn end catches the light
      g.beginPath(); g.moveTo(x + 3.5, y + R - 15); g.quadraticCurveTo(x + 3.5, y + R + 2, x + w / 2, y + R + 4); g.quadraticCurveTo(x + w - 3.5, y + R + 2, x + w - 3.5, y + R - 15); g.stroke();
      if (rnd() < 0.2) { g.fillStyle = rgb(92, 112, 58, 0.5); g.beginPath(); g.ellipse(x + w * (0.3 + rnd() * 0.4), y + R * (0.3 + rnd() * 0.5), 3 + rnd() * 5, 4 + rnd() * 7, 0, 0, TAU); g.fill(); }
    }
  });
  const t = plainTexture(cv, { repeat: true });
  t.wrapS = THREE.ClampToEdgeWrapping;
  return (woodSheet.made = t);
}

// ------------------------------------------------------------------------------------------------ runes
// The older futhark, cut as a carver cuts them: straight strokes only, no curve and no stroke along the grain.
// Each is given as strokes [x0, y0, x1, y1] in a cell one wide and one high (y up). `q` stands for ing.
const RUNES = {
  f: [[.25, 0, .25, 1], [.25, .45, .8, .78], [.25, .72, .68, .98]], u: [[.25, 0, .25, 1], [.25, 1, .75, .6], [.75, .6, .75, 0]],
  'þ': [[.3, 0, .3, 1], [.3, .75, .7, .5], [.7, .5, .3, .25]], a: [[.3, 0, .3, 1], [.3, 1, .75, .72], [.3, .7, .75, .42]],
  r: [[.3, 0, .3, 1], [.3, 1, .72, .76], [.72, .76, .3, .52], [.3, .52, .75, 0]], k: [[.7, .85, .3, .5], [.3, .5, .7, .15]],
  g: [[.2, 0, .8, 1], [.2, 1, .8, 0]], w: [[.3, 0, .3, 1], [.3, 1, .72, .75], [.72, .75, .3, .5]],
  h: [[.25, 0, .25, 1], [.75, 0, .75, 1], [.25, .65, .75, .35]], n: [[.5, 0, .5, 1], [.28, .65, .72, .35]], i: [[.5, 0, .5, 1]],
  s: [[.7, 1, .3, .68], [.3, .68, .7, .36], [.7, .36, .3, 0]], t: [[.5, 0, .5, 1], [.5, 1, .2, .7], [.5, 1, .8, .7]],
  b: [[.3, 0, .3, 1], [.3, 1, .72, .76], [.72, .76, .3, .52], [.3, .52, .72, .26], [.72, .26, .3, 0]],
  e: [[.25, 0, .25, 1], [.75, 0, .75, 1], [.25, 1, .5, .7], [.5, .7, .75, 1]], m: [[.25, 0, .25, 1], [.75, 0, .75, 1], [.25, 1, .75, .6], [.75, 1, .25, .6]],
  l: [[.35, 0, .35, 1], [.35, 1, .72, .7]], q: [[.5, .85, .8, .5], [.8, .5, .5, .15], [.5, .15, .2, .5], [.2, .5, .5, .85]],
  o: [[.5, 1, .8, .65], [.8, .65, .2, 0], [.5, 1, .2, .65], [.2, .65, .8, 0]], d: [[.2, 0, .2, 1], [.8, 0, .8, 1], [.2, 1, .8, 0], [.2, 0, .8, 1]],
  z: [[.5, 0, .5, 1], [.5, .55, .2, 1], [.5, .55, .8, 1]],
};
const RUNE_ORDER = Object.keys(RUNES), RUNE_W = 2048, RUNE_CELL = 64;
/** Where a rune lies on the rune sheet: [u0, v0, u1, v1], or null for a letter the futhark has not got (a space). */
export function runeRegion(ch) { const i = RUNE_ORDER.indexOf(ch); return i < 0 ? null : [(i * RUNE_CELL + 1) / RUNE_W, 0.01, ((i + 1) * RUNE_CELL - 1) / RUNE_W, 0.99]; }
export function runeSheet() {
  if (runeSheet.made) return runeSheet.made;
  const cv = canvas(RUNE_W, 128), g = cv.getContext('2d'); g.lineCap = 'round'; g.lineJoin = 'round';
  RUNE_ORDER.forEach((ch, i) => {
    const x0 = i * RUNE_CELL + 10, w = RUNE_CELL - 20, y0 = 114, h = 100, rnd = rng(700 + i);
    for (const [a, b, c, d] of RUNES[ch]) for (const [lw, al] of [[9, 1], [5, 1]]) {
      g.strokeStyle = rgb(255, 255, 255, al); g.lineWidth = lw * (0.85 + rnd() * 0.3);
      g.beginPath(); g.moveTo(x0 + a * w, y0 - b * h); g.lineTo(x0 + c * w + (rnd() - 0.5) * 2, y0 - d * h + (rnd() - 0.5) * 2); g.stroke();
    }
  });
  return (runeSheet.made = cutTexture(cv, [255, 255, 255]));
}

// ------------------------------------------------------------------------------------------------ the web on the loom
/**
 * The cloth on the loom in the golden grove, drawn thread by thread as a weaver's draft is: madder ground, gold and
 * pale wool and a little indigo. What is woven in it is the river so far, in five pictures from the left: the
 * boathouse and its fire, the wood and the giant with the lamp in his hand, the gate under the moon, the stones and
 * the ship beneath them, and the tree with the loom hanging from it. The last is not finished: the cloth stops in a
 * stair across it, and beyond that there is only warp. One cell is one crossing of threads; the sheet is 256 by 40.
 */
/** The cell at which the cloth stops, row by row (it is woven from the top down, so the stair runs back as it descends). */
export const LOOM_FELL = (y) => 244 - Math.floor(y / 2) * 2;
export function loomCloth() {
  if (loomCloth.made) return loomCloth.made;
  const CW = 256, CH = 40, K = 4, cv = canvas(CW * K, CH * K), g = cv.getContext('2d');
  const MADDER = [96, 28, 20], GOLD = [226, 176, 62], PALE = [236, 224, 192], INDIGO = [22, 28, 58], rnd = rng(77);
  const cell = (x, y, c, w = 1, h = 1) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const v = 0.86 + rnd() * 0.24; g.fillStyle = rgb(c[0] * v, c[1] * v, c[2] * v, 1); g.fillRect((x + i) * K, (y + j) * K, K, K); } };
  cell(0, 0, MADDER, CW, CH);
  // the selvedges: a tablet-woven band, gold and indigo on the slant
  for (let x = 0; x < CW; x++) for (let y = 0; y < 4; y++) { cell(x, y, (x + y) % 6 < 3 ? GOLD : INDIGO); cell(x, CH - 1 - y, (x + y) % 6 < 3 ? GOLD : INDIGO); }
  const tri = (cx, top, rows, c, step = 1) => { for (let r = 0; r < rows; r++) { const hw = Math.floor(r / step) + 1; cell(cx - hw + 1, top + r, c, hw * 2 - 1, 1); } };      // a stepped gable, or a spruce
  const water = (x0, x1, y) => { for (let x = x0; x < x1; x++) cell(x, y + ((x >> 1) & 1), GOLD); };
  const canoe = (x, y) => { cell(x + 1, y, GOLD, 7, 1); cell(x, y - 1, GOLD); cell(x + 8, y - 1, GOLD); cell(x + 1, y - 2, PALE); };                                      // she, and her lantern
  const dots = (x) => { for (let y = 6; y < 34; y += 4) { cell(x, y, GOLD, 1, 2); cell(x + 1, y + 2, PALE, 1, 1); } };
  // 1. the landing
  { const x = 2; water(x, x + 47, 31); cell(x + 7, 20, GOLD, 15, 11); cell(x + 12, 24, INDIGO, 5, 7); tri(x + 14, 11, 9, GOLD); cell(x + 14, 9, PALE, 1, 2);
    tri(x + 30, 25, 5, PALE); cell(x + 30, 27, GOLD, 1, 3); cell(x + 38, 8, PALE); cell(x + 37, 9, PALE, 3, 1); cell(x + 38, 10, PALE); canoe(x + 36, 30); dots(x + 48); }
  // 2. the wood, and the one who sits in it
  { const x = 53; water(x, x + 47, 31); for (const [cx, top] of [[x + 5, 12], [x + 13, 8]]) { tri(cx, top, 6, INDIGO); tri(cx, top + 5, 7, INDIGO); tri(cx, top + 11, 8, INDIGO); cell(cx, top + 19, GOLD, 1, 30 - top - 19); }
    cell(x + 24, 9, PALE, 9, 8); cell(x + 29, 12, GOLD, 2, 2); cell(x + 27, 15, INDIGO, 4, 1); cell(x + 20, 17, PALE, 17, 5); cell(x + 18, 22, PALE, 21, 9); cell(x + 37, 22, PALE, 6, 3); cell(x + 41, 25, PALE, 4, 2);
    cell(x + 43, 23, GOLD, 2, 2); canoe(x + 6, 30); dots(x + 48); }
  // 3. the gate, and the moon in its door
  { const x = 104; water(x, x + 47, 31); cell(x + 12, 15, GOLD, 2, 16); cell(x + 32, 15, GOLD, 2, 16); cell(x + 9, 14, GOLD, 28, 2); tri(x + 23, 5, 9, GOLD, 0.7); tri(x + 23, 4, 4, PALE);
    cell(x + 23, 16, PALE, 1, 5); cell(x + 22, 21, PALE, 3, 3); cell(x + 39, 7, PALE, 5, 5); cell(x + 40, 6, PALE, 3, 7); canoe(x + 18, 30); dots(x + 48); }
  // 4. the stones, and under them what they were set up for
  { const x = 155, wl = 19; water(x, x + 47, wl); [9, 5, 4, 3, 3, 4, 5, 8].forEach((h, k) => cell(x + 5 + k * 5, wl - h, PALE, 2, h));
    for (let k = 0; k < 6; k++) cell(x + 8 + k, wl + 2 + k, GOLD, 32 - k * 2, 1); cell(x + 6, wl + 2, GOLD, 2, 1); cell(x + 40, wl + 2, GOLD, 2, 1); cell(x + 5, wl + 3, GOLD); cell(x + 42, wl + 3, GOLD);
    cell(x + 23, wl + 8, GOLD, 1, 9); for (let k = 0; k < 7; k++) cell(x + 15 + k * 2 + 1, wl + 9, k % 2 ? PALE : GOLD, 2, 6); canoe(x + 34, 12 + 5); dots(x + 48); }
  // 5. the tree, as far as it has been woven
  { const x = 206; water(x, x + 50, 31); cell(x + 22, 15, GOLD, 4, 16); cell(x + 20, 29, GOLD, 8, 2);
    for (const [cx, cy, r] of [[x + 24, 9, 6], [x + 15, 11, 5], [x + 33, 11, 5], [x + 24, 5, 4]]) for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) if (i * i + j * j <= r * r + 1) cell(cx + i, cy + j, (i * 3 + j * 5 + 40) % 7 === 0 ? PALE : GOLD);
    for (let k = 0; k < 6; k++) cell(x + 7 + k * 2, 17, PALE, 1, 11); cell(x + 6, 16, GOLD, 13, 1); canoe(x + 9, 30); }
  // where the weaving has got to: a stair down through the last picture, and nothing beyond it but the warp
  const im = g.getImageData(0, 0, CW * K, CH * K), d = im.data;
  for (let y = 0; y < CH; y++) { const fell = LOOM_FELL(y); for (let x = fell; x < CW; x++) for (let j = 0; j < K; j++) for (let i = 0; i < K; i++) d[((y * K + j) * CW * K + x * K + i) * 4 + 3] = 0; }
  g.putImageData(im, 0, 0);
  return (loomCloth.made = cutTexture(cv, MADDER));
}

