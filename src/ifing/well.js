// The well of Urd: where the river ends, and the tree that stands in it.
//
// "An ash I know that stands, Yggdrasil it is called, a tall tree, wet with white loam; from there come the dews that
// fall in the valleys; it stands ever green over the well of Urd." The river has been going to it all night. The
// last of the forest closes over the water as one of its roots (the arch, dark and wet, with small cold lights under
// it), and then there is no forest: still water as far as can be seen, the northern lights standing over it, and the
// tree, white, a third of a kilometre high, its limbs out over the whole well and its picture lying in the water
// from its foot to the canoe's bow.
//
// Everything the well's water touches turns white (the old books say so: white as the skin inside an eggshell), so
// what stands in it is white: the roots that come up out of it like the backs of something swimming, the skerry in
// the middle with its three stones, the two swans. The one warm thing is the fire on the skerry, the last of the
// keeper's lights and the same fire as the first: three seats round it, and nobody.
import * as THREE from 'three';
import { Builder, mulCol, mixCol } from './build.js';
import { tube, bell, lump, sweep } from './flora.js';
import { river, LENGTH } from './river.js';
import { region, BARK_U, barkSheet } from './art.js';
import { makePaint } from './paint.js';
import { rng, smooth, fbm2 } from './noise.js';
import { makeMist, makeMotes, makeThreads } from './fx.js';
import { spot, frame, hang, groundAt, rock, crag, runes, facet, stoneAt, fire, TAU } from './kit.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const Q = new URLSearchParams(typeof location === 'undefined' ? '' : location.search), ask = (k) => (Q.has(k) ? parseFloat(Q.get(k)) : NaN);
/** Where the tree stands: on the river's line, so far past its end that the whole of it can be seen from the arch. */
export const TREE = { s: LENGTH + 170 }, ARCH = { s: 836 }, SKERRY = { s: 1022, d: 14 };
const LEAF_TOP = [1.0, 1.0, 0.98], LEAF = [0.8, 0.88, 0.9], LEAF_DEEP = [0.46, 0.56, 0.72];
const PALE = [1.5, 1.5, 1.46];                                     // what the well's water has had the keeping of
const PULSE = new THREE.Color('#c4ffe6'), EVERY = 26, SPEED = 20;   // the light that leaves the tree: its colour, how often, how fast it crosses the well

/**
 * A rune stone: a slab set on end, one face of it flat for writing on, its head rounded by weather. Its foot is at the
 * origin (and 0.6 m under it); the flat face looks along +z. Returns where that face is at a height: [z, its lean].
 */
function runestone(b, w, h, t, seed, m, tint) {
  const rnd = rng(seed), tmp = new Builder(120), V = [0, 0.12, 0.3, 0.5, 0.68, 0.82, 0.92, 0.98], sides = 10, rows = [], lean = (rnd() - 0.5) * 0.08, back = -0.03 - rnd() * 0.04;
  const wide = (v) => (1 - 0.2 * v + 0.05 * Math.sin(v * 5 + seed)) * Math.sqrt(Math.max(0.05, 1 - Math.pow(Math.max(0, (v - 0.7) / 0.3), 2) * 0.9)), thick = (v) => 1 - 0.3 * v;
  for (const v of V) {
    const y = -0.6 + (h + 0.6) * v, row = [];
    for (let j = 0; j < sides; j++) {
      const a = j / sides * TAU + 0.314, cs = Math.cos(a), sn = Math.sin(a), k = 1 / Math.pow(Math.pow(Math.abs(cs), 3.4) + Math.pow(Math.abs(sn), 3.4), 1 / 3.4);
      const n = 0.95 + 0.1 * fbm2(cs * 1.3 + seed * 3.7 + v * 2.2, sn * 1.3 + v * 1.7 + seed, 2);          // (the written face is left true)
      row.push(tmp.vert(cs * k * w / 2 * wide(v) * n + lean * y, y, sn * k * t / 2 * thick(v) * (sn > 0.5 ? 1 : n) + back * y, cs, 0.1, sn, mulCol(stoneAt(a * 1.3 + seed, v * 3 + seed * 0.7, tint), 0.7 + 0.4 * v)));
    }
    rows.push(row);
  }
  const top = tmp.vert(lean * h, h, back * h, 0, 1, 0, stoneAt(seed, seed * 2.3, tint));
  for (let i = 0; i < V.length - 1; i++) for (let j = 0; j < sides; j++) { const j1 = (j + 1) % sides; tmp.quad(rows[i][j], rows[i + 1][j], rows[i + 1][j1], rows[i][j1]); }
  for (let j = 0; j < sides; j++) tmp.tri(top, rows[V.length - 1][(j + 1) % sides], rows[V.length - 1][j]);
  tmp.smoothNormals(); b.add(tmp, m);
  const slope = back - t / 2 * 0.3 / (h + 0.6);
  return (y) => [t / 2 * thick((y + 0.6) / (h + 0.6)) + back * y, slope];
}

export function buildWell(ctx) {
  ctx.clearings.push({ s0: 806, s1: 868, side: 0, out0: -3, out1: 30 });
  ctx.planters.push((forest) => {
    const U = BARK_U.birch;
    // everything that stands in the well is shown together, from the last of the grove on
    const G = new THREE.Group(); G.name = 'the well';
    const M = {
      root: makePaint({ map: barkSheet(), color: '#e6eaf2', brush: 0.22, brushScale: 0.4, wet: 0.5, top: { color: '#6f8a66', from: 0.6, to: 0.96, amount: 0.5 }, rim: { color: '#ffffff', strength: 0.6, power: 2.6 }, front: 0.8 }),
      stone: makePaint({ color: '#f1efe8', brush: 0.34, brushScale: 0.4, wet: 0.3, side: THREE.DoubleSide, inside: 0.7, rim: { color: '#dfeaff', strength: 0.5, power: 2.6 }, front: 0.7 }),
      hair: makePaint({ vertexLit: true, brush: 0.2, brushScale: 0.8, side: THREE.DoubleSide, inside: 0.8, sway: { amp: 0.14, speed: 0.7, flutter: 0.06 }, front: 0.8 }),
      white: makePaint({ color: '#f2f5fb', brush: 0.25, brushScale: 0.9, emissive: '#3a4759', rim: { color: '#ffffff', strength: 0.9, power: 2.2 }, front: 0.6 }),
    };
    const w = { G, M, U, forest };
    arch(ctx, w); tree(ctx, w); seaRoots(ctx, w); skerry(ctx, w); swans(ctx, w); air(ctx, w);
    const twin = ctx.world.add(G, null, true);
    ctx.ticks.unshift((dt, time, boat) => { const on = boat.s > 770; G.visible = on; if (twin) twin.visible = on; });
    beat(ctx, w);
  });
}

// ------------------------------------------------------------------------------------------------ the arch
// One of the tree's roots, come all this way under the forest, and four lesser ones with it: they leave one bank, go
// over the river and into the other, and between them make a roof thirty paces long. It is dark under it and it
// drips. Rootlets hang down to just over a sitting head, and on them and on the wet underside of the wood there are
// small cold lights, hundreds, that the water doubles: the first stars of the well, an arm's length off.
function arch(ctx, { G, M, U, forest }) {
  const S = ARCH.s, A = frame(spot(S, 0, 0), S), at = (x, y, z) => V3(x, y, z).applyMatrix4(A), rnd = rng(8361), hw = river.halfWidth(S);
  const wood = new Builder(4000), hairB = new Builder(4000), cardB = new Builder(600), rockB = new Builder(4000), worms = [], tips = [], BEARD = region('beard');
  const white = () => { const v = 0.8 + rnd() * 0.2; return [v * 0.97, v * 0.985, v]; };
  const gy = (x, z) => { const p = at(x, 0, z); return groundAt(p.x, p.z, S - z); };
  // each: where it leaves the left bank and where it enters the right (metres up the river from the middle), how thick, how much room under it in mid-channel
  const ROOTS = [[27, 20, 1.5, 5.0], [4, 16, 1.15, 3.1], [12, -9, 2.4, 3.4], [-12, -19, 0.7, 3.2], [-23, -31, 1.9, 5.4]], XS = [-38, -29, -21, -14, -9, -4.5, 0, 4.5, 9, 14, 21, 29, 38];
  for (const [zl, zr, r, clear] of ROOTS) {
    const pts = XS.map((x) => {
      const t = (x + 38) / 76, z = zl + (zr - zl) * t + Math.sin(t * 7 + r * 3) * 1.2, ax = Math.abs(x), g = gy(x, z);
      const over = clear + r + 0.5 * Math.max(0, 1 - (ax / 9) ** 2), on = g + r * 0.55, k = smooth(5.5, 13, ax);            // over the water it is a bridge; on the banks it lies on the ground, and then goes under it
      return [x, over + (on - over) * k - Math.max(0, ax - 16) * 0.33, z, r * (0.92 + 0.3 * smooth(6, 20, ax)) * (0.94 + 0.12 * rnd())];
    });
    tube(wood, sweep(pts, 3).map((p, i) => [p[0], p[1], p[2], p[3] * (1 + 0.1 * Math.sin(i * 1.7 + r * 5) + 0.06 * Math.sin(i * 0.6))]), r > 1.4 ? 12 : 8, white, null, false, U, r > 1.4 ? 9 : 5);
    const P = (x) => { let i = 0; while (i < XS.length - 2 && XS[i + 1] < x) i++; const f = (x - XS[i]) / (XS[i + 1] - XS[i]), a = pts[i], b = pts[i + 1]; return [x, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f, a[3] + (b[3] - a[3]) * f]; };
    // the rootlets that hang from it, thin as cord: to a little over a sitting head in the channel, to the ground on the banks
    for (let k = 0, n = Math.round(22 + r * 30); k < n; k++) {
      const x = (rnd() * 2 - 1) * 15, p = P(x), ph = (rnd() - 0.5) * 1.7, y0 = p[1] - Math.cos(ph) * p[3] * 0.9, z0 = p[2] + Math.sin(ph) * p[3] * 0.9;
      const floor = Math.abs(x) < hw + 0.2 ? 2.05 : gy(x, z0) + 0.15, room = y0 - floor; if (room < 0.4) continue;
      const len = Math.min(room, 0.6 + rnd() * rnd() * 4.6), th = 0.009 + rnd() * 0.016, dx = (rnd() - 0.5) * 0.6, dz = (rnd() - 0.5) * 0.6, bow = (rnd() - 0.5) * 0.3;
      tube(hairB, [[x, y0 + 0.12, z0, th * 1.6], [x + dx * 0.3 + bow, y0 - len * 0.3, z0 + dz * 0.3, th], [x + dx * 0.7 + bow, y0 - len * 0.68, z0 + dz * 0.7 - bow, th * 0.85], [x + dx, y0 - len, z0 + dz, th * 0.6]], 3, () => mulCol(white(), 0.78), (t) => t * t, true);
      if (rnd() < 0.7) hang(cardB, x + dx * 0.4, y0 - len * 0.15, z0 + dz * 0.4, 0.25 + rnd() * 0.45, Math.min(len * 0.95, 0.5 + rnd() * 1.4), rnd() * TAU, BEARD, [0.72, 0.78, 0.8]);
      for (let q = 0, m = 1 + Math.floor(rnd() * 3); q < m; q++) { const f = 0.35 + 0.65 * rnd(); worms.push([x + dx * f + bow * (f < 0.9 ? 1 : 0.4), y0 - len * f, z0 + dz * f]); }
      if (Math.abs(x) < 3.6 && len > 0.9) tips.push([x + dx, y0 - len, z0 + dz]);
    }
    // and the small lights on its wet underside
    for (let k = 0, n = Math.round(30 + r * 40); k < n; k++) { const x = (rnd() * 2 - 1) * 11, p = P(x), ph = (rnd() - 0.5) * 2.0; worms.push([x, p[1] - Math.cos(ph) * p[3] * 1.13, p[2] + Math.sin(ph) * p[3] * 1.13]); }
  }
  // the rock the roots have hold of: split stone back from the water, and at its edge boulders the river has rounded
  for (const side of [-1, 1]) for (let k = 0; k < 7; k++) {
    const z = 30 - k * 10 + rnd() * 4, x = side * (hw + 4.2 + rnd() * 3.6), g = gy(x, z);
    crag(rockB, x, g * 0.5, z, 1.3 + rnd() * 1.3, 1.4 + rnd() * 1.4, 1.6 + rnd() * 1.8, 8400 + k + (side > 0 ? 20 : 0), 2, null, 0.3, 0.6);
    for (let q = 0; q < 3; q++) { const zz = z + (q - 1) * 3.2 + rnd() * 1.5, xx = side * (hw + 0.9 - rnd() * 1.5 + q * 0.5), big = 0.5 + rnd() * 0.9; rock(rockB, xx, Math.max(0, gy(xx, zz)) * 0.6 + 0.02, zz, big, big * (0.6 + rnd() * 0.3), big * (0.8 + rnd() * 0.5), 8450 + k * 3 + q + (side > 0 ? 40 : 0), 2); }
  }
  { const b = new Builder(wood.nv); b.add(wood, A); const m = new THREE.Mesh(b.build({ bend: false }), M.root); m.name = 'the root over the river'; G.add(m); }
  { const b = new Builder(hairB.nv); b.add(hairB, A); const m = new THREE.Mesh(b.build({ uv: false }), M.hair); m.name = 'rootlets'; G.add(m); }
  { const b = new Builder(cardB.nv); b.add(cardB, A); const m = new THREE.Mesh(b.build(), forest.cutMat); m.name = 'root hair'; G.add(m); }
  { const b = new Builder(rockB.nv); b.add(rockB, A); const m = new THREE.Mesh(b.build({ uv: false, bend: false }), ctx.mats.stone); m.name = 'rock under the root'; G.add(m); }
  const lights = makeMotes(worms.map(([x, y, z]) => { const p = at(x, y, z); return { x: p.x, y: p.y, z: p.z, roam: 0.03, size: 0.016 + rnd() * 0.02, speed: 0.35 + rnd() * 0.9, kind: 0, color: [0.7, 1.9, 1.7] }; }));
  G.add(lights);
  const puffs = []; for (let k = 0; k < 6; k++) { const q = at((rnd() - 0.5) * 6, 0.4 + rnd() * 0.3, 26 - k * 11); puffs.push({ x: q.x, y: q.y, z: q.z, width: 7 + rnd() * 4, height: 0.9 + rnd() * 0.5, opacity: 0.22 + rnd() * 0.12, drift: 0.4 }); }
  G.add(makeMist(puffs));
  // what drips from the rootlets: a few of them, each in its own time, each ringing the water where it lands
  const drops = tips.sort(() => rnd() - 0.5).slice(0, 6).map(([x, y, z], i) => { const t = at(x, y, z); return { t, glow: ctx.glows.add({ position: t.clone(), size: 0.06, color: new THREE.Color('#bfe8ff'), power: 0 }), ph: i * 0.29, rate: 0.26 + (i % 3) * 0.07, last: 0 }; });
  const mid = at(0, 0, 0);
  ctx.ticks.push((dt, time, boat) => {
    const near = Math.abs(boat.s - S) < 60;
    for (const d of drops) {
      if (!near) { d.glow.power = 0; continue; }
      const u = (time * d.rate + d.ph) % 1, fall = Math.min(1, u * 2.6), y = d.t.y * (1 - fall * fall);
      d.glow.position.set(d.t.x, Math.max(0.02, y), d.t.z); d.glow.power = fall < 1 ? 0.8 : 0;
      if (fall >= 1 && d.last < 1 && ctx.water.ripples.touch) { ctx.water.ripples.touch(d.t.x, d.t.z, 0.11, 0.32); ctx.hit('drop', { x: d.t.x, y: 0, z: d.t.z }, 0.7); }
      d.last = fall;
    }
  });
  ctx.well = { arch: { at, mid, worms: worms.length, tips: tips.length } };
}

// ------------------------------------------------------------------------------------------------ the tree
function tree(ctx, { G, forest, U }) {
  // Its frame: the middle of the bole at the level of the water, +x to the right of the river, +z back up it (toward whoever is coming).
  const F = frame(spot(TREE.s, 0, 0), LENGTH), rnd = rng(1230), at = (x, y, z) => V3(x, y, z).applyMatrix4(F);
  const bk = new Builder(9000), up = new Builder(12000), lf = new Builder(30000), REG = [region('birch'), region('birchB')], BEARD = region('beard');
  const white = (k = 1) => { const v = (0.84 + rnd() * 0.16) * k; return [v * 0.96, v * 0.985, v]; };

  // ---- the bole: fluted, each flute the top of a root; birch-white, and barred as a birch is
  const FLUTES = 9, rings = [[0, -1.2, 0, 38.5, 0.55], [0, 2, 0, 35, 0.52], [0, 13, 0, 25.5, 0.42], [1, 32, 0, 19.5, 0.27], [2, 62, 1, 16.4, 0.13], [1.5, 96, 0.5, 14.8, 0.07], [0, 126, 0, 14.2, 0.05], [-1, 152, 0, 14.4, 0.05]];
  { const sides = 36, first = bk.nv; let run = 0;
    rings.forEach((p, i) => {
      if (i) run += Math.hypot(p[0] - rings[i - 1][0], p[1] - rings[i - 1][1], p[2] - rings[i - 1][2]);
      for (let j = 0; j <= sides; j++) {
        const th = j / sides * TAU, crest = 0.5 + 0.5 * Math.cos(th * FLUTES + i * 0.3), k = 1 + p[4] * (crest - 0.35), cs = Math.cos(th), sn = Math.sin(th), deep = Math.min(1, p[4] * 3.5), t = (j / sides * 3) % 1;
        bk.vert(p[0] + cs * p[3] * k, p[1], p[2] + sn * p[3] * k, cs, 0.15, sn, white(1 - 0.42 * deep * (1 - crest)), U[0] + (U[1] - U[0]) * (1 - Math.abs(2 * t - 1)), run / 30);
      }
    });
    for (let i = 0; i < rings.length - 1; i++) for (let j = 0; j < sides; j++) { const a = first + i * (sides + 1) + j; bk.quad(a, a + 1, a + sides + 2, a + sides + 1); }
  }
  // ---- its roots: one to a flute, going out a long way over the water before they go under it; some stand clear of it in arches
  for (let k = 0; k < FLUTES; k++) {
    const a = k / FLUTES * TAU + (rnd() - 0.5) * 0.12, cs = Math.cos(a), sn = Math.sin(a), far = 96 + rnd() * 50, wob = (rnd() - 0.5) * 0.5, arch = rnd() < 0.55 ? 0.5 + rnd() * 0.8 : 0;
    const P = (d, y, r) => [cs * d - sn * wob * d * 0.14, y, sn * d + cs * wob * d * 0.14, r];
    tube(bk, [P(27, 20, 9.5), P(44, 11 + arch * 4, 7.4), P(far * 0.5, 5.5 + arch * 10, 5.4), P(far * 0.78, 2 + arch * 7, 3.8), P(far, -0.4, 2.3), P(far + 12, -1.6, 0.8)], 9, () => white(0.94), null, false, U, 36);
  }

  // ---- the limbs. The bole goes on up as a leader, and the limbs leave it at three heights: the lowest longest and
  // nearly level, out over the well. Each is forked and forked again and carries its leaves at the ends, so that the
  // white wood is seen against the sky and the sky through it.
  const LIMBS = [
    [[0, 148, 0, 14.4], [3, 190, -2, 12], [-2, 232, 2, 9.5], [4, 272, -1, 7], [0, 308, 2, 4.6], [-2, 338, 0, 2.6], [0, 362, 0, 1]],
    [[-6, 104, 8, 10], [-30, 132, 52, 8.6], [-62, 150, 108, 6.8], [-88, 160, 166, 5], [-104, 162, 222, 3.2], [-112, 158, 268, 1.6]],
    [[10, 110, 3, 10], [58, 138, 18, 8.4], [116, 156, 40, 6.6], [174, 166, 58, 4.8], [226, 168, 72, 3], [268, 162, 84, 1.4]],
    [[-10, 116, -3, 9.6], [-60, 146, -16, 8.2], [-120, 166, -30, 6.4], [-178, 178, -40, 4.6], [-230, 180, -46, 2.8], [-270, 174, -50, 1.3]],
    [[6, 138, 8, 9.4], [24, 176, 52, 7.8], [34, 204, 108, 6], [30, 222, 160, 4.2], [18, 228, 208, 2.6], [8, 224, 252, 1.2]],          // (this one goes out over the skerry: the threads come down from it)
    [[6, 146, -8, 9], [44, 188, -48, 7.4], [90, 222, -98, 5.6], [130, 242, -150, 3.8], [160, 250, -198, 2]],
    [[-6, 152, -8, 9], [-40, 196, -52, 7.4], [-84, 230, -104, 5.6], [-122, 250, -156, 3.8], [-150, 258, -204, 2]],
    [[-3, 162, 6, 8.6], [-14, 214, 40, 7], [-30, 258, 88, 5.2], [-40, 286, 140, 3.6], [-44, 298, 190, 2]],
    [[5, 196, 0, 7.6], [44, 240, 6, 6.2], [92, 274, 14, 4.6], [136, 294, 20, 3], [172, 302, 24, 1.6]],
    [[-5, 206, 2, 7.4], [-46, 250, -4, 6], [-96, 282, -10, 4.4], [-140, 300, -14, 2.8], [-176, 306, -16, 1.5]],
    [[3, 230, 4, 6.4], [22, 270, 36, 5], [44, 300, 76, 3.6], [58, 316, 118, 2.2]],
    [[0, 224, -5, 6.4], [-8, 268, -44, 5], [-12, 300, -90, 3.4], [-10, 316, -134, 2]],
    [[-3, 250, 3, 5.6], [-28, 286, 30, 4.4], [-58, 310, 62, 3], [-84, 322, 96, 1.8]],
  ];
  const tintAt = (body) => (z) => (z === 0 ? mixCol(body, LEAF_TOP, 0.65) : z === 1 ? mixCol(body, LEAF_TOP, 0.3) : z === 2 ? body : mixCol(body, LEAF_DEEP, 0.6));
  const body = () => { const w = rnd(); return mixCol(LEAF, LEAF_DEEP, w * w * 0.6); };
  // A crown is never one bell: under the big one hang lesser ones at their own heights, so that from beneath it is leaves and not the inside of an umbrella.
  const crown = (x, y, z, r, low) => {
    bell(lf, x, y + r * 0.2, z, r, r * 0.6, r * (low ? 1.0 : 0.75) * (0.8 + rnd() * 0.5), 9, REG, tintAt(body()), 0.7, rnd);
    for (let k = 0, n = low ? 5 : 3; k < n; k++) {
      const a = rnd() * TAU, d = r * (k === 0 ? 0.1 : 0.3 + 0.55 * rnd()), rr = r * (0.3 + rnd() * 0.22);
      bell(lf, x + Math.cos(a) * d, y - r * 0.12 - rnd() * r * 0.5, z + Math.sin(a) * d, rr, rr * 0.5, rr * (1.3 + rnd() * (low ? 1.8 : 0.9)), 6, REG, tintAt(mixCol(body(), LEAF_TOP, 0.25)), 1.0, rnd, true);
    }
    // and from the hems of the low boughs long strands hang toward the water, as a birch's do
    if (low) for (let k = 0; k < 3; k++) { const a = rnd() * TAU, d = r * (0.3 + 0.6 * rnd()), v = 0.7 + rnd() * 0.3; hang(lf, x + Math.cos(a) * d, y - r * 0.2 - rnd() * 6, z + Math.sin(a) * d, 8 + rnd() * 8, 30 + rnd() * 50, rnd() * TAU, BEARD, [v * 0.9, v, v]); }
  };
  const spray = (p, dir, len, r, depth, low) => {
    // one fork: out and a little up, bowing at its end; a crown there, and (once) a lesser fork off its middle
    const a = Math.atan2(dir[2], dir[0]) + (rnd() - 0.5) * 2.2, cs = Math.cos(a), sn = Math.sin(a), rise = 0.1 + rnd() * 0.35;
    const m = [p[0] + cs * len * 0.5, p[1] + len * (rise * 0.5 + 0.08), p[2] + sn * len * 0.5], e = [p[0] + cs * len, p[1] + len * rise, p[2] + sn * len];
    tube(up, [[p[0], p[1], p[2], r], [m[0], m[1], m[2], r * 0.62], [e[0], e[1], e[2], Math.max(0.5, r * 0.2)]], depth ? 5 : 6, () => white(0.92), null, false, U, 30);
    crown(e[0], e[1], e[2], (depth ? 12 : 16) + rnd() * 8, low);
    if (!depth) spray(m, [cs, 0, sn], len * (0.5 + rnd() * 0.25), r * 0.5, 1, low);
  };
  LIMBS.forEach((L, n) => {
    if (n) L.unshift([L[0][0] * 0.2, L[0][1] - 9, L[0][2] * 0.2, L[0][3]]);                   // (each begins inside the bole, so that no end of it shows)
    tube(up, L, 10, () => white(0.96), null, false, U, 40);
    for (let i = n ? 3 : 2; i < L.length; i++) {
      const p = L[i], q = L[i - 1], dir = [p[0] - q[0], p[1] - q[1], p[2] - q[2]], low = n > 0 && n < 5 && Math.hypot(p[0], p[2]) > 60, forks = i === L.length - 1 ? 3 : 2;
      crown(p[0], p[1] + 4, p[2], 18 + rnd() * 9, low);
      for (let k = 0; k < forks; k++) spray(p, dir, 44 + rnd() * 32 - i * 3, Math.max(1, p[3] * 0.6), 0, low);
    }
  });
  // The tree is seen from under it and from nowhere else, and what lights it is the well. So its limbs and leaves are
  // lit as from below: what faces down takes the light, and what faces the sky (which nobody sees) keeps the shade.
  for (const b of [up, lf]) for (let i = 0; i < b.nv; i++) b.nor[i * 3 + 1] = -b.nor[i * 3 + 1];

  const barkMat = makePaint({ map: barkSheet(), color: '#e4eaf6', brush: 0.3, brushScale: 0.035, emissive: '#16233c', rim: { color: '#ffffff', strength: 0.9, power: 2.4 }, fogScale: 0.1, front: 0.6 });
  const leafMat = makePaint({ map: forest.sheet, cutout: true, alphaTest: 0.42, vertexLit: true, brush: 0, side: THREE.DoubleSide, inside: 0.92, backlight: 0.3, backColor: '#d8fff0', emissive: '#0e2230', fogScale: 0.1, sway: { amp: 10, speed: 0.3, flutter: 0.05 }, front: 0.8 });
  const grp = new THREE.Group(); grp.name = 'Yggdrasil';
  { const b = new Builder(bk.nv + up.nv); b.add(bk, F); b.add(up, F); grp.add(new THREE.Mesh(b.build({ bend: false }), barkMat)); const l = new Builder(lf.nv); l.add(lf, F); grp.add(new THREE.Mesh(l.build(), leafMat)); }
  G.add(grp);
  Object.assign(ctx.well, { at, F, foot: at(0, 0, 0), tris: (bk.ni + up.ni + lf.ni) / 3 });
  // its own light in the air round it, and the sound of that many leaves that far up
  for (const [x, y, z, size, power] of [[0, 250, 0, 420, 0.04], [0, 120, 0, 200, 0.03]]) ctx.glows.add({ position: at(x, y, z), size, color: new THREE.Color('#9fd6e6'), power });
  ctx.voice('tree', at(0, 150, 150), 420, true).level = 1;
}

// ------------------------------------------------------------------------------------------------ the roots in the well
// The tree's roots go on under the well a long way, and here and there the back of one comes up out of the water and
// goes down into it again, lower each time the further it is from the bole: a line of them leading the eye in, by
// which it measures how far off the tree is, and how big.
function seaRoots(ctx, { G, M, U }) {
  const T = ctx.well.F, rnd = rng(1001), wood = new Builder(6000);
  const white = () => { const v = 0.84 + rnd() * 0.16; return [v * 0.96, v * 0.985, v]; };
  // each, in the tree's own frame (x across, z back up the river): from, to, how thick at the tree's end, how high its first back stands, how many backs, where they fall
  const RUNS = [[-52, 96, -47, 306, 4.4, 4.6, 0.9], [62, 88, 47, 262, 4.2, 3.6, 2.2], [-128, 52, -150, 262, 4.6, 3.4, 4.0], [132, 30, 170, 210, 4.6, 3.2, 5.3], [-8, 112, -3, 176, 3.0, 1.6, 0.4], [96, 62, 108, 300, 3.4, 4.4, 3.1], [30, 104, 23, 197, 3.0, 2.3, 1.7], [-88, 84, -92, 250, 3.6, 3.3, 2.6]];
  for (const [x0, z0, x1, z1, r0, humps, ph] of RUNS) {
    const len = Math.hypot(x1 - x0, z1 - z0), n = Math.round(len / 3), ux = (x1 - x0) / len, uz = (z1 - z0) / len, pts = [], bend = (rnd() - 0.5) * 0.3;
    for (let i = 0; i <= n; i++) {
      const t = i / n, far = Math.pow(1 - t, 1.3), r = (0.85 + (r0 - 0.85) * far) * (0.94 + 0.12 * rnd()), up = Math.max(0, Math.sin(t * humps * TAU + ph)), lift = 0.08 + 0.42 * Math.abs(Math.sin(t * humps * 3.1 + ph * 2));
      const side = bend * len * t * (1 - t) + Math.sin(t * 2.6 + ph) * len * 0.02;
      // a back: its top out of the water by about its own thickness, the rest of it under
      pts.push([x0 + ux * len * t - uz * side, -r * 1.1 + r * (1.1 + lift) * Math.pow(up, 0.7), z0 + uz * len * t + ux * side, r]);
    }
    tube(wood, pts, r0 > 3.8 ? 10 : 8, white, null, false, U, 12);
    for (let i = 1; i < n; i += 2) {
      // where one is out of the water the canoe cannot cross it
      const p = pts[i]; if (p[1] + p[3] < 0.12) continue;
      const w = V3(p[0], 0, p[2]).applyMatrix4(T), l = river.locate(w.x, w.z, null, {});
      if (l.s < LENGTH && Math.abs(l.d) < l.halfWidth) ctx.obstacles.push({ x: w.x, z: w.z, r: Math.sqrt(Math.max(0.04, p[3] * p[3] - Math.min(p[3], Math.abs(p[1])) ** 2)) + 0.35 });
    }
  }
  { const b = new Builder(wood.nv); b.add(wood, T); const m = new THREE.Mesh(b.build({ bend: false }), M.root); m.name = 'roots in the well'; G.add(m); }
}

// ------------------------------------------------------------------------------------------------ the skerry
// A back of white rock in the middle of the well, where the current lets the canoe go. A fire is kept on it. Three
// stones stand round the fire, each with a name down its face: Urd, what was; Verdandi, what is coming to be; Skuld,
// what shall be. A flat stone to sit on before each. From the top of every stone a few threads go straight up into
// the tree, out of sight.
function skerry(ctx, { G, M }) {
  const S = SKERRY.s, K = frame(spot(S, SKERRY.d, 0), S), at = (x, y, z) => V3(x, y, z).applyMatrix4(K), rnd = rng(1022);
  const AX = 7.8, AZ = 5.4, rim = (th) => 1 + 0.16 * Math.sin(th * 2 + 0.6) + 0.1 * Math.sin(th * 3 + 2.1) + 0.06 * Math.sin(th * 5);
  const H = (x, z) => { const rho = Math.hypot(x / AX, z / AZ) / rim(Math.atan2(z / AZ, x / AX)); return 0.85 * (1 - smooth(0.28, 1.04, rho)) - 0.07 * smooth(0.96, 1.1, rho) + (fbm2(x * 0.5 + 7, z * 0.5 + 3, 2) - 0.5) * 0.14 * Math.max(0, 1 - rho); };
  const rockB = new Builder(1200), woodB = new Builder(200);
  { const tmp = new Builder(300), RH = [0, 0.26, 0.5, 0.72, 0.9, 1.04, 1.12], N = 18, rows = [];
    for (let i = 0; i < RH.length; i++) { const row = []; for (let j = 0; j < (i ? N : 1); j++) { const th = (j + (i & 1) * 0.5) / N * TAU, R = RH[i] * rim(th), x = Math.cos(th) * AX * R, z = Math.sin(th) * AZ * R; row.push(tmp.vert(x, H(x, z), z, 0, 1, 0, mulCol(stoneAt(x * 0.3, z * 0.3, PALE), 0.85 + 0.25 * rnd()))); } rows.push(row); }
    for (let j = 0; j < N; j++) tmp.tri(rows[0][0], rows[1][(j + 1) % N], rows[1][j]);
    for (let i = 1; i < RH.length - 1; i++) for (let j = 0; j < N; j++) { const j1 = (j + 1) % N; tmp.quad(rows[i][j], rows[i][j1], rows[i + 1][j1], rows[i + 1][j]); }
    tmp.smoothNormals(); rockB.add(facet(tmp));
  }
  for (let k = 0; k < 9; k++) { const a = k / 9 * TAU + rnd() * 0.5, R = (0.86 + rnd() * 0.2) * rim(a), x = Math.cos(a) * AX * R, z = Math.sin(a) * AZ * R; rock(rockB, x, 0.05, z, 0.5 + rnd() * 0.9, 0.3 + rnd() * 0.4, 0.5 + rnd() * 0.8, 1040 + k, 1, PALE); }
  // the fire, the three stones beyond it as the canoe comes, a seat before each
  const fx = 0.3, fz = 0.8, FAR = [0.66, -0.75], ACROSS = [0.75, 0.66], NAMES = ['urþr', 'werþandi', 'skuld'], TALL = [3.9, 5.6, 4.4], WIDE = [2.5, 3.0, 2.4], STONE = [1.25, 1.25, 1.23];
  const cuts = [], tops = [], halos = [];
  [-0.9, 0, 0.9].forEach((a, k) => {
    const c = Math.cos(a) * 3.9, sn = Math.sin(a) * 3.9, x = fx + FAR[0] * c + ACROSS[0] * sn, z = fz + FAR[1] * c + ACROSS[1] * sn, yaw = Math.atan2(fx - x, fz - z), y0 = H(x, z) - 0.12;
    const m = new THREE.Matrix4().makeTranslation(x, y0, z).multiply(new THREE.Matrix4().makeRotationY(yaw));
    const face = runestone(rockB, WIDE[k], TALL[k], 1.1, 1050 + k, m, STONE);
    const cut = new Builder(40), hgt = 0.5, lean = face(2)[1], upv = [0, 1 / Math.hypot(1, lean), lean / Math.hypot(1, lean)];
    [...NAMES[k]].forEach((ch, i) => { const y = TALL[k] - 1.15 - i * 0.56; runes(cut, ch, [-hgt * 0.25, y, face(y)[0] + 0.035], [1, 0, 0], upv, hgt, [1, 1, 1], m); });
    cuts.push(cut); tops.push(at(x, y0 + TALL[k] * 0.98, z));
    { const hs = []; for (let i = 0.5; i < NAMES[k].length; i += 2) { const y = TALL[k] - 1.15 - i * 0.56 + 0.25, q = new THREE.Vector3(0, y, face(y)[0] + 0.22).applyMatrix4(m); hs.push(ctx.glows.add({ position: at(q.x, q.y, q.z), size: 1.5, color: new THREE.Color('#9cc4ff'), power: 0 })); } halos.push(hs); }      // a name gives light when it is said
    { const sx = fx + (x - fx) * 0.47, sz = fz + (z - fz) * 0.47; rock(rockB, sx, H(sx, sz) + 0.12, sz, 0.52, 0.2, 0.42, 1060 + k, 1, PALE, 0.16); }
    const p = at(x, 0, z); ctx.obstacles.push({ x: p.x, z: p.z, r: 1.6 });
  });
  const hearth = fire(ctx, rockB, woodB, at(fx, H(fx, fz) - 0.02, fz), S, 1.0, true); hearth.light.radius = 6.2;       // (a small fire: it warms the feet of the stones and leaves their heads to the sky)
  { const b = new Builder(rockB.nv); b.add(rockB, K); const m = new THREE.Mesh(b.build({ uv: false, bend: false }), M.stone); m.name = 'skerry'; G.add(m); }
  { const b = new Builder(woodB.nv); b.add(woodB, K); const m = new THREE.Mesh(b.build({ bend: false }), ctx.mats.wood); m.name = 'hearth'; G.add(m); }
  const lit = cuts.map((c, k) => { const b = new Builder(c.nv); b.add(c, K); const m = ctx.litRunes('#cfe6ff'); const mesh = new THREE.Mesh(b.build({ bend: false }), m); mesh.name = NAMES[k]; G.add(mesh); m.userData.set(0.12); return m; });
  for (const [x, z, r] of [[0, 0, 5.6], [-4.4, 0.4, 3.6], [4.4, -0.2, 3.6]]) { const p = at(x, 0, z); ctx.obstacles.push({ x: p.x, z: p.z, r }); }
  // the threads
  const threads = [];
  tops.forEach((t, k) => { for (let i = 0; i < 5; i++) { const len = 150 + rnd() * 46; threads.push({ x: t.x + (rnd() - 0.5) * 0.5, y: t.y + len, z: t.z + (rnd() - 0.5) * 0.5, length: len, power: 0.9 + rnd() * 0.8, width: 0.012, sway: 0.5 + rnd() * 0.5 }); } });
  const strands = makeThreads(threads, '#dff0ff'); G.add(strands);
  // white lilies in the lee of it
  { const cut = new Builder(400), ex = ctx.forest.extras, m4 = new THREE.Matrix4();
    for (let k = 0; k < 46; k++) { const a = rnd() * TAU, R = 1.12 + rnd() * rnd() * 1.6, x = Math.cos(a) * AX * R, z = Math.sin(a) * AZ * R, bloom = rnd() < 0.3, sc = 0.7 + rnd() * 0.6; m4.makeTranslation(x, 0, z).multiply(new THREE.Matrix4().makeScale(sc, 1, sc)); cut.add((bloom ? ex.blooms[k % 2] : ex.pads[k % 3]).cut, m4, bloom ? [1.3, 1.3, 1.3] : [1.2, 1.4, 1.34]); }
    const b = new Builder(cut.nv); b.add(cut, K); const m = new THREE.Mesh(b.build(), ctx.forest.cutMat); m.name = 'lilies'; G.add(m); }
  ctx.well.skerry = { at, center: at(0, 0, 0), fire: hearth, lit, halos, tops, strands, stones: tops.map((t) => V3(t.x, 2, t.z)) };
}

// ------------------------------------------------------------------------------------------------ the swans
// "Two birds are fed in the well of Urd. They are called swans, and from them has come the kind of bird that has that name."
function swanModel() {
  const b = new Builder(500), W = () => [1, 1, 1], GREY = () => [0.3, 0.32, 0.36];
  // she swims along +z; the water is at y = 0
  lump(b, 0, 0.16, 0, 0.3, 0.26, 0.56, 2, 3, 0.03, W, 0.5);
  tube(b, [[0, 0.24, -0.4, 0.2], [0, 0.34, -0.62, 0.12], [0, 0.46, -0.78, 0.03]], 6, W, null, true);                                    // the tail, cocked
  for (const sx of [-1, 1]) lump(b, sx * 0.2, 0.3, -0.08, 0.16, 0.2, 0.46, 1, 5 + sx, 0.04, W, 0.8);                                    // the wings, a little raised, as a swan carries them when it is looked at
  tube(b, [[0, 0.22, 0.42, 0.13], [0, 0.4, 0.56, 0.085], [0, 0.66, 0.6, 0.062], [0, 0.9, 0.54, 0.055], [0, 1.06, 0.56, 0.055], [0, 1.1, 0.66, 0.06]], 7, W);      // the neck
  tube(b, [[0, 1.1, 0.62, 0.066], [0, 1.08, 0.74, 0.056], [0, 1.04, 0.84, 0.036], [0, 1.02, 0.92, 0.016]], 6, (i) => (i > 1 ? GREY() : W()), null, true);       // the head and the bill
  for (const sx of [-1, 1]) lump(b, sx * 0.05, 1.105, 0.72, 0.012, 0.012, 0.014, 0, 3, 0, () => [0.02, 0.02, 0.04]);
  return b.build({ uv: false, bend: false });
}
function swans(ctx, { M }) {
  const geo = swanModel(), HOME = [[1012, -24, 11, 7, 0.021, 0], [1026, -33, 14, 9, -0.017, 2.4]];
  const birds = HOME.map(([s, d, a, b, om, ph], k) => {
    const g = new THREE.Mesh(geo, M.white); g.name = 'swan'; g.scale.setScalar(1.9); g.frustumCulled = false; ctx.world.addMoving(g);
    return { g, c: spot(s, d, 0), a, b, om, ph, off: new THREE.Vector2(), last: new THREE.Vector3(), yaw: 0, k };
  });
  const here = river.at(1010), ax = [here.rx, here.rz], az = [here.tx, here.tz];
  ctx.ticks.push((dt, time, boat, look, eye) => {
    const on = boat.s > 860;
    for (const w of birds) {
      w.g.visible = on; if (!on) continue;
      // each keeps to her own slow round, and gives the canoe room
      const u = time * w.om + w.ph, lx = Math.cos(u) * w.a + Math.sin(u * 2.3) * 2, lz = Math.sin(u) * w.b + Math.cos(u * 1.7) * 2.5;
      let x = w.c.x + ax[0] * lx + az[0] * lz + w.off.x, z = w.c.z + ax[1] * lx + az[1] * lz + w.off.y;
      const dx = x - boat.pos.x, dz = z - boat.pos.y, dist = Math.hypot(dx, dz);
      if (dist < 9 && dt > 0) { const k = (9 - dist) * 0.25 * dt; w.off.x += dx / (dist || 1) * k; w.off.y += dz / (dist || 1) * k; } else if (dt > 0) w.off.multiplyScalar(1 - Math.min(1, dt * 0.02));
      const vx = x - w.last.x, vz = z - w.last.z;
      if (boat.frozen || w.last.y === 0) w.yaw = Math.atan2(-Math.sin(u) * w.a * w.om * ax[0] + Math.cos(u) * w.b * w.om * az[0], -Math.sin(u) * w.a * w.om * ax[1] + Math.cos(u) * w.b * w.om * az[1]);
      else if (vx * vx + vz * vz > 1e-8) { let to = Math.atan2(vx, vz) - w.yaw; to = Math.atan2(Math.sin(to), Math.cos(to)); w.yaw += to * Math.min(1, dt * 1.5); }
      w.last.set(x, 1, z);
      w.g.position.set(x, 0.01 * Math.sin(time * 1.1 + w.k), z); w.g.rotation.set(0.02 * Math.sin(time * 0.8 + w.k * 2), w.yaw, 0);
      if (dist < 22 && dt > 0 && ctx.water.ripples.touch) ctx.water.ripples.touch(x - Math.sin(w.yaw) * 0.9, z - Math.cos(w.yaw) * 0.9, 0.3, 0.02);
    }
  });
  ctx.well.swans = birds;
}

// ------------------------------------------------------------------------------------------------ the air over the well
function air(ctx, { G }) {
  const rnd = rng(1061);
  // the dew that comes down from the tree: slow, and each drop a light
  const dew = [];
  for (let k = 0; k < 420; k++) { const s = 880 + rnd() * 250, hw = Math.min(110, river.halfWidth(Math.min(s, LENGTH)) * 0.9), q = spot(s, (rnd() * 2 - 1) * hw, 0.04); dew.push({ x: q.x, y: q.y, z: q.z, roam: 16 + rnd() * 26, size: 0.018 + rnd() * 0.02, speed: 0.25 + rnd() * 0.22, kind: 2, color: [0.8, 1.15, 1.25] }); }
  G.add(makeMotes(dew));
  // a little mist lying on it, which the tree's light shows as it goes through
  const puffs = [];
  for (let k = 0; k < 26; k++) { const s = 900 + rnd() * 190, hw = Math.min(90, river.halfWidth(Math.min(s, LENGTH)) * 0.85), q = spot(s, (rnd() * 2 - 1) * hw, 0.3 + rnd() * 0.3); puffs.push({ x: q.x, y: q.y, z: q.z, width: 14 + rnd() * 16, height: 0.7 + rnd() * 0.6, opacity: 0.12 + rnd() * 0.12, drift: 0.3 + rnd() * 0.5 }); }
  G.add(makeMist(puffs, { front: [0.5, 1, 0.5] }));
}

// ------------------------------------------------------------------------------------------------ what happens there
// Every so often a ring of light leaves the foot of the tree. It goes up the bole and out along the limbs, and at the
// same time out across the water: the mist shows it, the roots it passes are lit, the swans' backs, the skerry. When
// the canoe first comes to the skerry the three names are lit one after another, and then the tree answers.
function beat(ctx) {
  const sk = ctx.well.skerry, foot = ctx.well.foot, NOTES = [0.5, 0.749, 1], far = foot.distanceTo(sk.center), WAKE = ask('wake'), RING = ask('pulse');
  let woke = -1e4, told = 0, rung = -1, leaf = 0;
  // and last, a thread of her own: let down out of the crown to the lantern at the bow, and made fast there
  const LEN = 240, FALL = 13, mine = makeThreads([{ x: 0, y: LEN, z: 0, length: LEN, power: 1.25, width: 0.005, sway: 0.3 }], '#fff2d2'); mine.name = 'her thread'; mine.visible = false; ctx.world.addMoving(mine);
  const knot = ctx.glows.add({ position: new THREE.Vector3(), size: 0.4, color: new THREE.Color('#fff0cc'), power: 0 });
  let tied = false;
  ctx.ticks.push((dt, time, boat, look, eye) => {
    if (boat.s < 800) return;
    const d = Math.hypot(eye.x - sk.center.x, eye.z - sk.center.z);
    if (boat.frozen) woke = WAKE >= 0 ? time - WAKE : d < 44 ? time - 60 : -1e4; else if (woke < -1e3 && d < 44) { woke = time; told = 0; }
    const since = time - woke;
    // the ring: on the tree's own clock until the names are lit, and then it answers them
    const t0 = woke > -1e3 && since > 6.5 && since < 6.5 + EVERY ? since - 6.5 : time % EVERY, R = boat.frozen && RING >= 0 ? RING : t0 * SPEED, strong = woke > -1e3 && since > 6.5 && since < 6.5 + EVERY ? 1.4 : 1;
    const go = smooth(0, 30, R) * (1 - smooth(330, 440, R));
    if (go > 0.01) ctx.front(foot, R, 30, 0.5 * go * strong, 0.6 * go * strong, PULSE);
    const here = Math.exp(-(((R - far) / 26) ** 2)) * go;                                   // how much of it is on the skerry
    sk.lit.forEach((m, k) => {
      const on = smooth(k * 2.0, k * 2.0 + 1.4, since);
      if (!boat.frozen && woke > -1e3 && told === k && since > k * 2.0 + 0.3) { told++; ctx.hit('string', sk.stones[k], 1, NOTES[k]); }
      m.userData.set(0.12 + on * (1.25 + 0.2 * Math.sin(time * 0.9 + k * 2)) + here * 1.6);
      for (const h of sk.halos[k]) h.power = on * (0.2 + 0.03 * Math.sin(time * 0.9 + k * 2)) + here * 0.3;
    });
    const n = Math.floor((woke > -1e3 && since > 6.5 && since < 6.5 + EVERY ? since - 6.5 : time) / EVERY);
    if (!boat.frozen && R > far && rung !== n && go > 0.3) { rung = n; [0, 1, 2].forEach((k) => ctx.hit('string', sk.stones[k], 0.7, NOTES[k] * 2)); }      // the stones answer as it goes over them
    sk.strands.userData.uniforms.uThreadGain.value.x = 0.55 + 0.6 * smooth(0, 6, since) + here * 2.2;
    // her thread comes down when the tree has answered, slower as it nears, and is tied
    const down = since - (6.5 + far / SPEED + 1.5), u = Math.min(1, Math.max(0, down / FALL)), on = woke > -1e3 && down > 0 && boat.s > 850;
    mine.visible = on; knot.power = 0;
    if (on) {
      const f = boat.flame, held = Math.max(0, down - FALL);
      mine.position.set(f.x, f.y + 0.15 + 205 * (1 - u) ** 3, f.z);
      mine.userData.uniforms.uThreadGain.value.x = 0.9 + (u >= 1 ? 1.8 * Math.exp(-held / 3) : 0);
      knot.position.set(f.x, f.y + 0.15, f.z); knot.power = u >= 1 ? 0.1 + 0.8 * Math.exp(-held / 2.5) : 0;
      if (u >= 1 && !tied) { tied = true; if (!boat.frozen) { ctx.hit('string', f, 0.3, 0.5); ctx.hit('string', f, 0.18, 1); if (ctx.water.ripples.touch) ctx.water.ripples.touch(boat.pos.x, boat.pos.y, 0.45, 0.8); } }
    }
    // dew landing round the canoe
    if (!boat.frozen && boat.s > 880) { leaf -= dt; if (leaf <= 0) { leaf = 0.25 + Math.random() * 0.9; const a = Math.random() * TAU, r = 1.5 + Math.random() * 9; if (ctx.water.ripples.touch) ctx.water.ripples.touch(boat.pos.x + Math.cos(a) * r, boat.pos.y + Math.sin(a) * r, 0.1, 0.22); } }
  });
}

