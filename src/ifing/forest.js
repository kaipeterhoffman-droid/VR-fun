// Forest: what stands where. Each 40 m section of the river is planted from a seed (the same forest on every visit)
// and gathered into a few drawings: the full-detail wood for when the boat is near, a light copy of it for when it
// is far and for the water to reflect, and the cut-out leaves and ferns.
import * as THREE from 'three';
import { Builder, col, mulCol, mixCol } from './build.js';
import { makePaint } from './paint.js';
import { floraSheet, barkSheet } from './art.js';
import * as F from './flora.js';
import { river, landHeight, wooded, LENGTH } from './river.js';
import { rng, noise2, fbm2, smooth } from './noise.js';
import { SECTION } from './world.js';

const TAU = Math.PI * 2;
const DIM = [0.56, 0.6, 0.58];                                   // the Ironwood's stones: its moss is the dark kind
const GILT = [0.58, 0.44, 0.26];                                   // the golden grove's: what lies on them is leaves

// which wood grows where: the share of each kind of tree, by reach
function kindAt(s, out, r) {
  if (s < 96) return r < 0.42 ? 'spruce' : r < 0.74 ? 'pine' : 'birch';
  if (s < 366) return r < 0.8 ? 'spruce' : r < 0.86 ? 'pine' : r < 0.94 ? 'birch' : 'snag';
  if (s < 600) return r < 0.42 ? 'spruce' : r < 0.66 ? 'pine' : r < 0.95 ? 'birch' : 'snag';
  if (s < 800) return out > 9 && r < 0.2 ? 'spruce' : r < 0.78 ? 'gold' : 'birch';
  return r < 0.6 ? 'spruce' : r < 0.85 ? 'snag' : 'birch';
}
const LEAF_TINT = [[-200, '#727c44'], [96, '#727c44'], [130, '#55683f'], [340, '#55683f'], [400, '#9a9468'], [570, '#9a9468'], [630, '#ffbe3c'], [800, '#ffbe3c'], [860, '#e9e4d2'], [2000, '#e9e4d2']].map(([s, h]) => [s, col(h)]);
function leafTint(s, r) {
  let i = 1; while (i < LEAF_TINT.length - 1 && s > LEAF_TINT[i][0]) i++;
  const c = mixCol(LEAF_TINT[i - 1][1], LEAF_TINT[i][1], smooth(LEAF_TINT[i - 1][0], LEAF_TINT[i][0], s));
  return s > 610 && s < 810 && r < 0.16 ? mixCol(c, col('#d8762a'), 0.8) : mulCol(c, 0.8 + r * 0.4);
}

/**
 * Plant the river. `clearings` keeps the set pieces' ground free: [{ s0, s1, side (-1, 1 or 0 for both), out0, out1 }].
 */
export function buildForest(world, { clearings = [], lineup = false } = {}) {
  const sheet = floraSheet();
  const solidMat = makePaint({ vertexLit: true, brush: 0.3, brushScale: 0.5, side: THREE.DoubleSide, inside: 0.5, sway: { amp: 0.22, speed: 0.8, flutter: 0.05 } });
  const cutMat = makePaint({ map: sheet, cutout: true, alphaTest: 0.42, vertexLit: true, brush: 0, side: THREE.DoubleSide, inside: 0.86, backlight: 0.12, backColor: '#fff0c0', sway: { amp: 0.35, speed: 1.0, flutter: 0.16 } });

  const barkMat = makePaint({ map: barkSheet(), brush: 0.12, brushScale: 0.6, rim: { color: '#ffffff', strength: 0.6, power: 3.2 } });
  const pool = (fn, seeds) => seeds.map((seed) => [0, 1, 2].map((lod) => fn(seed, lod)));
  const T = {
    spruce: pool(F.spruce, [11, 12, 13, 14, 15, 16]), pine: pool(F.pine, [21, 22, 23]), birch: pool(F.birch, [31, 32, 33, 34]),
    gold: pool(F.goldTree, [41, 42, 43, 44]), snag: pool(F.snag, [51, 52, 53]),
  };
  const boulders = [1, 2, 3, 4, 5].map((k) => F.boulder(60 + k, 1)), bigBoulders = [1, 2, 3].map((k) => F.boulder(70 + k, 2));
  const ferns = [1, 2, 3, 4].map((k) => F.fern(80 + k)), grass = [1, 2, 3].map((k) => F.tuft(90 + k, 'grass')), heath = [1, 2].map((k) => F.tuft(95 + k, 'heath')), reeds = [1, 2, 3].map((k) => F.tuft(100 + k, 'reed'));
  const pads = [1, 2, 3].map((k) => F.lily(110 + k, false)), blooms = [1, 2].map((k) => F.lily(115 + k, true)), leaves = [1, 2, 3].map((k) => F.fallenLeaf(120 + k));
  const shrooms = [1, 2, 3].map((k) => F.mushroom(130 + k)), logs = [1, 2, 3].map((k) => F.log(140 + k)), roots = [1, 2, 3, 4].map((k) => F.root(150 + k));

  if (lineup) return { T, solidMat, cutMat, barkMat, extras: { boulders, bigBoulders, ferns, grass, heath, reeds, logs, shrooms } };
  const cleared = (s, side, out) => { for (const c of clearings) if (s >= c.s0 && s <= c.s1 && (c.side === 0 || c.side === side) && out >= c.out0 && out <= c.out1) return true; return false; };
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), Q2 = new THREE.Quaternion(), P = new THREE.Vector3(), S = new THREE.Vector3(), AX = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
  const pt = [0, 0], here = {};
  let count = 0; const stats = [];

  for (const sec of world.sections) {
    const hi = new Builder(20000), lo = new Builder(4000), loCut = new Builder(12000), cut = new Builder(30000), edge = new Builder(600), bark = new Builder(6000);
    const rnd = rng(1000 + sec.index * 17);
    const rnd2 = rng(5000 + sec.index * 31);                        // (its own dice for what was planted later, so that the older wood stands where it stood)
    /** place a model at (s, side, out): turned by yaw, scaled, leaning `lean` radians toward the water */
    const place = (s, side, out, yaw, scale, lean = 0, sink = 0.12) => {
      const hw = river.halfWidth(s); river.point(s, side * (hw + out), pt); river.at(Math.min(LENGTH, Math.max(0, s)), here);
      const y = out > 0 ? landHeight(s, side, out) - sink : -sink;
      Q.setFromAxisAngle(UP, yaw);
      if (lean) { AX.set(here.tx * side, 0, here.tz * side); Q2.setFromAxisAngle(AX, lean); Q.premultiply(Q2); }
      P.set(pt[0], y, pt[1]); S.set(scale, scale, scale);
      return M.compose(P, Q, S);
    };
    const toWater = (side) => Math.atan2(-(-side * here.rz), -side * here.rx);       // the yaw that points a model's +x at the river

    for (const side of [-1, 1]) {
      // ---- trees: one chance in each 3 m cell, thinning away from the water
      for (let s = sec.s0 + 1.5; s < sec.s1; s += 3) for (let io = 0; io < 10; io++) {
        const r1 = rnd(), r2 = rnd(), r3 = rnd(), r4 = rnd(), r5 = rnd(), r6 = rnd();
        const out = 0.8 + io * 3 + r1 * 2.4, ss = s + (r2 - 0.5) * 2.6, w = wooded(ss);
        const p = w * (io === 0 ? 0.3 : 0.6 - io * 0.02) * (0.55 + 0.9 * fbm2(ss * 0.05 + side * 9, out * 0.05, 2));
        if (r3 > p || cleared(ss, side, out)) continue;
        const kind = kindAt(ss + (r6 - 0.5) * 30, out, r4), set = T[kind][Math.floor(r5 * T[kind].length)];
        const lod = out < 4.2 ? 0 : out < 13 ? 1 : 2;
        let scale = 0.78 + r6 * 0.5; if (kind === 'spruce' && ss > 110 && ss < 360 && r5 > 0.9) scale *= 1.5;
        const lean = out < 2.6 ? (0.05 + r1 * 0.13) * (kind === 'spruce' ? 0.6 : 1) : (r1 - 0.5) * 0.05;
        const m = place(ss, side, out, r2 * TAU, scale, lean, 0.2);
        const k = 0.82 + r3 / Math.max(p, 0.01) * 0.3, tint = [k * (0.94 + r5 * 0.12), k, k * (0.92 + r1 * 0.16)];
        const lt = kind === 'birch' ? leafTint(ss, r5) : kind === 'gold' ? [0.85 + r5 * 0.3, 0.85 + r1 * 0.3, 0.9] : tint;
        const t = set[lod], far = set[2], needle = kind === 'spruce' || kind === 'pine';
        hi.add(t.solid, m, kind === 'spruce' ? tint : null); if (t.bark) bark.add(t.bark, m);
        if (t.cut) cut.add(t.cut, m, needle ? tint : lt);
        lo.add(far.solid, m, kind === 'spruce' ? tint : null); if (far.cut) loCut.add(far.cut, m, needle ? tint : lt);
        count++;
        // roots that come out of the bank and go down into the water
        if (out < 2.4 && kind !== 'snag') for (let q = 0; q < 2; q++) {
          const m2 = place(ss + (q - 0.5) * 0.9 + (r4 - 0.5), side, 0.25, 0, 0.8 + r5 * 0.8, 0, 0); river.at(Math.min(LENGTH, Math.max(0, ss)), here);
          Q.setFromAxisAngle(UP, toWater(side) + (rnd() - 0.5) * 0.7); m2.compose(P, Q, S); const rt = roots[(q + Math.floor(r6 * 4)) % 4].solid; hi.add(rt, m2); lo.add(rt, m2);
        }
      }
      // ---- the forest floor near the water: ferns, grass, stones, what has fallen
      for (let s = sec.s0 + 0.75; s < sec.s1; s += 1.5) for (let io = 0; io < 8; io++) {
        const r1 = rnd(), r2 = rnd(), r3 = rnd(), r4 = rnd();
        const out = 0.5 + io * 1.5 + r1 * 1.3, ss = s + (r2 - 0.5) * 1.4;
        if (cleared(ss, side, out)) continue;
        const w = wooded(ss), iron = smooth(90, 130, ss) * (1 - smooth(340, 380, ss)), open = 1 - w, glas = smooth(600, 640, ss) * (1 - smooth(790, 815, ss)), pale = ss > 830 ? 1 : 0;
        if (pale) { if (r3 < 0.03) hi.add(boulders[Math.floor(r4 * 5)].solid, place(ss, side, out, r1 * TAU, 0.3 + r2 * 0.8), [1.5, 1.5, 1.45]); continue; }
        const pf = 0.07 + 0.2 * iron + 0.06 * glas, pg = 0.08 + 0.3 * open, ph = 0.1 * open * (ss < 96 || (ss > 380 && ss < 590) ? 1 : 0.3);
        if (r3 < pf) cut.add(ferns[Math.floor(r4 * 4)].cut, place(ss, side, out, r1 * TAU, 0.8 + r2 * 0.7), glas > 0.5 ? [0.95, 0.72, 0.3] : [0.3 + r4 * 0.08, 0.36, 0.3]);
        else if (r3 < pf + pg) cut.add(grass[Math.floor(r4 * 3)].cut, place(ss, side, out, r1 * TAU, 0.8 + r2 * 0.8), glas > 0.5 ? [0.95, 0.74, 0.28] : ss > 380 && ss < 590 ? [0.42, 0.46, 0.5] : [0.3, 0.34, 0.3]);
        else if (r3 < pf + pg + ph) cut.add(heath[Math.floor(r4 * 2)].cut, place(ss, side, out, r1 * TAU, 0.9 + r2 * 0.7), [0.6, 0.6, 0.6]);
        else if (r3 < pf + pg + ph + 0.035 + 0.03 * iron) { const big = r4 > 0.86; hi.add((big ? bigBoulders[Math.floor(r1 * 3)] : boulders[Math.floor(r1 * 5)]).solid, place(ss, side, out, r2 * TAU, big ? 1.4 + r1 * 1.5 : 0.35 + r4 * 0.9, 0, 0.25), iron > 0.5 ? DIM : glas > 0.5 ? GILT : null); if (big) lo.add(boulders[0].solid, M); }
        else if (r3 > 0.985 - 0.012 * iron && io < 5) hi.add(shrooms[Math.floor(r4 * 3)].solid, place(ss, side, out, r1 * TAU, 0.9 + r2 * 0.9, 0, 0.02));
        else if (r3 > 0.972 && (iron > 0.5 || glas > 0.5) && io > 0) hi.add(logs[Math.floor(r4 * 3)].solid, place(ss, side, out, r1 * TAU, 0.8 + r2 * 0.5, 0, 0.1));
      }
      // ---- in the shallows: stones, reeds where the bank is low, lily pads in the slack water
      for (let s = sec.s0 + 0.4; s < sec.s1; s += 0.8) {
        const r1 = rnd(), r2 = rnd(), r3 = rnd(), r4 = rnd();
        if (s > 870 || cleared(s, side, -1)) continue;
        const hw = river.halfWidth(s), reedy = fbm2(s * 0.06 + side * 31, 4.2, 2), still = fbm2(s * 0.035 + side * 17, 9.1, 2);
        const low = landHeight(s, side, 2.5) < 1.5;
        if (low && reedy > 0.56 && r1 < 0.8) edge.add(reeds[Math.floor(r2 * 3)].cut, place(s, side, -0.1 - r3 * 1.3, r4 * TAU, 0.8 + r2 * 0.5, 0, 0), s > 600 && s < 810 ? [0.9, 0.68, 0.3] : [0.34, 0.38, 0.34]);
        // sedge along the very edge, in runs with gaps between: the waterline is never left bare for long
        if (fbm2(s * 0.13 + side * 5.3, 1.7, 2) > 0.44) for (let q = 0; q < 2; q++) {
          const a1 = rnd2(), a2 = rnd2(), a3 = rnd2(), a4 = rnd2();
          if (a1 < 0.62) edge.add(grass[Math.floor(a2 * 3)].cut, place(s + a3 * 0.8, side, -0.15 + a4 * 0.75, a2 * TAU, 0.55 + a3 * 0.75, 0, 0.04), s > 600 && s < 810 ? [0.95, 0.74, 0.28] : s > 380 && s < 590 ? [0.42, 0.46, 0.5] : [0.3, 0.36, 0.3]);
        }
        if (r1 < 0.045) hi.add(boulders[Math.floor(r2 * 5)].solid, place(s, side, -0.2 - r3 * Math.min(2.2, hw * 0.25), r4 * TAU, 0.3 + r2 * 0.7, 0, 0.2), s > 110 && s < 360 ? DIM : s > 620 && s < 800 ? GILT : null);
        if (still > 0.6 && s > 60 && s < 600 && hw > 5.5) for (let q = 0; q < 2; q++) {
          const d = -0.7 - rnd() * Math.min(4.5, hw * 0.4), bl = rnd() < 0.1;
          cut.add((bl ? blooms[Math.floor(rnd() * 2)] : pads[Math.floor(rnd() * 3)]).cut, place(s + rnd() * 0.8, side, d, 0, 0.8 + rnd() * 0.9, 0, 0), bl ? null : [0.5, 0.55, 0.5]);
        }
      }
    }
    // ---- Glasir: the skin of fallen leaves on the black water
    if (sec.s1 > 600 && sec.s0 < 812) for (let k = 0; k < 900; k++) {
      const s = sec.s0 + rnd() * SECTION, g = smooth(598, 640, s) * (1 - smooth(780, 812, s)); if (rnd() > g) continue;
      const hw = river.halfWidth(s), u = rnd() * 2 - 1, drift = fbm2(s * 0.08, u * 2.2, 2);
      if (drift < 0.42) continue;                                    // they gather in rafts, with lanes of clear water between
      const red = rnd();
      cut.add(leaves[k % 3].cut, place(s, u < 0 ? -1 : 1, -Math.abs(u) * hw - 0.02, 0, 0.8 + rnd() * 1.2, 0, 0), red < 0.14 ? [1.0, 0.44, 0.14] : red < 0.55 ? [1.0, 0.74, 0.2] : [1.0, 0.88, 0.36]);
    }

    stats.push([sec.s0, hi.triangles, cut.triangles, bark.triangles, lo.triangles, loCut.triangles]);
    const s = sec.s0 + 1;
    // near: the full wood. far, and always in the water: its light copy
    if (hi.nv) { const m = new THREE.Mesh(hi.build({ uv: false }), solidMat); m.name = 'wood'; world.add(m, s, false); sec.near.push(m); }
    if (cut.nv) { const m = new THREE.Mesh(cut.build(), cutMat); m.name = 'leaves'; world.add(m, s, false); sec.near.push(m); }
    if (bark.nv) { const m = new THREE.Mesh(bark.build({ bend: false }), barkMat); m.name = 'trunks'; world.add(m, s, false); sec.near.push(m); }
    if (lo.nv) { const m = new THREE.Mesh(lo.build({ uv: false }), solidMat); m.name = 'far wood'; world.add(m, s, true); sec.far.push(m); }
    if (loCut.nv) { const m = new THREE.Mesh(loCut.build(), cutMat); m.name = 'far leaves'; world.add(m, s, true); sec.far.push(m); }
    if (edge.nv) { const m = new THREE.Mesh(edge.build(), cutMat); m.name = 'water edge'; world.add(m, s, true); }
  }
  return { T, solidMat, cutMat, barkMat, sheet, count, stats, extras: { boulders, bigBoulders, ferns, grass, heath, reeds, logs, shrooms, pads, blooms, roots } };
}
