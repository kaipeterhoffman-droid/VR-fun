// Flora: everything that grows or lies along the river, modelled once here and stamped many times by forest.js.
//
// The trees are drawn the way the northern illustrators drew them a century ago: a spruce is a spire of drooping
// skirts, ragged at the hem, each tier a shade apart; a pine is a bare red mast with a few dark cushions on top; a
// birch is a white line with a veil. Shapes first, in three or four tones, and the detail (the hanging boughs, the
// lichen beards, the scars on the bark) only where the boat passes close enough to see it.
//
// Every model comes in three weights: 0 for the trees at the water's edge, 1 behind them, 2 for the far rows and for
// the copy the water reflects. A model is { solid, leaf, cut, bark }: `solid` and `leaf` are plain painted shapes
// (leaf is kept apart so that it can be tinted by season), `cut` is cut-out painting from the flora sheet, `bark`
// is trunk wearing the bark sheet (both sheets: src/ifing/art.js).
//
// A crown, near to, is never a lump of triangles: it is a bell of painted leaves or needles wrapped round a branch,
// closed at the top and ragged at the hem, where the painting itself cuts the outline (see bell()).
import { Builder, col, mixCol, mulCol } from './build.js';
import { rng, noise2, fbm2 } from './noise.js';
import { region, BARK_U } from './art.js';

const TAU = Math.PI * 2;
const NEEDLE_IN = col('#1b3028'), NEEDLE = col('#2d4c3a'), NEEDLE_TIP = col('#4d7250'), NEEDLE_OLD = col('#39453a');
const BARK = col('#4b3e36'), BARK_PINE = col('#5e5048'), BARK_RED = col('#b36c38'), STICK = col('#3b3331'), LICHEN = col('#a9b8a4');
const BIRCH = col('#a8a49a'), BIRCH_SCAR = col('#2a2522'), TWIG = col('#3d2f31');
const ROCK = col('#6f6c66'), ROCK_DARK = col('#454340'), MOSS = col('#507628'), MOSS_LIGHT = col('#86a23c');
const WHITE = [1, 1, 1];

// ------------------------------------------------------------------------------------------------ primitives
/**
 * A tube along a path of [x, y, z, radius]. colorAt(ring, corner, t) gives each corner its colour.
 * With `barkU` ([u0, u1], one strip of the bark sheet) the bark is wrapped round it and runs up it, one length of
 * the sheet to every `vScale` metres.
 */
export function tube(b, pts, sides, colorAt, bendAt = null, capEnd = false, barkU = null, vScale = 2.4) {
  const first = b.nv, n = pts.length;
  let run = 0;
  for (let i = 0; i < n; i++) {
    if (i) run += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]);
    const p = pts[i], a = pts[Math.max(0, i - 1)], c = pts[Math.min(n - 1, i + 1)];
    let tx = c[0] - a[0], ty = c[1] - a[1], tz = c[2] - a[2]; const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
    // a frame across the path: u = t x ref, v = t x u
    let rx = 0, ry = 0, rz = 1; if (Math.abs(tz) > 0.9) { rx = 1; rz = 0; }
    let ux = ty * rz - tz * ry, uy = tz * rx - tx * rz, uz = tx * ry - ty * rx; const ul = Math.hypot(ux, uy, uz) || 1; ux /= ul; uy /= ul; uz /= ul;
    const vx = ty * uz - tz * uy, vy = tz * ux - tx * uz, vz = tx * uy - ty * ux;
    const bend = bendAt ? bendAt(i / (n - 1)) : 0;
    for (let j = 0; j < sides; j++) {
      const th = j / sides * TAU, cs = Math.cos(th), sn = Math.sin(th), nx = ux * cs + vx * sn, ny = uy * cs + vy * sn, nz = uz * cs + vz * sn;
      const u = barkU ? barkU[0] + (barkU[1] - barkU[0]) * (1 - Math.abs(2 * j / sides - 1)) : j / sides;
      b.vert(p[0] + nx * p[3], p[1] + ny * p[3], p[2] + nz * p[3], nx, ny, nz, colorAt(i, j, i / (n - 1)), u, barkU ? run / vScale : i / (n - 1), bend);
    }
  }
  for (let i = 0; i < n - 1; i++) for (let j = 0; j < sides; j++) {
    const a = first + i * sides + j, bb = first + i * sides + (j + 1) % sides;
    b.quad(a, bb, bb + sides, a + sides);
  }
  if (capEnd) {
    const p = pts[n - 1], a = pts[n - 2], l = Math.hypot(p[0] - a[0], p[1] - a[1], p[2] - a[2]) || 1;
    const c = b.vert(p[0], p[1], p[2], (p[0] - a[0]) / l, (p[1] - a[1]) / l, (p[2] - a[2]) / l, capEnd === true ? colorAt(n - 1, 0, 1) : capEnd, 0.5, 1, 0);
    const ring = first + (n - 1) * sides;
    for (let j = 0; j < sides; j++) b.tri(c, ring + (j + 1) % sides, ring + j);
  }
}

// a ball of triangles with shared corners, cut finer `detail` times
const icoCache = [];
export function ico(detail) {
  if (icoCache[detail]) return icoCache[detail];
  const t = (1 + Math.sqrt(5)) / 2;
  let v = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]].map((p) => { const l = Math.hypot(...p); return [p[0] / l, p[1] / l, p[2] / l]; });
  let f = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
  for (let d = 0; d < detail; d++) {
    const mid = new Map(), nf = [];
    const m = (a, b) => { const k = a < b ? a * 65536 + b : b * 65536 + a; let i = mid.get(k); if (i === undefined) { const p = [v[a][0] + v[b][0], v[a][1] + v[b][1], v[a][2] + v[b][2]], l = Math.hypot(...p); i = v.length; v.push([p[0] / l, p[1] / l, p[2] / l]); mid.set(k, i); } return i; };
    for (const [a, b, c] of f) { const ab = m(a, b), bc = m(b, c), ca = m(c, a); nf.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]); }
    f = nf;
  }
  return (icoCache[detail] = { v, f });
}

/**
 * A lump: a ball pushed about by noise. Used for boulders, the cushions of a pine, the clouds of a leafy crown.
 * colorAt(nx, ny, nz, wobble) gives each corner its colour; `flat` squashes what lies below the middle.
 */
export function lump(b, cx, cy, cz, rx, ry, rz, detail, seed, rough, colorAt, flat = 1, bend = 0, up = 0.3) {
  const { v, f } = ico(detail), first = b.nv;
  for (const p of v) {
    const w = fbm2(p[0] * 1.7 + seed * 3.1 + p[1] * 1.3, p[2] * 1.7 + seed * 1.7 - p[1] * 0.9, 3);
    const k = 1 + (w - 0.5) * 2 * rough;
    let y = p[1] * k; if (y < 0) y *= flat;
    const nx = p[0], ny = p[1] + up, nz = p[2];
    b.vert(cx + p[0] * k * rx, cy + y * ry, cz + p[2] * k * rz, nx / rx, ny / ry, nz / rz, colorAt(p[0], p[1], p[2], w), 0, 0, bend);
  }
  for (const [a, bb, c] of f) b.tri(first + a, first + bb, first + c);
}

/** A cut-out card: four corners given, picture region [u0, v0, u1, v1] with v down from p0-p1 to p3-p2. */
function card(b, p0, p1, p2, p3, n, reg, c, bendTop = 0, bendBottom = 1, cBottom = null) {
  const a = b.vert(p0[0], p0[1], p0[2], n[0], n[1], n[2], c, reg[0], reg[1], bendTop);
  const d = b.vert(p1[0], p1[1], p1[2], n[0], n[1], n[2], c, reg[2], reg[1], bendTop);
  const e = b.vert(p2[0], p2[1], p2[2], n[0], n[1], n[2], cBottom || c, reg[2], reg[3], bendBottom);
  const f = b.vert(p3[0], p3[1], p3[2], n[0], n[1], n[2], cBottom || c, reg[0], reg[3], bendBottom);
  b.quad(a, d, e, f);
}

/**
 * A bell of painted leaves round a point: closed over the top, widest at the rim, with a hem that hangs `drop` below
 * it. The picture (a region that repeats sideways, dense at its top and ragged at its bottom) is wrapped round it
 * once for each of `cols` panels.
 */
export function bell(cut, x, y, z, r, rise, drop, cols, regs, tintAt, sway, rnd, light = false) {
  const rimR = [], hemY = [], hemR = [], twist = rnd() * TAU;
  for (let c = 0; c < cols; c++) { rimR.push(r * (0.84 + 0.32 * rnd())); hemY.push(y - drop * (0.75 + 0.5 * rnd())); hemR.push(0.86 + 0.2 * rnd()); }
  for (let c = 0; c < cols; c++) {
    const reg = regs[c % regs.length], v1 = reg[1] + (reg[3] - reg[1]) * 0.2, v2 = reg[1] + (reg[3] - reg[1]) * 0.42;
    const corner = (k, u) => {
      const cc = (c + k) % cols, th = twist + (c + k) / cols * TAU, cs = Math.cos(th), sn = Math.sin(th), R = rimR[cc];
      const out = [cut.vert(x + cs * R * 0.06, y + rise, z + sn * R * 0.06, cs * 0.3, 1, sn * 0.3, tintAt(0), u, reg[1], sway * 0.15)];
      if (!light) out.push(cut.vert(x + cs * R * 0.68, y + rise * 0.62, z + sn * R * 0.68, cs, 1.25, sn, tintAt(1), u, v1, sway * 0.3));
      out.push(cut.vert(x + cs * R, y, z + sn * R, cs, 0.25, sn, tintAt(2), u, v2, sway * 0.55));
      out.push(cut.vert(x + cs * R * hemR[cc], hemY[cc], z + sn * R * hemR[cc], cs, -0.25, sn, tintAt(3), u, reg[3], sway));
      return out;
    };
    const L = corner(0, reg[0]), Rr = corner(1, reg[2]);
    for (let q = 0; q < L.length - 1; q++) cut.quad(L[q], Rr[q], Rr[q + 1], L[q + 1]);
  }
}

// ------------------------------------------------------------------------------------------------ spruce
const SKIRT_REG = [region('spruceA'), region('spruceB')], BOUGH_REG = region('spruceC'), BEARD_REG = region('beard');
const SKIRT = col('#8fa69b'), SKIRT_OLD = col('#838f88');

export function spruce(seed, lod) {
  const rnd = rng(seed), b = new Builder(lod === 2 ? 160 : 260), cut = new Builder(lod === 2 ? 200 : 900), bark = lod < 2 ? new Builder(80) : null;
  const H = 17 + rnd() * 13, R = H * (0.14 + rnd() * 0.05), r0 = 0.1 + H * 0.013;
  const tiers = lod === 0 ? 14 : lod === 1 ? 10 : 5;
  const lowest = (lod === 2 ? 0.12 : 0.07) + rnd() * (lod === 2 ? 0.16 : 0.26);          // how much of the trunk is bare: near trees let the eye in under the boughs
  const trunk = [[0, -0.5, 0, r0 * 1.6], [0, 0.12, 0, r0 * 1.3], [0, 0.7, 0, r0 * 1.02], [0, H * 0.2, 0, r0 * 0.84], [0, H * 0.45, 0, r0 * 0.6], [0, H * 0.75, 0, r0 * 0.34], [0, H, 0, 0.025]];
  if (bark) tube(bark, trunk, lod === 1 ? 5 : 8, (i, j, t) => { const k = (i < 2 ? 0.62 : 1) * (1 - t * 0.45); return [k, k, k]; }, null, false, BARK_U.spruce);
  else tube(b, [trunk[0], trunk[2], trunk[4], trunk[6]], 3, (i, j, t) => mulCol(BARK, (0.8 + 0.3 * ((j * 7 + i * 3) % 5) / 5) * (1 - t * 0.3)));
  for (let i = 0; i < tiers; i++) {
    const t = (i + 0.35) / tiers;                                  // 0 at the top .. 1 at the lowest skirt
    const y = H * (0.985 - (1 - lowest) * Math.pow(t, 0.94));
    const r = R * (0.1 + 0.9 * Math.pow(t, 0.72)) * (0.84 + 0.3 * rnd());
    const drop = (H * (1 - lowest) / tiers) * (1.05 + 0.75 * t) * (0.9 + 0.3 * rnd());
    const twist = rnd() * TAU, hue = 0.8 + 0.36 * rnd(), old = Math.pow(t, 3) * 0.6, sway = 0.25 + 0.75 * t;
    // near: the skirt is a bell of painted boughs wrapped round the trunk, its hem cut ragged by the painting itself
    const cols = lod === 2 ? 4 : Math.max(4, Math.min(lod === 0 ? 11 : 7, Math.round(TAU * r / (lod === 0 ? 1.7 : 2.4))));
    const hemR = [], hemY = [];
    for (let c = 0; c < cols; c++) { hemR.push(r * (0.86 + 0.3 * rnd())); hemY.push(y - drop * (0.82 + 0.36 * rnd())); }
    const tint = mulCol(mixCol(SKIRT, SKIRT_OLD, old), hue);
    for (let c = 0; c < cols; c++) {
      const c1 = (c + 1) % cols, reg = SKIRT_REG[(i + c) & 1], vm = reg[1] + (reg[3] - reg[1]) * 0.4;
      const corner = (k, u) => {
        const th = twist + (c + k) / cols * TAU, cs = Math.cos(th), sn = Math.sin(th), cc = k ? c1 : c;
        const a = cut.vert(cs * r * 0.05, y + drop * 0.45, sn * r * 0.05, cs, 1.7, sn, mulCol(tint, lod === 2 ? 1.0 : 0.6), u, reg[1], 0);
        const m = lod === 2 ? -1 : cut.vert(cs * hemR[cc] * 0.74, y + drop * 0.06, sn * hemR[cc] * 0.74, cs, 1.3, sn, mulCol(tint, 1.2), u, vm, sway * 0.3);
        const h = cut.vert(cs * hemR[cc], hemY[cc], sn * hemR[cc], cs, 0.1, sn, mulCol(tint, 0.62), u, reg[3], sway);
        return [a, m, h];
      };
      const L = corner(0, reg[0]), Rr = corner(1, reg[2]);
      if (lod === 2) cut.quad(L[0], Rr[0], Rr[2], L[2]); else { cut.quad(L[0], Rr[0], Rr[1], L[1]); cut.quad(L[1], Rr[1], Rr[2], L[2]); }
    }
    // on the nearest trees, a few boughs that reach out past the skirt and bow at the tip
    if (lod === 0 && i > 3 && i % 3 === 0) for (let q = 0; q < 2; q++) {
      const th = twist + rnd() * TAU, cs = Math.cos(th), sn = Math.sin(th), L = r * (1.05 + rnd() * 0.3), w = L * 0.3, y0 = y + drop * 0.1, tintB = mulCol(tint, 1.05);
      const um = (BOUGH_REG[0] + BOUGH_REG[2]) / 2;
      const v = (d, side, yy, u, vv, bend) => cut.vert(cs * d - sn * side, yy, sn * d + cs * side, cs * 0.3, 1, sn * 0.3, tintB, u, vv, bend);
      const a1 = v(L * 0.2, -w * 0.4, y0, BOUGH_REG[0], BOUGH_REG[1], 0.1), a2 = v(L * 0.2, w * 0.4, y0, BOUGH_REG[0], BOUGH_REG[3], 0.1);
      const b1 = v(L * 0.65, -w, y0 - drop * 0.45, um, BOUGH_REG[1], sway * 0.6), b2 = v(L * 0.65, w, y0 - drop * 0.45, um, BOUGH_REG[3], sway * 0.6);
      const c1 = v(L, -w * 0.6, y0 - drop * 1.0, BOUGH_REG[2], BOUGH_REG[1], sway), c2 = v(L, w * 0.6, y0 - drop * 1.0, BOUGH_REG[2], BOUGH_REG[3], sway);
      cut.quad(a1, a2, b2, b1); cut.quad(b1, b2, c2, c1);
    }
  }
  // the dead lower limbs, and the grey beards of lichen that hang from them
  if (lod < 2) {
    const sticks = 4 + Math.floor(rnd() * 5);
    for (let k = 0; k < sticks; k++) {
      const th = rnd() * TAU, y = H * (0.04 + rnd() * lowest * 0.95), len = 1 + rnd() * 2.4, cs = Math.cos(th), sn = Math.sin(th);
      tube(b, [[cs * r0 * 0.5, y, sn * r0 * 0.5, 0.05], [cs * len * 0.55, y - len * 0.08, sn * len * 0.55, 0.032], [cs * len, y - len * 0.34, sn * len, 0.012]], 3, () => STICK);
      if (lod === 0 && rnd() < 0.7) {
        const cx = cs * len * 0.6, cz = sn * len * 0.6, cy = y - len * 0.1, w = 0.16, l = 0.5 + rnd() * 0.7;
        card(cut, [cx - cs * w, cy, cz - sn * w], [cx + cs * w, cy, cz + sn * w], [cx + cs * w, cy - l, cz + sn * w], [cx - cs * w, cy - l, cz - sn * w], [-sn, 0.6, cs], BEARD_REG, LICHEN, 0.1, 0.5);
      }
    }
  }
  return { solid: b, leaf: null, cut, bark, height: H, radius: R };
}

// ------------------------------------------------------------------------------------------------ pine
const PINE_REG = [region('pine')];
export function pine(seed, lod) {
  const rnd = rng(seed), b = new Builder(200), leaf = null, cut = new Builder(300), bark = lod < 2 ? new Builder(120) : null;
  const H = 15 + rnd() * 10, r0 = 0.16 + H * 0.011, ph = rnd() * TAU, wob = H * (0.02 + rnd() * 0.035);
  const at = (t) => [Math.sin(t * 2.6 + ph) * wob * t, H * t, Math.cos(t * 2.1 + ph) * wob * t];
  const ring = (t) => { const p = at(t); return [p[0], p[1], p[2], r0 * (1 - t * 0.72)]; };
  if (bark) {
    // grey plates below, and from half way up the thin red-gold bark that takes any light there is
    tube(bark, [[0, -0.5, 0, r0 * 1.6], [0, 0.15, 0, r0 * 1.25], ring(0.06), ring(0.2), ring(0.36), ring(0.5)], lod === 1 ? 5 : 8, (i) => { const k = i < 2 ? 0.6 : 0.95; return [k, k, k]; }, null, false, BARK_U.pine);
    tube(bark, [ring(0.5), ring(0.62), ring(0.75), ring(0.88), ring(1)], lod === 1 ? 5 : 7, (i, j, t) => { const k = 0.95 - t * 0.2; return [k, k, k]; }, null, false, BARK_U.red);
  } else tube(b, [[0, -0.5, 0, r0 * 1.5], ring(0.3), ring(0.65), ring(1)], 3, (i, j, t) => mulCol(mixCol(BARK_PINE, BARK_RED, Math.min(1, Math.max(0, (t - 0.42) * 2.6))), 0.8 + 0.3 * (((i * 5 + j * 3) % 7) / 7)));
  // the crown: a few dark clouds of needles, flat beneath, set at different heights round the top of the mast
  const cushions = lod === 2 ? 3 : 5 + Math.floor(rnd() * 3);
  for (let k = 0; k < cushions; k++) {
    const t = k === 0 ? 1 : 0.66 + rnd() * 0.32, p = at(t), th = ph + k * 2.4 + rnd(), wide = k === 0 ? 0 : H * (0.06 + rnd() * 0.11), a = H * (0.07 + rnd() * 0.06) * (lod === 2 ? 1.2 : 1);
    const reach = lod === 2 ? Math.min(wide, a * 0.7) : wide;      // far off there are no limbs drawn to carry a cushion: it must touch the mast, or it floats
    const cx = p[0] + Math.cos(th) * reach, cz = p[2] + Math.sin(th) * reach, cy = p[1] + (k === 0 ? 0.3 : reach * 0.3);
    if (k > 0 && lod < 2) tube(b, [[p[0], p[1] - a * 0.5, p[2], r0 * 0.24], [(p[0] + cx) / 2, cy - a * 0.5, (p[2] + cz) / 2, r0 * 0.17], [cx, cy - a * 0.05, cz, r0 * 0.08]], 3, () => mulCol(BARK_RED, 0.7));
    const hue = 0.85 + rnd() * 0.3; bell(cut, cx, cy, cz, a, a * 0.5, a * 0.5, lod === 0 ? 7 : lod === 1 ? 5 : 4, PINE_REG, (q) => mulCol(SKIRT, hue * [1.1, 1.2, 0.95, 0.8][q]), 0.5, rnd, lod === 2);
  }
  // the stubs of branches the tree has shed on its way up
  if (lod < 2) for (let k = 0; k < 5; k++) { const t = 0.28 + rnd() * 0.38, p = at(t), th = rnd() * TAU, l = 0.5 + rnd() * 1.4; tube(b, [[p[0], p[1], p[2], 0.05], [p[0] + Math.cos(th) * l, p[1] + l * 0.2, p[2] + Math.sin(th) * l, 0.015]], 3, () => STICK); }
  return { solid: b, leaf, cut, bark, height: H, radius: H * 0.16 };
}

// ------------------------------------------------------------------------------------------------ birch
const BIRCH_REG = [region('birch'), region('birchB')];
export function birch(seed, lod) {
  const rnd = rng(seed), b = new Builder(300), leaf = null, cut = new Builder(600), bark = lod < 2 ? new Builder(300) : null;
  const H = 9 + rnd() * 7, r0 = 0.1 + H * 0.01, la = rnd() * TAU, lean = 0.06 + rnd() * 0.22;
  const sides = lod === 2 ? 3 : lod === 1 ? 5 : 7;
  const stem = (x0, y0, z0, dx, dz, top, r, rings) => {
    const pts = [];
    for (let i = 0; i <= rings; i++) { const t = i / rings, k = t * (1.6 - 0.6 * t); pts.push([x0 + dx * k, y0 + (top - y0) * t, z0 + dz * k, r * (1 - t * 0.82) + 0.012]); }
    if (bark) tube(bark, pts, sides, (i, j, t) => { const h = (y0 + (top - y0) * t) / H, k = h < 0.06 ? 0.32 : h > 0.8 ? 0.36 : 0.62; return [k, k, k]; }, null, false, BARK_U.birch);
    else tube(b, pts, sides, (i, j, t) => (y0 + (top - y0) * t) / H > 0.74 ? TWIG : mulCol(BIRCH, 0.9));
    return pts;
  };
  const fork = H * (0.38 + rnd() * 0.2), lx = Math.cos(la) * lean * H, lz = Math.sin(la) * lean * H;
  const trunk = stem(0, -0.4, 0, lx * (fork / H), lz * (fork / H), fork, r0, lod === 2 ? 2 : 6);
  const fx = trunk[trunk.length - 1][0], fz = trunk[trunk.length - 1][2], tips = [];
  const stems = 2 + (rnd() < 0.5 ? 1 : 0);
  for (let k = 0; k < stems; k++) {
    const a = la + (k - (stems - 1) / 2) * 1.5 + (rnd() - 0.5) * 0.6, sp = H * (0.09 + rnd() * 0.12), top = H * (0.86 + rnd() * 0.14);
    const pts = stem(fx, fork - 0.05, fz, Math.cos(a) * sp + lx * 0.4, Math.sin(a) * sp + lz * 0.4, top, r0 * 0.62, lod === 2 ? 2 : 5);
    tips.push([...pts[pts.length - 1], 1], [...pts[Math.max(1, pts.length - 3)], 0.8]);
    // the thin outer branches, which bow over and let the veil fall
    if (lod < 2) for (let q = 0; q < (lod === 0 ? 3 : 2); q++) {
      const p = pts[1 + q], a2 = a + (rnd() - 0.5) * 2.6, l = H * (0.1 + rnd() * 0.12), ex = p[0] + Math.cos(a2) * l, ez = p[2] + Math.sin(a2) * l, ey = p[1] + l * 0.6;
      tube(b, [[p[0], p[1], p[2], 0.04], [(p[0] + ex) / 2, ey + l * 0.12, (p[2] + ez) / 2, 0.024], [ex, ey, ez, 0.01]], 3, () => TWIG, (t) => t * 0.4);
      tips.push([ex, ey, ez, 0, 0.9]);
    }
  }
  for (const p of tips) {
    const size = p[4] ?? p[3] ?? 1;
    const r = H * (0.055 + rnd() * 0.035) * (0.7 + 0.5 * size) * (lod === 2 ? 1.5 : 1), v = 0.75 + rnd() * 0.4;
    bell(cut, p[0], p[1] + r * 0.2, p[2], r, r * 0.7, H * (0.13 + rnd() * 0.12), lod === 0 ? 6 : 4, BIRCH_REG, (q) => mulCol(WHITE, v * [0.95, 1, 0.85, 0.62][q]), 1, rnd, lod === 2);
  }
  return { solid: b, leaf, cut, bark, height: H, radius: H * 0.2 };
}

// ------------------------------------------------------------------------------------------------ the golden tree
// The trees of Glasir: broad and old, silver in the bole, and every leaf a red-gold coin that gives a little light.
const GOLD_TOP = col('#ffe488'), GOLD = col('#f2b838'), GOLD_RED = col('#d8842a'), SILVER = col('#b9b4aa'), SILVER_DARK = col('#4d4742');
export function goldTree(seed, lod) {
  const rnd = rng(seed), b = new Builder(300), leaf = null, cut = new Builder(900), bark = lod < 2 ? new Builder(300) : null;
  const H = 12 + rnd() * 8, r0 = 0.32 + H * 0.02, sides = lod === 2 ? 4 : lod === 1 ? 6 : 9;
  const bole = (i, j, t) => mulCol(mixCol(SILVER_DARK, SILVER, Math.min(1, t * 3 + 0.15)), 0.8 + 0.35 * (((i * 3 + j * 5 + seed) % 7) / 7));
  const pale = (i, j, t) => { const k = i < 2 ? 0.4 : 0.62; return [k, k, k * 0.96]; };
  const split = H * (0.24 + rnd() * 0.1);
  const base = [[0, -0.5, 0, r0 * 1.8], [0, 0.15, 0, r0 * 1.35], [0, 0.8, 0, r0 * 1.02], [0, split * 0.6, 0, r0 * 0.92], [0, split, 0, r0 * 0.85]];
  if (bark) tube(bark, base, sides, pale, null, false, BARK_U.birch); else tube(b, [base[0], base[2], base[4]], sides, bole);
  const limbs = lod === 2 ? 3 : 3 + Math.floor(rnd() * 2), a0 = rnd() * TAU;
  for (let k = 0; k < limbs; k++) {
    const a = a0 + k / limbs * TAU + (rnd() - 0.5) * 0.7, sp = H * (0.22 + rnd() * 0.2), top = H * (0.62 + rnd() * 0.3), cs = Math.cos(a), sn = Math.sin(a);
    const pts = [[0, split - 0.2, 0, r0 * 0.6], [cs * sp * 0.35, split + (top - split) * 0.4, sn * sp * 0.35, r0 * 0.42], [cs * sp * 0.8, split + (top - split) * 0.8, sn * sp * 0.8, r0 * 0.24], [cs * sp, top, sn * sp, r0 * 0.08]];
    if (bark) tube(bark, pts, Math.max(4, sides - 3), () => [0.55, 0.55, 0.53], null, false, BARK_U.birch); else tube(b, pts, 3, (i, j, t) => bole(i + 3, j, 0.4 + t));
    const clouds = lod === 2 ? 1 : 3 + Math.floor(rnd() * 2);
    for (let q = 0; q < clouds; q++) {
      const p = pts[q === 0 ? 3 : 1 + Math.floor(rnd() * 2.99)], a2 = rnd() * TAU, off = q === 0 ? 0 : H * (0.06 + rnd() * 0.1);
      const rad = H * (q === 0 ? 0.17 + rnd() * 0.07 : 0.1 + rnd() * 0.07) * (lod === 2 ? 1.3 : 1), cx = p[0] + Math.cos(a2) * off, cz = p[2] + Math.sin(a2) * off, cy = p[1] + rad * 0.25;
      const warm = rnd(), body = mixCol(GOLD, GOLD_RED, warm * warm * 0.7);
      bell(cut, cx, cy, cz, rad, rad * 0.6, rad * (0.7 + rnd() * 0.7), lod === 0 ? 8 : lod === 1 ? 6 : 5, BIRCH_REG, (z) => z === 0 ? mixCol(body, GOLD_TOP, 0.6) : z === 1 ? mixCol(body, GOLD_TOP, 0.3) : z === 2 ? body : mixCol(body, GOLD_RED, 0.6), 0.6, rnd, lod === 2);
    }
  }
  return { solid: b, leaf, cut, bark, height: H, radius: H * 0.42 };
}

// ------------------------------------------------------------------------------------------------ dead wood and stone
/** A dead tree still standing: silver, broken off, with the stubs of its limbs. */
export function snag(seed, lod) {
  const rnd = rng(seed), b = new Builder(200), H = 5 + rnd() * 9, r0 = 0.2 + rnd() * 0.16, grey = col('#7b766e'), la = rnd() * TAU, lean = rnd() * 0.12;
  const pts = []; for (let i = 0; i <= 5; i++) { const t = i / 5; pts.push([Math.cos(la) * lean * H * t, -0.4 + (H + 0.4) * t, Math.sin(la) * lean * H * t, r0 * (1 - t * 0.6)]); }
  tube(b, pts, lod === 2 ? 4 : 6, (i, j, t) => mulCol(grey, 0.62 + 0.5 * (((i * 5 + j * 3) % 6) / 6)), null, col('#3a3530'));
  if (lod < 2) for (let k = 0; k < 5; k++) { const p = pts[1 + Math.floor(rnd() * 4)], th = rnd() * TAU, l = 0.6 + rnd() * 1.8; tube(b, [[p[0], p[1], p[2], 0.06], [p[0] + Math.cos(th) * l, p[1] + l * (rnd() - 0.3) * 0.6, p[2] + Math.sin(th) * l, 0.018]], 3, () => mulCol(grey, 0.7)); }
  return { solid: b, leaf: null, cut: null, height: H, radius: 1 };
}

/** A boulder with moss on its shoulders and lichen where the moss has not come. */
export function boulder(seed, detail = 1, mossy = 1) {
  const b = new Builder(180), rnd = rng(seed), sx = 0.8 + rnd() * 0.5, sy = 0.5 + rnd() * 0.35, sz = 0.8 + rnd() * 0.5;
  lump(b, 0, sy * 0.25, 0, sx, sy, sz, detail, seed, 0.3, (nx, ny, nz, w) => {
    const rock = mulCol(mixCol(ROCK_DARK, ROCK, w * 1.3), 0.8 + 0.3 * ny);
    const m = Math.min(1, Math.max(0, (ny - 0.32 + (w - 0.5) * 0.9) * 3)) * mossy;
    return mixCol(rock, mixCol(MOSS, MOSS_LIGHT, w), m);
  }, 0.5, 0, 0.1);
  return { solid: b, leaf: null, cut: null, height: sy * 1.3, radius: Math.max(sx, sz) };
}

/** A fallen trunk, mossed along its back, lying along x. */
export function log(seed) {
  const b = new Builder(120), rnd = rng(seed), L = 4 + rnd() * 5, r = 0.2 + rnd() * 0.18, pts = [];
  for (let i = 0; i <= 4; i++) { const t = i / 4; pts.push([(t - 0.5) * L, r * 0.75 + Math.sin(t * 3 + seed) * 0.08, Math.sin(t * 2 + seed) * 0.2, r * (1 - t * 0.35)]); }
  tube(b, pts, 6, (i, j, t) => { const up = Math.sin(j / 6 * TAU); return up > 0.3 ? mixCol(MOSS, MOSS_LIGHT, (i + j) % 3 / 3) : mulCol(BARK, 0.7 + 0.3 * ((i + j) % 4) / 4); }, null, col('#8a7458'));
  return { solid: b, leaf: null, cut: null, height: r * 2, radius: L / 2 };
}

/** A root that leaves the bank, arches, and goes down into the water. */
export function root(seed) {
  const b = new Builder(60), rnd = rng(seed), L = 1.2 + rnd() * 1.6, h = 0.25 + rnd() * 0.45, r = 0.06 + rnd() * 0.06, pts = [];
  for (let i = 0; i <= 5; i++) { const t = i / 5; pts.push([t * L, Math.sin(t * Math.PI) * h + 0.25 * (1 - t) - 0.35 * t, Math.sin(t * 4 + seed) * 0.12, r * (1 - t * 0.5)]); }
  tube(b, pts, 4, (i, j) => mulCol(BARK, 0.6 + 0.3 * ((i + j) % 3) / 3));
  return { solid: b, leaf: null, cut: null, height: h, radius: L };
}

/** Fly agaric: the one red thing in the Ironwood. */
export function mushroom(seed) {
  const b = new Builder(60), rnd = rng(seed), h = 0.1 + rnd() * 0.1, r = 0.06 + rnd() * 0.06, red = col('#b8261a'), white = col('#efe8d8');
  tube(b, [[0, -0.02, 0, r * 0.3], [0, h, 0, r * 0.24]], 4, () => white);
  const top = b.vert(0, h + r * 0.62, 0, 0, 1, 0, red), ring = [], rim = [];
  for (let j = 0; j < 6; j++) { const th = j / 6 * TAU, cs = Math.cos(th), sn = Math.sin(th);
    ring.push(b.vert(cs * r * 0.62, h + r * 0.44, sn * r * 0.62, cs, 1, sn, j % 2 ? white : red)); rim.push(b.vert(cs * r, h + r * 0.05, sn * r, cs, 0.3, sn, mulCol(red, 0.8))); }
  for (let j = 0; j < 6; j++) { const j1 = (j + 1) % 6; b.tri(top, ring[j1], ring[j]); b.quad(ring[j], ring[j1], rim[j1], rim[j]); }
  return { solid: b, leaf: null, cut: null, height: h, radius: r };
}

// ------------------------------------------------------------------------------------------------ small growth (cut-outs)
const FERN_REG = region('fern'), GRASS_REG = region('grass'), REED_REG = region('reed'), HEATH_REG = region('heath'), LILY_REG = region('lily'), BLOOM_REG = region('bloom'), LEAF_REG = region('leaf');

/** A fern: a ring of fronds that rise and bow over. */
export function fern(seed) {
  const cut = new Builder(80), rnd = rng(seed), n = 7 + Math.floor(rnd() * 3), a0 = rnd() * TAU;
  for (let k = 0; k < n; k++) {
    const a = a0 + k / n * TAU + (rnd() - 0.5) * 0.4, cs = Math.cos(a), sn = Math.sin(a), L = 0.42 + rnd() * 0.3, w = 0.1 + rnd() * 0.04, rise = 0.6 + rnd() * 0.4;
    const mx = cs * L * 0.5, mz = sn * L * 0.5, my = rise * L * 0.8, ex = cs * L, ez = sn * L, ey = rise * L * 0.42;
    const um = (FERN_REG[0] + FERN_REG[2]) / 2, c = mulCol([1, 1, 1], 0.8 + rnd() * 0.3);
    // the picture runs foot (left) to tip (right): two lengths of it, bent at the middle
    const v = (x, y, z, u, vv, bend) => cut.vert(x, y, z, cs * 0.3, 0.9, sn * 0.3, c, u, vv, bend);
    const a1 = v(-sn * w * 0.3, 0.02, cs * w * 0.3, FERN_REG[0], FERN_REG[1], 0), a2 = v(sn * w * 0.3, 0.02, -cs * w * 0.3, FERN_REG[0], FERN_REG[3], 0);
    const b1 = v(mx - sn * w, my, mz + cs * w, um, FERN_REG[1], 0.4), b2 = v(mx + sn * w, my, mz - cs * w, um, FERN_REG[3], 0.4);
    const c1 = v(ex - sn * w * 0.5, ey, ez + cs * w * 0.5, FERN_REG[2], FERN_REG[1], 1), c2 = v(ex + sn * w * 0.5, ey, ez - cs * w * 0.5, FERN_REG[2], FERN_REG[3], 1);
    cut.quad(a1, a2, b2, b1); cut.quad(b1, b2, c2, c1);
  }
  return { solid: null, leaf: null, cut, height: 0.6, radius: 1 };
}

/** Two or three crossed cards standing on the ground: grass, heath, or reeds standing in the shallows. */
export function tuft(seed, kind) {
  const cut = new Builder(16), rnd = rng(seed), reg = kind === 'reed' ? REED_REG : kind === 'heath' ? HEATH_REG : GRASS_REG;
  const n = kind === 'reed' ? 3 : 2, h = kind === 'reed' ? 1.5 + rnd() * 0.9 : kind === 'heath' ? 0.35 + rnd() * 0.2 : 0.4 + rnd() * 0.35, w = kind === 'reed' ? 0.45 + rnd() * 0.2 : 0.4 + rnd() * 0.3, a0 = rnd() * TAU;
  for (let k = 0; k < n; k++) {
    const a = a0 + k / n * Math.PI, cs = Math.cos(a), sn = Math.sin(a), ox = (rnd() - 0.5) * 0.2, oz = (rnd() - 0.5) * 0.2, c = mulCol([1, 1, 1], 0.8 + rnd() * 0.3);
    card(cut, [ox - cs * w, h, oz - sn * w], [ox + cs * w, h, oz + sn * w], [ox + cs * w, -0.06, oz + sn * w], [ox - cs * w, -0.06, oz - sn * w], [0, 1, 0], reg, c, kind === 'reed' ? 1 : 0.6, 0, mulCol(c, 0.7));
  }
  return { solid: null, leaf: null, cut, height: h, radius: w };
}

/** A lily pad lying on the water; with `bloom`, a white lily open on it. */
export function lily(seed, bloom) {
  const cut = new Builder(12), rnd = rng(seed), r = 0.2 + rnd() * 0.14, a = rnd() * TAU, cs = Math.cos(a) * r, sn = Math.sin(a) * r, c = mulCol([1, 1, 1], 0.75 + rnd() * 0.35);
  card(cut, [-cs + sn, 0.012, -sn - cs], [cs + sn, 0.012, sn - cs], [cs - sn, 0.012, sn + cs], [-cs - sn, 0.012, -sn + cs], [0, 1, 0], LILY_REG, c, 0, 0);
  if (bloom) { const q = r * 0.55; card(cut, [-q, 0.07, -q], [q, 0.07, -q], [q, 0.07, q], [-q, 0.07, q], [0, 1, 0], BLOOM_REG, [1.25, 1.25, 1.25], 0, 0); }
  return { solid: null, leaf: null, cut, height: 0.05, radius: r };
}

/** A fallen leaf lying on the water or the ground. */
export function fallenLeaf(seed) {
  const cut = new Builder(4), rnd = rng(seed), r = 0.06 + rnd() * 0.05, a = rnd() * TAU, cs = Math.cos(a) * r, sn = Math.sin(a) * r;
  card(cut, [-cs + sn, 0.014, -sn - cs], [cs + sn, 0.014, sn - cs], [cs - sn, 0.014, sn + cs], [-cs - sn, 0.014, -sn + cs], [0, 1, 0], LEAF_REG, WHITE, 0, 0);
  return { solid: null, leaf: null, cut, height: 0.02, radius: r };
}
