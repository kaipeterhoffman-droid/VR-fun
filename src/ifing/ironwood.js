// Jarnvidr, the Ironwood: night under spruce, and the things in it that watch.
//
// The reach is composed as one long approach. First the wood grows too big: spruces whose feet are wider than the
// canoe is long, closing over the river. Then one of them lies across it, mossed and bearded, and the river goes
// under. Past it the trees stand back from a pool, and beyond the pool, where the river turns, there is a hill
// that the wood has grown over. The hill has a brow, and under the brow a nose as long as a boathouse, and a beard
// of grey lichen down its chest: a jotun, caught by some morning long ago, stone to the ground. One arm lies down
// the bank with its hand open in the shallows. One eye opens when a light comes down the river, and follows it.
// In the open hand somebody has left a lantern burning, the same as the canoe's own: whoever keeps the fire at the
// landing comes this far, and is not afraid of him.
//
// Smaller things, for those who look: eyes in pairs back among the trunks that are gone when the lantern comes
// near; the nokk among his lilies, who sinks; corpse-lights over the water at the reach's end, going on ahead.
// Warm is kept to the two lanterns. Everything else that gives light here is cold.
import * as THREE from 'three';
import { Builder, mulCol } from './build.js';
import { tube } from './flora.js';
import { river } from './river.js';
import { BARK_U, barkSheet, region, breathPuff } from './art.js';
import { makePaint } from './paint.js';
import { rng, fbm2, smooth } from './noise.js';
import { makeMist, makeMotes } from './fx.js';
import { spot, onBank, groundAt, frame, rock, crag, facet, stoneAt, hang, shelfCard, grove, stamp, groveMeshes, lamp, TAU } from './kit.js';

const UP = new THREE.Vector3(0, 1, 0);
const BEARD = region('beard'), SHELF = region('shelf');
const LICHEN = [0.62, 0.7, 0.6], FUNGUS = [1.0, 0.92, 0.76];
const M4 = (pos, yaw, sx, sy = sx) => new THREE.Matrix4().compose(pos, new THREE.Quaternion().setFromAxisAngle(UP, yaw), new THREE.Vector3(sx, sy, sx));
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

/** Where the jotun sits: back from the left bank, where the river turns away from him. He faces the pool. */
export const JOTUN = { s: 320, side: -1, out: 25, yaw: 0.5 };
// The great spruces: [s, side, metres back from the water, which of the forest's spruces, how great].
const GIANTS = [
  [146, -1, 2.8, 0, 1.0], [157, 1, 3.4, 3, 1.15], [169, -1, 4.0, 1, 0.95], [180, 1, 2.6, 4, 1.1], [191, -1, 3.0, 2, 1.2],
  [221, 1, 5.5, 5, 1.1], [228, -1, 4.4, 0, 1.0], [286, 1, 4.2, 2, 1.05], [318, 1, 3.4, 3, 1.1], [347, 1, 3.8, 4, 0.9],
];

export function buildIronwood(ctx) {
  // bark that the moss has found: the great trees' feet, their roots, the one that fell
  ctx.mats.mossBark = makePaint({ map: barkSheet(), brush: 0.16, brushScale: 0.4, top: { color: '#2c4a1a', from: 0.25, to: 0.8, amount: 0.92 }, wet: 0.35, rim: { color: '#ffffff', strength: 0.5, power: 3.2 }, side: THREE.DoubleSide, inside: 0.7 });
  // the jotun's own stone: it must loom through the air from the far end of the pool, and catch what light there is at its edge
  ctx.mats.jotun = makePaint({ brush: 0.4, brushScale: 0.07, top: { color: '#2a441c', from: 0.5, to: 0.92, amount: 0.9 }, wet: 0.6, rim: { color: '#bfe8e0', strength: 0.5, power: 2.6 }, fogScale: 0.5, side: THREE.DoubleSide, inside: 0.6 });
  // ground the common wood is kept off
  for (const [s, side, out, , k] of GIANTS) ctx.clearings.push({ s0: s - 2.7 * k, s1: s + 2.7 * k, side, out0: out - 3.4, out1: out + 3.8 });
  ctx.clearings.push({ s0: 195, s1: 207, side: -1, out0: -2, out1: 13 }, { s0: 203, s1: 217, side: 1, out0: -2, out1: 14 });
  // nothing tall grows before him: from the pool's end the left bank is bog, and he is seen across it whole
  ctx.clearings.push({ s0: 258, s1: 354, side: -1, out0: -2, out1: 70 });
  ctx.wallGaps.push({ s0: 250, s1: 358, side: -1 });
  ctx.planters.push((forest) => { giants(ctx, forest); windfall(ctx, forest); nokk(ctx, forest); bog(ctx, forest); jotun(ctx, forest); watchers(ctx); lights(ctx); air(ctx); });
}

// ------------------------------------------------------------------------------------------------ the great spruces
// A tree of the forest's, drawn out to three times its height and lifted, on a foot of its own: a trunk two metres
// through, fluted, with roots like the flukes of an anchor. From the canoe it is the foot that is seen. The crown
// is a roof.
function giants(ctx, forest) {
  const bySection = new Map();
  for (const g of GIANTS) { const sec = ctx.world.sectionAt(g[0]); if (!bySection.has(sec)) bySection.set(sec, []); bySection.get(sec).push(g); }
  for (const [sec, list] of bySection) {
    const near = grove(), far = grove(), boots = new Builder(2400), bootsFar = new Builder(300);
    for (const [s, side, out, ti, k] of list) {
      const rnd = rng(s * 7 + 3), tpl = forest.T.spruce[ti], H = tpl[0].height, r0 = 0.1 + H * 0.013;
      const pos = onBank(s, side, out, 0), lift = 4.5 + 2.5 * k, sx = 1.85 * k, sy = 2.25 * k, yaw = rnd() * TAU;
      const m = M4(V3(pos.x, pos.y + lift, pos.z), yaw, sx, sy), dk = 0.76 + rnd() * 0.14, tint = [dk, dk, dk * 1.05];
      stamp(near, tpl[0], m, tint); stamp(far, tpl[2], m, tint);
      // the crown's own trunk, as wide as it is at a height above the ground: the foot must be wider than that everywhere
      const own = [[-0.5, 1.6], [0.12, 1.3], [0.7, 1.02], [0.2 * H, 0.84], [0.45 * H, 0.6]];
      const ownR = (y) => { const yl = (y - lift) / sy; let i = 1; while (i < own.length - 1 && yl > own[i][0]) i++; const a = own[i - 1], b = own[i], t = Math.min(1, Math.max(0, (yl - a[0]) / (b[0] - a[0]))); return (a[1] + (b[1] - a[1]) * t) * r0 * sx; };
      const yTop = lift + 0.2 * H * sy, B = 1.28 * k, rTop = ownR(yTop) + 0.03;
      const footR = (y) => Math.max(ownR(y) + 0.07, (B + (rTop - B) * Math.max(0, y) / yTop) * (1 + 0.95 * Math.exp(-Math.max(0, y + 0.4) / 1.2)));
      const ys = [-0.9, 0.15, 0.9, 1.9, 3.4, lift - 0.5 * sy, lift + 0.2 * sy, lift + 0.75 * sy, (lift + sy + yTop) / 2, yTop];
      const lean = [(rnd() - 0.5) * 0.12, (rnd() - 0.5) * 0.12], path = (y) => [pos.x + lean[0] * Math.sin(y * 0.4), pos.y + y, pos.z + lean[1] * Math.sin(y * 0.33 + 1), footR(y)];
      const first = boots.nv, SIDES = 12, ribs = 4, ph = rnd() * TAU;
      tube(boots, ys.map(path), SIDES, (i, j) => { const v = (0.56 + 0.4 * fbm2(j * 1.3 + s, i * 0.7, 2)) * (i < 2 ? 0.7 : 1); return [v, v * 0.97, v * 0.93]; }, null, false, BARK_U.spruce, 5);
      // fluted like an old spruce: the ribs that run down into the roots stand proud of the trunk near the ground
      ys.forEach((y, i) => { const c = path(y), amp = 0.3 * Math.exp(-Math.max(0, y) / 2.4); for (let j = 0; j < SIDES; j++) { const o = (first + i * SIDES + j) * 3, kf = 1 + amp * Math.pow(0.5 + 0.5 * Math.cos(j / SIDES * TAU * ribs + ph), 1.5); boots.pos[o] = c[0] + (boots.pos[o] - c[0]) * kf; boots.pos[o + 2] = c[2] + (boots.pos[o + 2] - c[2]) * kf; } });
      tube(bootsFar, [ys[0], ys[3], ys[6], ys[9]].map(path), 6, () => [0.55, 0.53, 0.5], null, false, BARK_U.spruce, 5);
      // the roots: they leave the trunk at knee height (the trunk's knee), wander, and go into the ground or the water
      const n = 6;
      for (let q = 0; q < n; q++) {
        const a = yaw + (q + rnd() * 0.5) / n * TAU, cs = Math.cos(a), sn = Math.sin(a), h0 = 1.5 + rnd() * 1.3, P = footR(h0), reach = (2.8 + rnd() * 2.0) * k, wig = rnd() * 6, v = 0.5 + rnd() * 0.18, pts = [];
        for (const f of [0, 0.16, 0.36, 0.6, 0.82, 1]) {
          const d = P * 0.55 + (P * 0.5 + reach) * f, side2 = Math.sin(f * 5 + wig) * 0.34 * f * k, x = pos.x + cs * d - sn * side2, z = pos.z + sn * d + cs * side2;
          pts.push([x, groundAt(x, z, s) + (pos.y + h0 - groundAt(x, z, s)) * Math.pow(1 - f, 1.8) + 0.2 * Math.sin(Math.PI * f) - 0.5 * f * f, z, k * (0.5 - 0.41 * f) * (1 + 0.12 * Math.sin(f * 9 + wig))]);
        }
        tube(boots, pts, 6, (i, j) => { const w = v * (0.85 + 0.25 * ((i + j) % 3) / 3); return [w, w * 0.96, w * 0.9]; }, null, false, BARK_U.spruce, 3);
      }
      // bracket fungus on the side toward the water, pale enough to take the lantern
      const here = river.at(s, {}), toRiver = Math.atan2(-side * here.rz, -side * here.rx);
      for (let q = 0; q < 5; q++) {
        const a = toRiver + (rnd() - 0.5) * 2.6, y = 0.9 + rnd() * 3.2, P = footR(y) * 1.1, w = 0.24 + rnd() * 0.22;
        shelfCard(near.cut, [pos.x + Math.cos(a) * (P + w * 0.55), pos.y + y, pos.z + Math.sin(a) * (P + w * 0.55)], [-Math.sin(a), 0, Math.cos(a)], [Math.cos(a), 0.12, Math.sin(a)], w, w * 0.8, SHELF, mulCol(FUNGUS, 0.8 + rnd() * 0.3));
      }
    }
    const s1 = sec.s0 + 1, grp = groveMeshes(ctx, near, 'great spruces'), twin = groveMeshes(ctx, far, 'great spruces, far');
    grp.add(new THREE.Mesh(boots.build({ bend: false }), ctx.mats.mossBark)); twin.add(new THREE.Mesh(bootsFar.build({ bend: false }), ctx.mats.mossBark));
    ctx.world.add(grp, s1, twin);
  }
}

// ------------------------------------------------------------------------------------------------ the one that fell
// It lies from the left bank, where its roots stand on edge with the earth still in them, to the right, where the
// top broke off. Thirty metres of it. Moss along its back, young spruce growing from it in a row (the way the wood
// begins again), ferns; and from its underside the grey beards hang down to just above the head of whoever goes under.
function windfall(ctx, forest) {
  const S = 205, W = frame(spot(S, 0, 0), S, 0.3), rnd = rng(2051), ex = forest.extras;
  const tb = new Builder(3200), st = new Builder(900), g = grove();
  const axis = (t) => [-14.5 + 31.5 * t, 4.5 - 1.4 * t - 0.75 * Math.sin(Math.PI * t) + 0.18 * Math.sin(t * 13), 0.9 * Math.sin(t * 2.2 + 0.4) - 0.4, (1.3 - 0.55 * t) * (1 + 0.4 * Math.exp(-t * 30))];
  const pts = [];
  for (let i = 0; i <= 24; i++) { const a = axis(i / 24); a[3] *= 0.92 + 0.2 * fbm2(i * 0.37, 3.3, 2); pts.push(a); }
  tube(tb, pts, 14, (i, j) => { const k = 0.6 + 0.4 * fbm2(i * 0.9, j * 0.8, 2); return [k, k * 0.97, k * 0.93]; }, null, [0.82, 0.68, 0.48], BARK_U.spruce, 5);
  // the root plate, torn up on edge
  const R0 = axis(0);
  for (let k = 0; k < 14; k++) {
    const a = k / 14 * TAU + rnd() * 0.3, cs = Math.cos(a), sn = Math.sin(a), L = cs < -0.3 ? 2.1 : 3.0 + rnd() * 1.1, back = 0.5 + rnd() * 0.7, th = 0.32 + rnd() * 0.14;
    const end = [R0[0] - 0.5 - back, R0[1] + cs * L - 0.25, R0[2] + sn * L];
    tube(tb, [[R0[0] + 0.5, R0[1], R0[2], th * 1.5], [R0[0] - 0.5, R0[1] + cs * L * 0.36, R0[2] + sn * L * 0.36, th], [R0[0] - 0.5 - back * 0.6, R0[1] + cs * L * 0.7, R0[2] + sn * L * 0.7, th * 0.6], [end[0], end[1], end[2], th * 0.22]],
      6, (i, j) => { const v = 0.42 + 0.22 * ((i + j) % 3) / 3; return [v, v * 0.95, v * 0.9]; }, null, true, BARK_U.spruce, 3);
    if (rnd() < 0.75) { const l = 0.5 + rnd() * 1.3; tube(tb, [[end[0], end[1], end[2], 0.03], [end[0] + (rnd() - 0.5) * 0.2, end[1] - l * 0.5, end[2] + (rnd() - 0.5) * 0.2, 0.02], [end[0] + (rnd() - 0.5) * 0.3, end[1] - l, end[2] + (rnd() - 0.5) * 0.3, 0.008]], 3, () => [0.36, 0.33, 0.3], null, false, BARK_U.spruce, 3); }
  }
  rock(st, R0[0] - 0.6, R0[1] - 0.4, R0[2], 0.85, 2.8, 2.8, 2061, 2, [0.4, 0.32, 0.26], 0.3, 1);                    // the earth it took with it
  for (let k = 0; k < 7; k++) { const a = rnd() * TAU, r = 0.6 + rnd() * 1.7; rock(st, R0[0] - 1.0 - rnd() * 0.35, R0[1] - 0.3 + Math.cos(a) * r, R0[2] + Math.sin(a) * r, 0.25 + rnd() * 0.3, 0.22 + rnd() * 0.25, 0.25 + rnd() * 0.3, 2070 + k, 1, null, 0.25, 1); }
  // the stubs of its boughs: over the water only those that point up
  for (let k = 0; k < 10; k++) {
    const t = 0.24 + 0.72 * rnd(), p = axis(t), over = Math.abs(p[0]) < 7, a = over ? (rnd() - 0.5) * 1.7 : (rnd() - 0.5) * 3.8, dy = Math.cos(a), dz = Math.sin(a), len = 1.1 + rnd() * 2.6, r = p[3];
    const e = [p[0] + 0.55, p[1] + dy * (r + len) - 0.15, p[2] + dz * (r + len)];
    tube(tb, [[p[0], p[1] + dy * r * 0.6, p[2] + dz * r * 0.6, 0.22], [p[0] + 0.3, p[1] + dy * (r + len * 0.5), p[2] + dz * (r + len * 0.5), 0.14], [e[0], e[1], e[2], 0.05]], 5, (i) => { const v = 0.4 + 0.1 * i; return [v, v, v * 0.95]; }, null, true, BARK_U.spruce, 3);
    if (!over || dy > 0.5) hang(g.cut, p[0] + 0.4, p[1] + dy * (r + len * 0.7), p[2] + dz * (r + len * 0.7), 0.34, 0.6 + rnd() * 0.7, rnd() * TAU, BEARD, LICHEN, W);
  }
  // along its back: young spruce, fern in drifts, the red caps
  for (let k = 0; k < 7; k++) { const t = 0.1 + 0.82 * (k + rnd() * 0.7) / 7, p = axis(t); stamp(g, forest.T.spruce[k % 6][1], W.clone().multiply(M4(V3(p[0], p[1] + p[3] * 0.9, p[2] + (rnd() - 0.5) * 0.5), rnd() * TAU, 0.07 + rnd() * 0.11)), [0.95, 1.02, 0.95]); }
  for (let k = 0; k < 17; k++) { const t = 0.05 + 0.9 * Math.pow(rnd(), 1.5), p = axis(t), a = (rnd() - 0.5) * 2.0; g.cut.add(ex.ferns[k % 4].cut, W.clone().multiply(M4(V3(p[0], p[1] + Math.cos(a) * p[3] * 0.94, p[2] + Math.sin(a) * p[3] * 0.94), rnd() * TAU, 0.8 + rnd() * rnd() * 1.6)), [0.26 + rnd() * 0.08, 0.34, 0.24]); }
  for (let k = 0; k < 6; k++) { const t = 0.1 + 0.8 * rnd(), p = axis(t), a = (rnd() - 0.5) * 0.9; g.solid.add(ex.shrooms[k % 3].solid, W.clone().multiply(M4(V3(p[0], p[1] + Math.cos(a) * p[3] * 0.97, p[2] + Math.sin(a) * p[3] * 0.97), rnd() * TAU, 1.5 + rnd() * 1.2))); }
  // bracket fungus down the side the canoe comes to, in the steps it grows in
  for (let k = 0; k < 5; k++) { const t0 = 0.22 + 0.62 * rnd(); for (let q = 0; q < 3; q++) { const t = t0 + q * 0.012, p = axis(t), a = 1.15 + q * 0.3 + rnd() * 0.1, w = 0.3 + rnd() * 0.22; shelfCard(g.cut, [p[0], p[1] + Math.cos(a) * p[3], p[2] + Math.sin(a) * p[3] + w * 0.6], [1, 0, 0], [0, 0.1, 1], w, w * 0.8, SHELF, mulCol(FUNGUS, 0.75 + rnd() * 0.3), W); } }
  // and under it, the beards: shortest where the canoe goes
  for (let k = 0; k < 44; k++) {
    const t = 0.13 + 0.78 * rnd(), p = axis(t), a = (rnd() - 0.5) * 1.3, mid = Math.abs(p[0]) < 3.2;
    hang(g.cut, p[0], p[1] - Math.cos(a) * p[3] * 0.95, p[2] + Math.sin(a) * p[3] * 0.95, 0.3 + rnd() * 0.3, mid ? 0.4 + rnd() * 0.5 : 0.8 + rnd() * 1.6, rnd() * TAU, BEARD, mulCol(LICHEN, 0.85 + rnd() * 0.3), W);
  }
  const wood = new Builder(tb.nv); wood.add(tb, W); const stone = new Builder(st.nv); stone.add(st, W);
  ctx.mesh(wood, ctx.mats.mossBark, S, true, { name: 'windfall' }); ctx.mesh(stone, ctx.mats.stone, S, true, { uv: false, name: 'windfall earth' });
  ctx.world.add(groveMeshes(ctx, g, 'windfall growth'), S, true);
  // fireflies keep to it
  const motes = [];
  for (let k = 0; k < 28; k++) { const p = axis(0.1 + 0.8 * rnd()), q = V3(p[0] + (rnd() - 0.5) * 2, p[1] + (rnd() - 0.3) * 3.4, p[2] + (rnd() - 0.5) * 5).applyMatrix4(W); motes.push({ x: q.x, y: Math.max(0.4, q.y), z: q.z, roam: 0.8 + rnd() * 1.2, size: 0.016 + rnd() * 0.012, speed: 0.3 + rnd() * 0.5, kind: 0, color: [0.8, 1.25, 0.4] }); }
  ctx.world.add(makeMotes(motes), S, true);
}

// ------------------------------------------------------------------------------------------------ the nokk
// Among the lilies in the slack water on the left of the pool: the top of a dark head, and two pale eyes just
// clear of the water, turned to the canoe. He lets it come to ten metres. Then there are only rings.
function nokk(ctx, forest) {
  const S = 247, hw = river.halfWidth(S), home = spot(S, -(hw - 2.6), 0), rnd = rng(2471), cut = new Builder(500), ex = forest.extras;
  for (let k = 0; k < 38; k++) {
    const a = rnd() * TAU, r = 0.55 + Math.sqrt(rnd()) * 3.4, bloom = k % 9 === 4;
    cut.add((bloom ? ex.blooms[k % 2] : ex.pads[k % 3]).cut, M4(V3(home.x + Math.cos(a) * r * 1.3, 0, home.z + Math.sin(a) * r), rnd() * TAU, 0.9 + rnd() * 0.8), bloom ? null : [0.5, 0.58, 0.5]);
  }
  ctx.world.add(new THREE.Mesh(cut.build(), forest.cutMat), S, true);
  const hb = new Builder(200); rock(hb, 0, 0.0, 0, 0.17, 0.13, 0.21, 77, 1, [0.2, 0.26, 0.24], 0.12, 1);
  const head = new THREE.Mesh(hb.build({ bend: false }), ctx.mats.bare); head.position.copy(home); head.name = 'nokk'; ctx.world.add(head, S, false);
  const pale = new THREE.Color('#d6ecff'), eyes = [0, 1].map(() => ctx.glows.add({ position: home.clone(), size: 0.085, color: pale, power: 0 }));
  let under = 0, gone = false, since = 0;
  ctx.ticks.push((dt, time, boat, look, eye) => {
    const dx = eye.x - home.x, dz = eye.z - home.z, d = Math.hypot(dx, dz) || 1;
    if (d > 120) { eyes[0].power = eyes[1].power = 0; return; }
    if (!gone && d < 10) { gone = true; since = 0; ctx.water.ripples.touch(home.x, home.z, 0.42, -0.9); ctx.hit('plunge', home); }
    if (gone) { const before = since; since += dt; if (before < 0.45 && since >= 0.45) ctx.water.ripples.touch(home.x, home.z, 0.3, 0.7); if (since > 14 && d > 32) gone = false; }
    under += ((gone ? 1 : 0) - under) * Math.min(1, dt * (gone ? 3.2 : 0.4));
    head.position.y = -0.36 * under;
    const blink = Math.sin(time * 0.61 + 2) > 0.985 ? 0 : 1, open = (1 - under) * (1 - under) * smooth(62, 30, d) * blink;
    for (let k = 0; k < 2; k++) { const e = (k ? 1 : -1) * 0.052; eyes[k].position.set(home.x - dz / d * e + dx / d * 0.15, 0.085 - 0.36 * under, home.z + dx / d * e + dz / d * 0.15); eyes[k].power = 1.5 * open; }
  });
}

// ------------------------------------------------------------------------------------------------ the bog
// Between the pool and the jotun the left bank is quaking ground: grey grass, heath, stones, a few spruce that
// have never got above a man's height, and the dead ones standing. It is there to be looked across.
function bog(ctx, forest) {
  const rnd = rng(2761), ex = forest.extras, g = grove(), DIMG = [0.36, 0.42, 0.38];
  const at = (s, out, lift = 0) => onBank(s, -1, out, lift), here = (s) => river.at(s, {}).heading;
  for (let k = 0; k < 11; k++) { const s = 260 + rnd() * 36, out = 1.5 + rnd() * rnd() * 34, p = at(s, out, -0.3), q = new THREE.Quaternion().setFromAxisAngle(V3(Math.cos(k * 2.4), 0, Math.sin(k * 2.4)), 0.04 + rnd() * 0.2), sc = 0.4 + rnd() * 0.4; stamp(g, forest.T.snag[k % 3][1], new THREE.Matrix4().compose(p, q, V3(sc, sc, sc)), [0.8, 0.86, 0.9]); }
  for (let k = 0; k < 8; k++) { const s = 262 + rnd() * 32, p = at(s, 2 + rnd() * 26, -0.2); stamp(g, forest.T.spruce[k % 6][1], M4(p, rnd() * TAU, 0.16 + rnd() * 0.2), [0.7, 0.74, 0.76]); }
  for (let k = 0; k < 260; k++) {
    const s = 258.5 + rnd() * 38, out = 0.4 + Math.pow(rnd(), 1.7) * 36, p = at(s, out, -0.04), pick = rnd();
    g.cut.add((pick < 0.55 ? ex.grass[k % 3] : pick < 0.85 ? ex.heath[k % 2] : ex.ferns[k % 4]).cut, M4(p, rnd() * TAU, 0.9 + rnd() * 1.1), pick < 0.85 ? DIMG : [0.26, 0.34, 0.26]);
  }
  for (let k = 0; k < 46; k++) { const s = 258.5 + rnd() * 37, p = at(s, -0.15 - rnd() * 1.3, 0); p.y = 0; g.cut.add(ex.reeds[k % 3].cut, M4(p, rnd() * TAU, 0.7 + rnd() * 0.5), [0.24, 0.28, 0.25]); }
  for (let k = 0; k < 16; k++) { const s = 259 + rnd() * 36, p = at(s, 0.5 + rnd() * 30, -0.25); g.solid.add((k % 5 ? ex.boulders[k % 5] : ex.bigBoulders[k % 3]).solid, M4(p, rnd() * TAU, k % 5 ? 0.5 + rnd() * 0.9 : 1.2 + rnd()), [0.56, 0.6, 0.58]); }
  ctx.world.add(groveMeshes(ctx, g, 'bog'), 281, true);
  const puffs = [];
  for (let k = 0; k < 9; k++) { const p = at(262 + rnd() * 32, 4 + rnd() * 26, 0.7 + rnd() * 0.5); puffs.push({ x: p.x, y: p.y, z: p.z, width: 8 + rnd() * 8, height: 1.0 + rnd() * 0.8, opacity: 0.22 + rnd() * 0.16, drift: 0.4 + rnd() * 0.6 }); }
  ctx.world.add(makeMist(puffs), 281, false);
}

// ------------------------------------------------------------------------------------------------ the jotun
// He is built as a hill is: bedded rock in planes, the big masses first. What makes the hill a head is three
// things only (a brow that overhangs, the hollows under it, and the nose), and the drawing is careful to add
// nothing else, so that for the length of the pool it may still be a hill. What gives him his size is the wood:
// spruces of the ordinary kind stand on his shoulders like the bristles on a boar.
// His own frame: he looks along +z, +x is his left (the river's side), the water is y = 0.
const PARTS = {
  back: [0, 14, -5, 22, 20, 14], chest: [0.5, 12, 5, 12, 12, 7.5],
  shL: [14.5, 25, 0.5, 9.5, 8, 8.5], shR: [-14.5, 24, 0, 9.5, 7.6, 8.5], slL: [23, 13, -1.5, 8, 12.5, 8.5], slR: [-24, 12, -1.5, 9.5, 12, 9],
  skull: [0.6, 27.5, 8.5, 8.3, 9.2, 8.6],
};
function jotun(ctx, forest) {
  const { s: S, side, out, yaw } = JOTUN, o = onBank(S, side, out); o.y = 0;
  const G = frame(o, S, yaw), rnd = rng(2961), ex = forest.extras;
  const body = new Builder(40000), dark = new Builder(600), g = grove();
  const COLD = [0.8, 0.86, 0.9];
  let seed = 2900;
  const C = (x, y, z, rx, ry, rz, detail = 2, bed = 1.7, rough = 0.28, into = body) => crag(into, x, y, z, rx, ry, rz, seed++, detail, COLD, rough, bed, 1);
  /** split stone along a path of [x, y, z, r]: the nose, the brows, the fingers */
  const run = (pts, sides = 6, into = body) => { const t = new Builder(pts.length * sides + 8), sd = seed++; tube(t, pts, sides, (i, j) => stoneAt(i * 0.22 + sd, j * 0.3 + sd * 0.7, COLD), null, stoneAt(sd, 3.3, COLD)); into.add(facet(t)); };
  // the hill that is his back; the chest; the shoulders, hunched as high as his head, and the slope each makes down to the ground
  C(...PARTS.back, 3, 3.0); C(...PARTS.chest, 2, 2.2); C(...PARTS.shL, 2, 2.0); C(...PARTS.shR, 2, 2.0); C(...PARTS.slL, 2, 2.4); C(...PARTS.slR, 2, 2.4);
  // the head, sunk between them and thrust forward
  C(...PARTS.skull, 3, 1.6, 0.18);
  // the brows: two ridges that meet over the nose and come down at their outer ends, and the boss of the forehead between them
  for (const m of [1, -1]) run([[0.6 + m * 1.0, 31.3, 16.5, 1.5], [0.6 + m * 4.2, 31.8, 16.0, 2.0], [0.6 + m * 7.3, 30.5, 13.8, 1.7], [0.6 + m * 8.7, 28.2, 10.6, 1.0]], 6);
  C(0.6, 32.9, 14.8, 3.2, 2.3, 2.8, 2, 0, 0.26);
  // the nose: long, and heaviest at its end, which hangs below the mouth; the wings of the nostrils
  run([[0.6, 31.2, 16.9, 1.3], [0.7, 28.6, 18.5, 1.6], [0.8, 25.6, 20.1, 2.1], [0.9, 22.7, 21.2, 2.6], [0.9, 20.5, 21.0, 2.3], [0.9, 19.3, 19.8, 1.3]], 6);
  C(3.0, 21.7, 19.0, 1.6, 1.5, 1.7, 1, 0, 0.2); C(-1.2, 21.7, 19.0, 1.6, 1.5, 1.7, 1, 0, 0.2);
  // the cheekbones, the lower lip, the jaw
  C(6.0, 26.0, 15.0, 3.3, 2.7, 3.1, 2, 0, 0.26); C(-4.8, 26.0, 15.0, 3.3, 2.7, 3.1, 2, 0, 0.26);
  C(0.6, 18.4, 16.2, 3.8, 1.2, 2.3, 1, 0, 0.22); C(0.6, 18.3, 12.5, 6.6, 3.1, 5.2, 2, 0, 0.24);
  // the arms: each a run of boulders. The one on the river's side comes down to an elbow on the bank and lies out along it
  const chain = (pts, detail = 2) => {
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1], len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]), n = Math.max(1, Math.round(len / ((a[3] + b[3]) * 0.5)));
      for (let k = 0; k < n; k++) { const t = (k + 0.5) / n, r = a[3] + (b[3] - a[3]) * t; C(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, r * (0.95 + rnd() * 0.2), r * (0.95 + rnd() * 0.2), r * (0.95 + rnd() * 0.2), detail, 1.7, 0.3); }
    }
  };
  chain([[16, 24, 3, 5.6], [18, 14, 6, 4.8], [18.8, 5.5, 10, 4.4], [18, 3.4, 15, 3.3], [17, 2.2, 19.5, 2.7]]);
  chain([[-17, 23, 1, 5.4], [-20, 11, 4, 4.8], [-22, 3, 7, 4.4]]);
  // the hand, open, palm up, in the shallows: the heel and the ball of the thumb, four fingers a little curled, the thumb laid along them
  const Hm = new THREE.Matrix4().makeTranslation(16.2, 0, 22.5).multiply(new THREE.Matrix4().makeRotationY(-0.295)), hand = new Builder(5000);
  const Hc = (x, y, z, rx, ry, rz, detail = 1) => C(x, y, z, rx, ry, rz, detail, 0, 0.2, hand);
  Hc(0, 0.3, 0, 3.3, 1.25, 3.4, 2); Hc(-2.0, 0.8, -1.3, 1.5, 1.15, 2.0); Hc(2.2, 0.9, -1.4, 1.6, 1.25, 2.1);
  [4.6, 5.6, 6.0, 5.4].forEach((L, i) => { const x = (i - 1.5) * 1.62, z0 = 2.4, sp = (i - 1.5) * 0.05;
    run([[x, 0.5, z0, 0.8], [x + sp * 2, 0.55, z0 + L * 0.3, 0.72], [x + sp * 3, 0.64, z0 + L * 0.42, 0.88], [x + sp * 5, 0.74, z0 + L * 0.66, 0.66], [x + sp * 6, 0.95, z0 + L * 0.77, 0.78], [x + sp * 7, 1.45, z0 + L * 0.99, 0.54], [x + sp * 7, 1.8, z0 + L * 1.09, 0.3]], 6, hand); });
  run([[2.6, 0.9, -0.8, 1.05], [3.6, 0.9, 1.5, 0.95], [4.0, 1.0, 2.6, 1.05], [4.05, 1.2, 4.2, 0.78], [3.95, 1.6, 5.3, 0.55], [3.85, 1.9, 5.9, 0.3]], 6, hand);
  body.add(hand, Hm);
  // what the hill has let fall at his feet
  const cs = Math.cos(yaw), sn = Math.sin(yaw);
  for (let k = 0; k < 22; k++) { const x = -27 + rnd() * 38, z = 10 + rnd() * 11 - Math.abs(x) * 0.14, r = 1.8 + rnd() * 3.2; if (x * cs + z * sn > out - 3 - r) continue; C(x, 1.2 + rnd() * 3.6, z, r * 1.2, r * 0.8, r * 1.1, 1, 1.4, 0.3); }
  // the hollows under the brows, which no moss gets into: narrow, and set back between brow and cheek
  for (const m of [1, -1]) crag(dark, 0.6 + m * 4.0, 29.2, 15.9, 2.0, 0.95, 1.0, 2990 + m, 1, [0.1, 0.11, 0.14], 0.1, 0, 1);

  // ---- his beard is lichen: from the cheeks, from under the nose, from the jaw; and what hangs from the brows and the arm
  const beard = (x, y, z, w, len, a, k) => hang(g.cut, x, y, z, w, len, a, BEARD, mulCol([0.56, 0.62, 0.6], k), G);
  for (let k = 0; k < 16; k++) { const a = -1.35 + 2.7 * (k + rnd() * 0.6) / 16; if (Math.abs(a) < 0.3) continue; beard(0.6 + Math.sin(a) * 8.2, 24.6 + rnd() * 0.8, 9.5 + Math.cos(a) * 7.6, 3.2 + rnd() * 1.2, 9 + rnd() * 5, a + (rnd() - 0.5) * 0.4, 0.42 + rnd() * 0.25); }
  for (const m of [1, -1]) for (let k = 0; k < 3; k++) beard(0.8 + m * (2.2 + k * 1.1), 21.2 - k * 0.3, 19.0 - k * 0.9, 2.2, 6.5 + rnd() * 3, m * (0.3 + k * 0.25), 0.5 + rnd() * 0.2);
  for (let k = 0; k < 16; k++) { const a = -1.4 + 2.8 * (k + rnd() * 0.6) / 16; beard(0.6 + Math.sin(a) * 6.4, 18.6 + rnd() * 0.6, 12.5 + Math.cos(a) * 5.2, 3.0 + rnd() * 1.4, 9 + rnd() * 6 * Math.cos(a * 0.6), a + (rnd() - 0.5) * 0.4, 0.36 + rnd() * 0.25); }
  for (const m of [1, -1]) for (let k = 0; k < 5; k++) { const t = (k + rnd() * 0.5) / 5; beard(0.6 + m * (1.6 + 6.6 * t), 30.2 - 1.2 * t * t, 17.6 - 3.4 * t * t, 1.7, 1.0 + rnd() * 1.2, m * t * 0.9, 0.34 + rnd() * 0.15); }
  for (let k = 0; k < 18; k++) { const t = rnd(), x = 16.5 + 3 * t - 1.5 * t * t, y = 19 - 15 * t, z = 3.5 + 9 * t; beard(x + (rnd() - 0.5) * 4, y, z + (rnd() - 0.5) * 3, 1.2 + rnd(), 2.5 + rnd() * 3.5, rnd() * TAU, 0.4 + rnd() * 0.25); }
  // ---- the wood on him
  const topOf = ([cx, cy, cz, rx, ry, rz], x, z) => { const q = 1 - ((x - cx) / rx) ** 2 - ((z - cz) / rz) ** 2; return q > 0.06 ? cy + ry * Math.sqrt(q) * 0.94 : null; };
  const tree = (i, lod, x, y, z, sc) => {
    const dk = 0.7 + rnd() * 0.16, tint = [dk, dk * 1.04, dk * 1.08];
    stamp(g, forest.T.spruce[i][lod], G.clone().multiply(M4(V3(x, y, z), rnd() * TAU, sc)), tint);
  };
  const grow = (part, n, lod, sc0, sc1, spread = 0.8) => {
    for (let k = 0; k < n; k++) {
      const x = part[0] + (rnd() * 2 - 1) * part[3] * spread, z = part[2] + (rnd() * 2 - 1) * part[5] * spread, y = topOf(part, x, z);
      if (y === null || (Math.abs(x - 0.6) < 11 && z > 0.5)) continue;                         // nothing grows in front of his face
      tree(k % 6, lod, x, y - 0.8, z, sc0 + rnd() * (sc1 - sc0));
    }
  };
  grow(PARTS.shL, 11, 1, 0.45, 0.8); grow(PARTS.shR, 11, 1, 0.45, 0.8); grow(PARTS.back, 22, 2, 0.6, 0.95, 0.9); grow(PARTS.slL, 6, 1, 0.5, 0.85); grow(PARTS.slR, 7, 2, 0.5, 0.85);
  for (const [i, x, z, sc] of [[0, -2.2, 6.4, 0.4], [2, 3.4, 5.6, 0.34], [4, 0.4, 3.2, 0.52], [1, -4.9, 3.6, 0.38], [3, 5.9, 2.9, 0.42], [5, -0.6, 0.4, 0.48], [0, 1.8, 9.4, 0.24], [2, -3.0, 9.0, 0.2]]) tree(i, 1, x, topOf(PARTS.skull, x, z) - 0.6, z, sc);
  // near the canoe, on his forearm and round the hand: fern and grass, of the size the canoe knows
  for (let k = 0; k < 40; k++) {
    const t = rnd(), x = 18.3 - 1.6 * t + (rnd() - 0.5) * 4, z = 12 + 12 * t + (rnd() - 0.5) * 3, y = 6.3 - 4.2 * t + rnd() * 0.4;
    g.cut.add((k % 3 ? ex.ferns[k % 4] : ex.grass[k % 3]).cut, G.clone().multiply(M4(V3(x, y, z), rnd() * TAU, 1.3 + rnd() * 1.6)), [0.3, 0.4, 0.28]);
  }
  const stone = new Builder(body.nv); stone.add(body, G); const hollow = new Builder(dark.nv); hollow.add(dark, G);
  // he is too big to belong to one stretch of the river: he is always in the world, and hidden when far up or down it
  const pieces = [new THREE.Mesh(stone.build({ uv: false, bend: false }), ctx.mats.jotun), groveMeshes(ctx, g, 'jotun growth')], twins = [];
  pieces[0].name = 'jotun'; for (const p of pieces) twins.push(ctx.world.add(p, null, true));
  const hollows = new THREE.Mesh(hollow.build({ uv: false, bend: false }), ctx.mats.bare); hollows.name = 'jotun hollows'; ctx.world.add(hollows, null, false); pieces.push(hollows);

  // ---- the hand stands in the canoe's water
  const at = (x, y, z) => V3(x, y, z).applyMatrix4(G), inHand = (x, y, z) => V3(x, y, z).applyMatrix4(Hm).applyMatrix4(G);
  for (const [x, z, r] of [[0, 0, 3.5], [0, 4.4, 3.2], [0, 7.4, 3.0], [3.6, 3.2, 1.8], [-1, -4, 3]]) { const p = inHand(x, 0, z); ctx.obstacles.push({ x: p.x, z: p.z, r }); }
  // ---- what light the night has left comes down on his face through the gap he keeps in the wood
  const key = { position: at(14, 44, 40), color: new THREE.Color('#a8dcd2'), radius: 80, intensity: 1.0, glint: false };
  ctx.lights.push(key);
  // ---- the lantern in his hand
  const kept = lamp(ctx, inHand(0.5, 1.6, 0.9), S - 14, 2.0);
  // ---- the eye
  const eyeAt = at(4.7, 29.15, 17.0), right = V3(1, 0, 0).transformDirection(G), fwd = V3(0, 0, 1).transformDirection(G), headAt = at(0.6, 28, 8.5);
  const pupil = ctx.glows.add({ position: eyeAt.clone(), size: 0.85, color: new THREE.Color('#d2fff0'), power: 0 }), halo = ctx.glows.add({ position: eyeAt.clone(), size: 5.2, color: new THREE.Color('#7fd8c0'), power: 0 });
  let open = 0, spoke = false;
  const v = V3(), breath = ctx.voice('breath', headAt, 170, true);
  // ---- his breath. Each time he lets it go it comes down off his lip, crosses the pool and goes on into the wood on
  // the far side: mist that is only there while it passes, the water ruffled under it, every bough leaning away
  const mouth = at(0.8, 19.3, 19.8), puffs = [], down = V3(0, -0.76, 0.65).normalize(), COLD_AIR = new THREE.Color('#c4ecdf');
  for (let k = 0; k < 11; k++) { const D = 3.5 + k * 2.0, p = at(0.8 + down.x * D + (rnd() - 0.5) * 2.4, 19.3 + down.y * D + (rnd() - 0.5) * 1.2, 19.8 + down.z * D); puffs.push({ x: p.x, y: p.y, z: p.z, width: 3.4 + k * 0.5, height: 3.2 + k * 0.22, opacity: 0.85, drift: 0.3 }); }
  for (let k = 0; k < 18; k++) {
    const D = 25 + k * 1.9 + rnd() * 1.5, r = Math.sqrt(D * D - 18.2 * 18.2), a = ((k * 0.618) % 1 - 0.5) * 1.0, p = at(0.8 + Math.sin(a) * r, 1.3 + rnd() * 0.8, 19.8 + Math.cos(a) * r);
    puffs.push({ x: p.x, y: p.y, z: p.z, width: 5.5 + rnd() * 3.5, height: 2.3 + rnd() * 1.2, opacity: 0.5 - k * 0.014, drift: 0.3 });
  }
  const sigh = makeMist(puffs, { front: [1, 0, 1.8], puff: breathPuff() }); sigh.name = 'his breath'; ctx.world.add(sigh, null, false); pieces.push(sigh);
  ctx.ticks.push((dt, time, boat, look, eye) => {
    const seen = boat.s > 140 && boat.s < 440;
    for (const p of pieces) p.visible = seen; for (const t of twins) t.visible = seen;
    if (!seen) { pupil.power = halo.power = breath.level = 0; return; }
    const d = v.copy(eye).sub(headAt).length();
    // he wakes to a light on the river, slowly, and loses interest in what has gone by
    const want = smooth(128, 84, d) * (v.dot(fwd) > -14 ? 1 : 0);
    open += (want - open) * (boat.frozen ? 1 : Math.min(1, dt * (want > open ? 0.4 : 0.8)));
    // he is heard before he is seen: asleep he breathes, and the waking of him is stone moving
    breath.level = 0.45 + 0.55 * open;
    // (the same clock he is heard by, in src/ifing/audio.js: he lets go at 0.44 of each 7.2 seconds)
    if (d < 170) { const R = (((time / 7.2) % 1 + 0.56) % 1) * 7.2 * 7, k = (0.5 + 0.5 * open) * smooth(2, 8, R) * (1 - smooth(36, 50, R)); ctx.front(mouth, R, 4.6, 5.5 * k, 0.55 * k, COLD_AIR); }
    if (!spoke && open > 0.3 && want > open && !boat.frozen) { spoke = true; ctx.hit('groan', headAt); } else if (open < 0.08) spoke = false;
    const blink = 1 - smooth(0.965, 0.99, Math.sin(time * 0.37 + 1.2) * Math.sin(time * 0.11));
    // the eye follows the canoe: a hand's breadth (his hand) is all it can move in its hollow
    v.normalize();
    pupil.position.copy(eyeAt).addScaledVector(right, v.dot(right) * 0.6).addScaledVector(UP, v.y * 0.3); halo.position.copy(pupil.position);
    const lid = open * open * blink;
    pupil.power = 3.4 * lid; halo.power = 0.26 * lid;
    key.intensity = 0.9 + 0.25 * open;
  });
  return { kept };
}

// ------------------------------------------------------------------------------------------------ eyes in the wood
// Pairs of them, low, back among the trunks: wolves, or what the Ironwood has instead. They are there at forty
// metres and gone at fourteen. Nothing is ever seen but the eyes.
function watchers(ctx) {
  const green = new THREE.Color('#d6ffa8');
  const packs = [[160, -1, 9], [174, 1, 12], [186, -1, 7.5], [213, 1, 10], [238, 1, 15], [264, 1, 11], [300, 1, 9], [334, 1, 11], [356, 1, 8]].map(([s, side, out], i) => {
    const p = onBank(s, side, out, 0.62 + (i % 3) * 0.1);
    return { p, ph: i * 2.4, a: ctx.glows.add({ position: p.clone(), size: 0.1, color: green, power: 0 }), b: ctx.glows.add({ position: p.clone(), size: 0.1, color: green, power: 0 }) };
  });
  ctx.ticks.push((dt, time, boat, look, eye) => {
    for (const w of packs) {
      const dx = eye.x - w.p.x, dz = eye.z - w.p.z, d = Math.hypot(dx, dz) || 1;
      if (d > 60) { w.a.power = w.b.power = 0; continue; }
      const blink = Math.sin(time * 0.83 + w.ph) * Math.sin(time * 0.29 + w.ph * 1.7) > 0.93 ? 0 : 1;
      const k = smooth(50, 38, d) * smooth(13, 19, d) * blink * 1.5, e = 0.05;
      w.a.position.set(w.p.x - dz / d * e, w.p.y, w.p.z + dx / d * e); w.b.position.set(w.p.x + dz / d * e, w.p.y, w.p.z - dx / d * e);
      w.a.power = w.b.power = k;
    }
  });
}

// ------------------------------------------------------------------------------------------------ corpse-lights
// Where the reach ends and the mist thickens toward the gate: pale lights low over the water that keep ahead of
// the canoe and go out when it comes up with them. (The old advice is not to follow. Here they happen to be right.)
function lights(ctx) {
  const pale = new THREE.Color('#a8dcff'), blue = new THREE.Color('#5f9fe0'), rnd = rng(3301), list = [], motes = [];
  for (let k = 0; k < 6; k++) {
    const s = 322 + k * 8 + rnd() * 4, hw = river.halfWidth(s), home = spot(s, (k % 2 ? 0.2 : 0.75) * hw * (0.5 + rnd() * 0.5), 0.9 + rnd() * 0.5);
    list.push({ home, ph: rnd() * 10, core: ctx.glows.add({ position: home.clone(), size: 0.2, color: pale, power: 0, flicker: 0.25 }), halo: ctx.glows.add({ position: home.clone(), size: 1.5, color: blue, power: 0, flicker: 0.25 }) });
    for (let q = 0; q < 6; q++) motes.push({ x: home.x + (rnd() - 0.5) * 3, y: home.y + (rnd() - 0.5) * 0.8, z: home.z + (rnd() - 0.5) * 3, roam: 1.2 + rnd(), size: 0.014 + rnd() * 0.012, speed: 0.4 + rnd() * 0.5, kind: 0, color: [0.5, 0.85, 1.3] });
  }
  ctx.world.add(makeMotes(motes), 330, true);
  ctx.ticks.push((dt, time, boat, look, eye) => {
    for (const w of list) {
      const d = Math.hypot(eye.x - w.home.x, eye.z - w.home.z);
      if (d > 110) { w.core.power = w.halo.power = 0; continue; }
      const t = time * 0.5 + w.ph, k = smooth(90, 60, d) * smooth(5, 12, d) * (0.75 + 0.25 * Math.sin(t * 2.3));
      w.core.position.set(w.home.x + Math.sin(t * 0.62) * 1.8 + Math.sin(t * 1.7) * 0.4, w.home.y + Math.sin(t * 1.1) * 0.35, w.home.z + Math.cos(t * 0.47) * 2.4);
      w.halo.position.copy(w.core.position);
      w.core.power = 2.4 * k; w.halo.power = 0.42 * k;
    }
  });
}

// ------------------------------------------------------------------------------------------------ the air
function air(ctx) {
  const rnd = rng(1311), puffs = [], flies = [];
  for (let s = 122; s < 362; s += 5) {
    if (s > 232 && s < 300 && rnd() < 0.65) continue;                         // the pool is kept clearer: he is to be seen across it
    const hw = river.halfWidth(s), p = spot(s, (rnd() - 0.5) * hw * 1.7, 0.35 + rnd() * 0.3);
    puffs.push({ x: p.x, y: p.y, z: p.z, width: 6 + rnd() * 8, height: 0.9 + rnd() * 1.1, opacity: 0.3 + rnd() * 0.25, drift: 0.5 + rnd() });
  }
  const half = Math.floor(puffs.length / 2);
  ctx.world.add(makeMist(puffs.slice(0, half)), 180, false); ctx.world.add(makeMist(puffs.slice(half)), 300, false);
  for (let k = 0; k < 70; k++) {
    const s = 128 + rnd() * 106, side = rnd() < 0.5 ? -1 : 1, p = onBank(s, side, -1 + rnd() * 6, 0.4 + rnd() * 2.2);
    flies.push({ x: p.x, y: p.y, z: p.z, roam: 0.8 + rnd() * 1.4, size: 0.014 + rnd() * 0.012, speed: 0.3 + rnd() * 0.5, kind: 0, color: [0.8, 1.25, 0.4] });
  }
  ctx.world.add(makeMotes(flies.filter((f, i) => i % 2 === 0)), 150, true); ctx.world.add(makeMotes(flies.filter((f, i) => i % 2 === 1)), 210, true);
}
