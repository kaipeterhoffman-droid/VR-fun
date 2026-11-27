// Craft: what hands have made, as against what has grown. The canoe and all that is in it, the lantern at her bow,
// the paddle; and the same shipwright's work at five times the size, for the ship the mere remembers.
//
// The canoe is the nearest thing to the eye for the whole journey, so she is built plank by plank: overlapping
// strakes (clinker, the northern way), ribs, thwarts, a carved stem that ends in a curl, a rope coiled in the bow.
// Local frame of everything here: the bow is toward -z, +y is up, the water is at y = 0.
import * as THREE from 'three';
import { Builder, col, mulCol } from './build.js';
import { tube } from './flora.js';
import { WOOD_U } from './art.js';

const TAU = Math.PI * 2;
const WHITE = [1, 1, 1], IRON = [0.2, 0.21, 0.24], ROPE = [0.95, 0.84, 0.6];

/** One flat face: corners round it, P0 and P1 on the strip's first edge. Its normal comes from smoothNormals(). */
export function face(b, P0, P1, P2, P3, U, v0, v1, c0 = WHITE, c1 = null) {
  const a = b.vert(P0[0], P0[1], P0[2], 0, 1, 0, c0, U[0], v0), d = b.vert(P1[0], P1[1], P1[2], 0, 1, 0, c0, U[1], v0);
  const e = b.vert(P2[0], P2[1], P2[2], 0, 1, 0, c1 || c0, U[1], v1), f = b.vert(P3[0], P3[1], P3[2], 0, 1, 0, c1 || c0, U[0], v1);
  b.quad(a, d, e, f);
}
/** A plank or beam between two points: four faces round it (its ends are left open, to be buried in something). */
export function beam(b, A, B, wide, thick, upHint, U, c = WHITE, vScale = 1.3) {
  const ax = B[0] - A[0], ay = B[1] - A[1], az = B[2] - A[2], l = Math.hypot(ax, ay, az) || 1, t = [ax / l, ay / l, az / l];
  let s = [t[1] * upHint[2] - t[2] * upHint[1], t[2] * upHint[0] - t[0] * upHint[2], t[0] * upHint[1] - t[1] * upHint[0]]; const sl = Math.hypot(...s) || 1; s = s.map((v) => v / sl * wide / 2);
  let u = [s[1] * t[2] - s[2] * t[1], s[2] * t[0] - s[0] * t[2], s[0] * t[1] - s[1] * t[0]]; const ul = Math.hypot(...u) || 1; u = u.map((v) => v / ul * thick / 2);
  const P = (base, i, j) => [base[0] + s[0] * i + u[0] * j, base[1] + s[1] * i + u[1] * j, base[2] + s[2] * i + u[2] * j];
  const v1 = l / vScale;
  for (const [i0, j0, i1, j1] of [[-1, 1, 1, 1], [1, 1, 1, -1], [1, -1, -1, -1], [-1, -1, -1, 1]]) face(b, P(A, i0, j0), P(A, i1, j1), P(B, i1, j1), P(B, i0, j0), U, 0, v1, c);
}

/**
 * A clinker hull. o: { L, beam, draft, sheerMid, sheerEnd, floorY, N (stations), K (strakes), lap, skin, ribs,
 * out, inn (strips of the wood sheet), tintOut, tintIn, floor }.
 * Returns the builder and the hull's lines: half(t), sheerY(t), edge(t, k) with t = -1 at the bow .. 1 at the stern.
 */
export function buildHull(o) {
  const { L, beam: BM, draft, sheerMid, sheerEnd, floorY = 0.035, N = 18, K = 5, lap = 0.012, skin = 0.014, ribs = 8,
    out = WOOD_U.strake, inn = WOOD_U.strake, tintOut = WHITE, tintIn = WHITE, floor = true, inside = true, grain = 1.3 } = o;
  const b = new Builder(2400);
  const half = (t) => BM / 2 * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(t), 2.3)), 0.72);
  const keelY = (t) => -draft * (1 - Math.pow(Math.abs(t), 3));
  const sheerY = (t) => sheerMid + (sheerEnd - sheerMid) * Math.pow(Math.abs(t), 2.6);
  const full = (t) => 0.72 + 0.75 * Math.pow(Math.abs(t), 1.5);            // boxy amidships, a V toward the stems
  // the point where plank edge k crosses the section at t: 0 the keel, 1 at the height of the floor, K the sheer
  const edge = (t, k) => {
    const e = full(t), ky = keelY(t), sy = sheerY(t), bh = half(t);
    const y1 = Math.min(0.9, Math.max(0.02, (floorY - ky) / (sy - ky)));
    const phi = k === 0 ? Math.PI / 2 : Math.asin(Math.pow(1 - y1, 1 / e)) * (1 - (k - 1) / (K - 1));
    return [bh * Math.pow(Math.cos(phi), e), ky + (sy - ky) * (1 - Math.pow(Math.sin(phi), e))];
  };
  // the same point on the inner face of the planking
  const inner = (t, k) => {
    const a = edge(t, Math.max(0, k - 1)), c = edge(t, Math.min(K, k + 1)), p = edge(t, k);
    let tx = c[0] - a[0], ty = c[1] - a[1]; const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
    return [Math.max(0, p[0] - ty * skin), p[1] + tx * skin, ty, -tx];        // x, y, and the outward normal
  };
  const tAt = (i) => Math.sin((i / N - 0.5) * Math.PI);                      // stations crowd toward the stems, where the lines turn
  for (const side of [-1, 1]) {
    // the planking, from outside: every plank's lower edge stands proud of the plank below it, and its upper edge
    // is in the shadow of the one above
    for (let k = 0; k < K; k++) {
      const first = b.nv;
      for (let i = 0; i <= N; i++) {
        const t = tAt(i), z = t * L / 2, lo = edge(t, k), hi = edge(t, k + 1), v = z / grain + k * 0.37 + (side > 0 ? 0.5 : 0);
        const push = (k > 0 ? lap : 0) * Math.min(1, half(t) / (BM * 0.1));
        b.vert(side * (lo[0] + push), lo[1] - push * 0.3, z, side, 0, 0, tintOut, out[0], v);
        b.vert(side * hi[0], hi[1], z, side, 0, 0, mulCol(tintOut, k === K - 1 ? 0.92 : 0.58), out[1], v);
      }
      for (let i = 0; i < N; i++) { const A = first + i * 2, B = A + 2; if (side > 0) b.quad(A, A + 1, B + 1, B); else b.quad(A, B, B + 1, A + 1); }
    }
    if (!inside) continue;
    // ...and from inside
    for (let k = 1; k < K; k++) {
      const first = b.nv;
      for (let i = 0; i <= N; i++) {
        const t = tAt(i), z = t * L / 2, lo = inner(t, k), hi = inner(t, k + 1), v = z / grain + k * 0.21 + (side > 0 ? 0.3 : 0.8);
        b.vert(side * lo[0], lo[1], z, -side, 0, 0, mulCol(tintIn, 0.5 + 0.4 * (k - 1) / K), inn[0], v);
        b.vert(side * hi[0], hi[1], z, -side, 0, 0, mulCol(tintIn, 0.62 + 0.4 * k / K), inn[1], v);
      }
      for (let i = 0; i < N; i++) { const A = first + i * 2, B = A + 2; if (side > 0) b.quad(A, B, B + 1, A + 1); else b.quad(A, A + 1, B + 1, B); }
    }
    // the ribs: bent frames that stand a finger's width proud of the planking
    for (let r = 0; r < ribs; r++) {
      const t = -0.84 + 1.68 * (r + 0.5) / ribs, z = t * L / 2, w = Math.max(0.014, L * 0.0035), deep = w * 1.5;
      for (let k = 1; k < K; k++) {
        const p = inner(t, k), q = inner(t, k + 1);
        const P0 = [side * p[0], p[1]], P1 = [side * q[0], q[1]], Q0 = [side * (p[0] - p[2] * deep), p[1] - p[3] * deep], Q1 = [side * (q[0] - q[2] * deep), q[1] - q[3] * deep];
        const c = mulCol(tintIn, 0.8);
        face(b, [Q0[0], Q0[1], z - w], [Q0[0], Q0[1], z + w], [Q1[0], Q1[1], z + w], [Q1[0], Q1[1], z - w], WOOD_U.pale, k * 0.1, k * 0.1 + 0.1, c);
        face(b, [P0[0], P0[1], z - w], [Q0[0], Q0[1], z - w], [Q1[0], Q1[1], z - w], [P1[0], P1[1], z - w], WOOD_U.pale, k * 0.1, k * 0.1 + 0.1, mulCol(c, 0.6));
        face(b, [Q0[0], Q0[1], z + w], [P0[0], P0[1], z + w], [P1[0], P1[1], z + w], [Q1[0], Q1[1], z + w], WOOD_U.pale, k * 0.1, k * 0.1 + 0.1, mulCol(c, 0.6));
      }
    }
  }
  // the bottom boards: three planks laid along her, a little above the water outside
  if (floor && inside) for (let pl = 0; pl < 3; pl++) {
    const first = b.nv;
    for (let i = 0; i <= N; i++) {
      const t = tAt(i), z = t * L / 2, w = inner(t, 1)[0], v = z / grain + pl * 0.29;
      b.vert(w * (-1 + pl * 2 / 3), floorY, z, 0, 1, 0, mulCol(tintIn, 0.5), inn[0], v);
      b.vert(w * (-1 + (pl + 1) * 2 / 3), floorY, z, 0, 1, 0, mulCol(tintIn, 0.8), inn[1], v);
    }
    for (let i = 0; i < N; i++) { const A = first + i * 2, B = A + 2; b.quad(A, B, B + 1, A + 1); }
  }
  b.smoothNormals();
  return { b, half, sheerY, keelY, edge, inner, L, K };
}

/** A post that rises from the end of a hull and curls over on itself: the stem of a northern boat. */
export function stemPost(b, z0, dir, y0, y1, rise, R0, r, turns, U, tint) {
  // dir: -1 for a bow (it rakes forward and curls back toward the boat), +1 for a stern
  const cy = y1 + rise, cz = z0 - dir * R0 * 0.2, pts = [[0, y0, z0 - dir * 0.02, r * 1.15], [0, (y0 + y1) / 2, z0 + dir * 0.01, r * 1.05], [0, y1, z0 + dir * 0.03, r], [0, cy - R0 * 0.75, cz + dir * (R0 + 0.01), r * 0.95]];
  const n = Math.round(turns * 12);
  for (let i = 0; i <= n; i++) {
    const a = i / n * turns * TAU, R = R0 * (1 - 0.82 * i / n);
    pts.push([0, cy + Math.sin(a) * R, cz + dir * Math.cos(a) * R, r * (0.95 - 0.6 * i / n)]);
  }
  tube(b, pts, 6, (i, j, t) => mulCol(tint, 0.75 + 0.35 * (j % 2)), null, mulCol(tint, 0.7), U, r * 12.5);
}

/**
 * The canoe. Returns { hull: Builder (wood sheet), iron: Builder, lines, hook: [x, y, z] where the lantern hangs,
 * seats: [z, ...], sheerAt(z) }. `zc` is where her middle lies ahead of the paddler, who sits at the origin.
 */
export function buildCanoe(zc = -0.5) {
  const lines = buildHull({ L: 4.3, beam: 0.92, draft: 0.11, sheerMid: 0.29, sheerEnd: 0.42, tintOut: [0.9, 0.84, 0.8], tintIn: [1.0, 0.94, 0.86] });
  const { L, half, sheerY, inner } = lines, b = lines.b, zOf = (t) => t * L / 2;
  // the gunwales: a pale worn rail along each sheer
  for (const side of [-1, 1]) {
    const pts = []; for (let i = 0; i <= 22; i++) { const t = -0.985 + 1.97 * i / 22; pts.push([side * (half(t) + 0.004), sheerY(t) + 0.004, zOf(t), 0.017]); }
    tube(b, pts, 5, (i, j) => mulCol(WHITE, 0.7 + 0.3 * (j % 2)), null, false, WOOD_U.pale);
  }
  // the stems: carved, the forward one curling over, the after one a plain upswept horn
  stemPost(b, zOf(-1), -1, -0.02, sheerY(1), 0.24, 0.115, 0.034, 1.3, WOOD_U.carved, [0.86, 0.82, 0.78]);
  tube(b, [[0, -0.02, zOf(1) - 0.02, 0.036], [0, sheerY(1) * 0.5, zOf(1) + 0.0, 0.034], [0, sheerY(1), zOf(1) + 0.03, 0.03], [0, sheerY(1) + 0.14, zOf(1) + 0.08, 0.024], [0, sheerY(1) + 0.24, zOf(1) + 0.16, 0.012]], 6, (i, j) => mulCol([0.86, 0.82, 0.78], 0.75 + 0.35 * (j % 2)), null, true, WOOD_U.carved, 0.42);
  const tmp = new Builder(600);
  // the little decks in bow and stern
  for (const [t0, t1] of [[-0.995, -0.8], [0.995, 0.84]]) {
    const y = sheerY(t1) - 0.012, w = half(t1);
    const a = tmp.vert(0, sheerY(t0) - 0.012, zOf(t0), 0, 1, 0, WHITE, WOOD_U.grey[0], 0), c = tmp.vert(-w, y, zOf(t1), 0, 1, 0, mulCol(WHITE, 0.8), WOOD_U.grey[0], 0.3), d = tmp.vert(w, y, zOf(t1), 0, 1, 0, mulCol(WHITE, 0.8), WOOD_U.grey[1], 0.3);
    tmp.tri(a, c, d);
  }
  // the thwarts: the forward one, and the one she is paddled from
  for (const zs of [-0.78, -zc]) {
    const t = zs / (L / 2), w = inner(t, lines.K - 1)[0] + 0.01, y = sheerY(t) - 0.1;
    beam(tmp, [-w, y, zs], [w, y, zs], 0.17, 0.024, [0, 1, 0], WOOD_U.grey, [0.95, 0.93, 0.9]);
  }
  // a rope coiled down in the bow
  { const pts = [], cz = zOf(-0.66), turns = 3.6;
    for (let i = 0; i <= 54; i++) { const a = i / 54 * turns * TAU, R = 0.13 - 0.012 * (i / 54) * turns + (i > 42 ? (i - 42) * 0.004 : 0); pts.push([Math.cos(a) * R + 0.02, 0.05 + (i / 54) * 0.03, cz + Math.sin(a) * R, 0.0105]); }
    pts.push([0.19, 0.13, cz - 0.16, 0.0105], [0.2, 0.22, cz - 0.3, 0.0105]);
    tube(tmp, pts, 4, (i, j) => mulCol(ROPE, 0.6 + 0.4 * ((i + j) % 2)), null, true, WOOD_U.pale); }
  // a folded blanket under the forward thwart: the one red thing aboard
  { const cx = -0.07, cz = -0.98, w = 0.19, d = 0.13, y0 = 0.038, y1 = 0.115, RED = [0.62, 0.12, 0.07], CREAM = [0.9, 0.84, 0.7], ca = Math.cos(0.3), sa = Math.sin(0.3);
    const P = (x, y, z) => [cx + x * ca - z * sa, y, cz + x * sa + z * ca];
    const bands = [[-1, -0.62, RED], [-0.62, -0.5, CREAM], [-0.5, 0.5, RED], [0.5, 0.62, CREAM], [0.62, 1, RED]];
    for (const [u0, u1, c] of bands) {
      face(tmp, P(u0 * w, y1, -d), P(u1 * w, y1, -d), P(u1 * w, y1 + 0.006, d), P(u0 * w, y1 + 0.006, d), WOOD_U.pale, 0, 0.2, c);
      face(tmp, P(u0 * w, y0, d), P(u1 * w, y0, d), P(u1 * w, y1 + 0.006, d), P(u0 * w, y1 + 0.006, d), WOOD_U.pale, 0, 0.05, mulCol(c, 0.6), mulCol(c, 0.9));
      face(tmp, P(u1 * w, y0, -d), P(u0 * w, y0, -d), P(u0 * w, y1, -d), P(u1 * w, y1, -d), WOOD_U.pale, 0, 0.05, mulCol(c, 0.6), mulCol(c, 0.9));
    }
    for (const sx of [-1, 1]) face(tmp, P(sx * w, y0, -d * sx), P(sx * w, y0, d * sx), P(sx * w, y1 + 0.006, d * sx), P(sx * w, y1, -d * sx), WOOD_U.pale, 0, 0.05, mulCol(RED, 0.55), mulCol(RED, 0.85)); }
  tmp.smoothNormals(); b.add(tmp);
  // the lantern's crook: an iron rod stepped in the bow deck, bent forward over the water
  const zh = zOf(-0.87), yh = sheerY(-0.87) - 0.012;
  const crook = [[0, yh - 0.05, zh, 0.009], [0, yh + 0.2, zh - 0.015, 0.008], [0, yh + 0.31, zh - 0.07, 0.008], [0, yh + 0.355, zh - 0.16, 0.0075], [0, yh + 0.33, zh - 0.25, 0.007], [0, yh + 0.285, zh - 0.265, 0.006]];
  tube(b, crook, 5, () => IRON, null, true, WOOD_U.tar);
  const g = b.build({ bend: false });
  g.translate(0, 0, zc);
  return { geometry: g, hook: [0, yh + 0.275, zh - 0.262 + zc], lines, zc, bow: zOf(-1) + zc, stern: zOf(1) + zc };
}

/** The lantern that hangs from the crook: iron, with four panes of horn. Its origin is the ring it hangs by. */
export function buildLantern() {
  const b = new Builder(200), panes = new Builder(40), w = 0.052, top = -0.06, bot = -0.2;
  // the ring
  { const pts = []; for (let i = 0; i <= 8; i++) { const a = i / 8 * TAU; pts.push([0, -0.016 + Math.cos(a) * 0.016, Math.sin(a) * 0.016, 0.0035]); } tube(b, pts, 3, () => IRON, null, false, WOOD_U.tar); }
  const tmp = new Builder(80);
  // the cap, the base
  const ap = [0, -0.03, 0];
  for (let k = 0; k < 4; k++) {
    const a0 = (k + 0.5) / 4 * TAU, a1 = (k + 1.5) / 4 * TAU, r = w * 1.62;
    const i0 = tmp.vert(ap[0], ap[1], ap[2], 0, 1, 0, IRON, WOOD_U.tar[0], 0), i1 = tmp.vert(Math.cos(a0) * r, top - 0.008, Math.sin(a0) * r, 0, 1, 0, mulCol(IRON, 0.7), WOOD_U.tar[1], 0.1), i2 = tmp.vert(Math.cos(a1) * r, top - 0.008, Math.sin(a1) * r, 0, 1, 0, mulCol(IRON, 0.7), WOOD_U.tar[1], 0.1);
    tmp.tri(i0, i2, i1);
  }
  face(tmp, [-w * 1.1, bot, -w * 1.1], [w * 1.1, bot, -w * 1.1], [w * 1.1, bot, w * 1.1], [-w * 1.1, bot, w * 1.1], WOOD_U.tar, 0, 0.1, IRON);
  face(tmp, [-w * 1.1, bot - 0.012, w * 1.1], [w * 1.1, bot - 0.012, w * 1.1], [w * 1.1, bot - 0.012, -w * 1.1], [-w * 1.1, bot - 0.012, -w * 1.1], WOOD_U.tar, 0, 0.1, mulCol(IRON, 0.6));
  tmp.smoothNormals(); b.add(tmp);
  // the four corner bars, and the panes between them
  for (let k = 0; k < 4; k++) {
    const sx = k & 1 ? 1 : -1, sz = k & 2 ? 1 : -1;
    tube(b, [[sx * w, top - 0.006, sz * w, 0.0045], [sx * w, bot, sz * w, 0.0045]], 4, () => IRON, null, false, WOOD_U.tar);
  }
  const pw = w * 0.96;
  for (const [x0, z0, x1, z1] of [[-pw, -pw, pw, -pw], [pw, -pw, pw, pw], [pw, pw, -pw, pw], [-pw, pw, -pw, -pw]]) {
    const a = panes.vert(x0, top - 0.008, z0, 0, 0, 1, [0.7, 0.7, 0.7], 0, 0), c = panes.vert(x1, top - 0.008, z1, 0, 0, 1, [0.7, 0.7, 0.7], 1, 0);
    const d = panes.vert(x1, bot, z1, 0, 0, 1, WHITE, 1, 1), e = panes.vert(x0, bot, z0, 0, 0, 1, WHITE, 0, 1);
    panes.quad(a, c, d, e);
  }
  panes.smoothNormals();
  return { iron: b.build({ bend: false }), panes: panes.build({ bend: false }), flame: [0, -0.145, 0] };
}

/**
 * The paddle: a single blade of ash, long in the leaf, with a pear grip, and a band of carving at the throat.
 * It hangs down its own -y from the grip at the origin; the blade's faces look along +z and -z.
 */
export const PADDLE = { length: 1.52, blade: 0.52, half: 0.082 };
export function buildPaddle() {
  const b = new Builder(400), { length: Lp, blade: Lb, half: W } = PADDLE, y0 = -(Lp - Lb), ASH = [1, 0.96, 0.9];
  // the grip: a short bar across the top
  tube(b, [[-0.05, -0.012, 0, 0.012], [-0.035, -0.008, 0, 0.017], [0, 0, 0, 0.019], [0.035, -0.008, 0, 0.017], [0.05, -0.012, 0, 0.012]], 6, () => mulCol(ASH, 0.9), null, false, WOOD_U.pale);
  tube(b, [[0, -0.004, 0, 0.018], [0, -0.06, 0, 0.0165], [0, -0.3, 0, 0.0155], [0, y0 + 0.2, 0, 0.0155], [0, y0 + 0.18, 0, 0.0185]], 7, () => ASH, null, false, WOOD_U.pale);
  tube(b, [[0, y0 + 0.18, 0, 0.0185], [0, y0 + 0.07, 0, 0.0185], [0, y0 + 0.05, 0, 0.0165]], 7, () => [0.9, 0.86, 0.8], null, false, WOOD_U.carved, 0.22);       // the carved band
  tube(b, [[0, y0 + 0.05, 0, 0.0165], [0, y0 - 0.02, 0, 0.015]], 7, () => ASH, null, false, WOOD_U.pale);
  // the blade: a long leaf, thick down its spine and thin at the edges
  const tmp = new Builder(120), n = 10, rows = [];
  for (let i = 0; i <= n; i++) {
    const q = i / n, y = y0 - q * Lb, w = W * Math.pow(Math.sin(Math.PI * Math.pow(q * 0.94 + 0.03, 0.62)), 0.75) * (i === 0 ? 0.25 : 1), th = 0.013 * (1 - q * 0.72);
    const v = q * Lb / 0.5, c = mulCol(ASH, 0.95 - 0.12 * q), um = (WOOD_U.pale[0] + WOOD_U.pale[1]) / 2;
    rows.push([tmp.vert(-w, y, 0, -1, 0, 0, mulCol(c, 0.8), WOOD_U.pale[0], v), tmp.vert(0, y, th, 0, 0, 1, c, um, v), tmp.vert(w, y, 0, 1, 0, 0, mulCol(c, 0.8), WOOD_U.pale[1], v), tmp.vert(0, y, -th, 0, 0, -1, c, um, v)]);
  }
  for (let i = 0; i < n; i++) for (let k = 0; k < 4; k++) { const k1 = (k + 1) % 4; tmp.quad(rows[i][k], rows[i + 1][k], rows[i + 1][k1], rows[i][k1]); }
  tmp.smoothNormals(); b.add(tmp);
  return b.build({ bend: false });
}
