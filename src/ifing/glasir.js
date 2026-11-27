// Glasir: the grove whose leaves are red gold, the tree it is named for, and the loom that hangs from it.
//
// "Glasir stands with golden leaf before the halls of the god of victories." The reach is the one place on the river
// where the light does not come from the sky: it is night above, blue-black and full of stars, and everything under
// it is lit by leaves. The long straight that leads in was laid out for one picture: at its end, where the river
// turns and widens, the tree itself, five metres through the bole and forty-six high, its crown over the whole pool.
//
// From its lowest limb, which goes clean across the water, hangs a loom of the old upright kind: a cloth beam on
// ropes, the web below it, the warp below that in threads of light held taut by ringed stones a hand above the
// water. The web is the river so far (src/ifing/art.js draws it): boathouse, giant, gate, ship, and the tree only
// begun; somebody's weaving sword is still in the shed. The middle threads are looped up short, and the canoe goes
// through under them. It is the fourth of the keeper's lights and the only one that is not a flame.
//
// Past the pool, in the shallows, a white stag: Eikthyrnir, from whose antlers the water drips that all the rivers
// come from. He is the one cold thing in the grove. He watches the canoe go by.
import * as THREE from 'three';
import { Builder, mulCol, mixCol } from './build.js';
import { tube, lump, bell } from './flora.js';
import { river } from './river.js';
import { BARK_U, barkSheet, region, WOOD_U, loomCloth, LOOM_FELL } from './art.js';
import { makePaint } from './paint.js';
import { rng, smooth } from './noise.js';
import { makeMist, makeMotes, makeLeaves, makeThreads } from './fx.js';
import { spot, frame, TAU } from './kit.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
export const TREE = { s: 746, out: 5.5 }, STAG = { s: 779 };
const G_TOP = [1.0, 0.9, 0.5], G_MID = [0.95, 0.72, 0.22], G_RED = [0.85, 0.5, 0.16];

export function buildGlasir(ctx) {
  ctx.clearings.push({ s0: TREE.s - 11, s1: TREE.s + 11, side: 1, out0: -2, out1: 17 });
  ctx.clearings.push({ s0: STAG.s - 5, s1: STAG.s + 5, side: -1, out0: -3, out1: 2.5 });
  ctx.planters.push((forest) => { tree(ctx, forest); stag(ctx); air(ctx, forest); });
}

// ------------------------------------------------------------------------------------------------ the tree
function tree(ctx, forest) {
  // Its frame: the middle of the bole at the level of the water, +x away from the river, +z upstream.
  const S = TREE.s, hw = river.halfWidth(S), F = frame(spot(S, hw + TREE.out, 0), S), rnd = rng(7461), at = (x, y, z) => V3(x, y, z).applyMatrix4(F);
  const XL = -(TREE.out + 2 * hw), XC = -(TREE.out + hw);                                    // the far bank and the middle of the channel
  const bk = new Builder(6000), lf = new Builder(9000), U = BARK_U.birch, REG = [region('birch'), region('birchB')];
  const pale = (k = 1) => { const v = (0.82 + rnd() * 0.18) * k; return [v, v * 0.96, v * 0.86]; };

  // ---- the bole: fluted at the foot like a pillar that has been stood on for a long time
  const rings = [[0, -1.6, 0, 5.2, 0.5], [0, 0.3, 0, 4.2, 0.45], [0, 1.5, 0, 3.3, 0.34], [0.1, 3.2, 0, 2.75, 0.2], [0.2, 6, 0.1, 2.45, 0.1], [0.15, 9, 0.05, 2.3, 0.05], [0, 12, 0, 2.2, 0.04], [-0.1, 14.6, 0, 2.35, 0.06]];
  { const sides = 18, first = bk.nv; let run = 0;
    rings.forEach((p, i) => {
      if (i) run += Math.hypot(p[0] - rings[i - 1][0], p[1] - rings[i - 1][1], p[2] - rings[i - 1][2]);
      for (let j = 0; j <= sides; j++) {
        const th = j / sides * TAU, crest = 0.5 + 0.5 * Math.cos(th * 7 + i * 0.35), k = 1 + p[4] * (crest - 0.35), cs = Math.cos(th), sn = Math.sin(th), t = (j / sides * 3) % 1;
        bk.vert(p[0] + cs * p[3] * k, p[1], p[2] + sn * p[3] * k, cs, 0.12, sn, pale(0.62 + 0.38 * crest * Math.min(1, p[4] * 4) + 0.38 * (1 - Math.min(1, p[4] * 4))), U[0] + (U[1] - U[0]) * (1 - Math.abs(2 * t - 1)), run / 5);
      }
    });
    for (let i = 0; i < rings.length - 1; i++) for (let j = 0; j < sides; j++) { const a = first + i * (sides + 1) + j; bk.quad(a, a + 1, a + sides + 2, a + sides + 1); }
  }
  // ---- roots: they go out a long way before they go under, and the ones on the river's side go into the water
  for (let k = 0; k < 10; k++) {
    const a = k / 10 * TAU + (rnd() - 0.5) * 0.3, cs = Math.cos(a), sn = Math.sin(a), far = 9 + rnd() * 5, wob = (rnd() - 0.5) * 0.5, arch = cs < -0.3 ? 0.5 + rnd() * 0.6 : 0;
    const P = (d, y, r) => [cs * d - sn * wob * d * 0.12, y, sn * d + cs * wob * d * 0.12, r];
    tube(bk, [P(2.9, 2.2, 1.0), P(4.6, 1.5 + arch * 0.4, 0.8), P(far * 0.55, 0.9 + arch, 0.58), P(far * 0.8, 0.3 + arch * 0.5, 0.4), P(far, -0.5, 0.24), P(far + 1.6, -1.3, 0.1)], 7, () => pale(0.8), null, false, U, 3);
  }
  // ---- the limbs, and on them the leaves: bells of gold, the low ones weeping toward the water
  const tintAt = (body) => (z) => (z === 0 ? mixCol(body, G_TOP, 0.6) : z === 1 ? mixCol(body, G_TOP, 0.3) : z === 2 ? body : mixCol(body, G_RED, 0.6));
  const crown = (x, y, z, r, weep = 0.9) => { const w = rnd(); bell(lf, x, y + r * 0.2, z, r, r * 0.62, r * weep * (0.8 + rnd() * 0.5), 10, REG, tintAt(mixCol(G_MID, G_RED, w * w * 0.7)), 0.7, rnd); };
  // under the rim of a low crown hang smaller bells at their own heights, as wisteria hangs: a garden of them, not one sheet
  const weepers = (x, y, z, r, n) => {
    for (let k = 0; k < n; k++) {
      const a = rnd() * TAU, d = r * (0.45 + 0.5 * rnd()), rr = 1.5 + rnd() * 1.3, w = rnd();
      bell(lf, x + Math.cos(a) * d, y - r * 0.2 - rnd() * 2.6, z + Math.sin(a) * d, rr, rr * 0.5, rr * (1.5 + rnd() * 1.4), 6, REG, tintAt(mixCol(G_TOP, G_MID, w)), 1.0, rnd);
    }
  };
  const LOOM = [[-1.2, 10.6, 1.0, 1.3], [-5.5, 12.4, 1.7, 1.1], [-12, 13.2, 2.0, 0.9], [-19.5, 13.1, 1.8, 0.7], [-26.5, 12.9, 1.4, 0.52], [-32, 13.8, 0.9, 0.3], [-35.5, 15.5, 0.4, 0.12]];
  const LIMBS = [
    [[-0.5, 14, 0.5, 1.5], [-3, 20, 3, 1.2], [-7, 26, 6, 0.9], [-11, 31, 9, 0.6], [-14, 35, 11, 0.3]],
    [[0.6, 14, -0.4, 1.5], [3.5, 20, -3, 1.2], [7, 27, -5, 0.85], [9, 33, -8, 0.5], [10, 37, -10, 0.25]],
    [[0, 14, 0, 1.6], [0.5, 21, -0.5, 1.3], [-0.5, 29, 0.5, 1.0], [0.5, 37, 0, 0.6], [0, 43, 0.5, 0.25]],
    [[-0.8, 13, -0.8, 1.3], [-5, 18, -5, 1.0], [-11, 22, -10, 0.75], [-17, 25, -14, 0.5], [-22, 27, -17, 0.25]],
    [[0.8, 13.5, 0.8, 1.3], [5, 19, 5, 1.0], [10, 23, 9, 0.7], [15, 26, 12, 0.4]],
    [[-0.9, 12.5, 1.2, 1.2], [-6, 17, 6, 0.95], [-13, 20.5, 11, 0.7], [-20, 22.5, 15, 0.45], [-25, 24, 18, 0.22]],
    [[0.9, 11.5, -1.0, 1.1], [6, 14.5, -5, 0.85], [12, 16.5, -9, 0.55], [17, 18, -12, 0.3]],
    [[-1.0, 13.5, -0.2, 1.2], [-7, 19.5, -1, 0.95], [-15, 24, -2, 0.7], [-23, 27, -1, 0.45], [-29, 29, 1, 0.2]],
  ];
  tube(bk, LOOM, 9, () => pale(0.9), null, true, U, 4);
  for (const L of LIMBS) {
    tube(bk, L, 8, () => pale(0.9), null, true, U, 4);
    for (let i = 2; i < L.length; i++) {
      const p = L[i], low = p[0] < -4 && p[1] < 28;                                         // over the water: these hang their hems down
      { const r = 5.2 + rnd() * 2.6; crown(p[0], p[1] + 1, p[2], r, 0.85); if (low) weepers(p[0], p[1] + 1, p[2], r, 6); }
      // a spray off the limb, and its own bell
      const a = rnd() * TAU, len = 4 + rnd() * 4, q = [p[0] + Math.cos(a) * len, p[1] + 2 + rnd() * 3, p[2] + Math.sin(a) * len];
      tube(bk, [[p[0], p[1], p[2], p[3] * 0.6], [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2 + 0.6, (p[2] + q[2]) / 2, p[3] * 0.4], [q[0], q[1], q[2], 0.08]], 5, () => pale(0.85), null, false, U, 4);
      { const r = 4 + rnd() * 2.4; crown(q[0], q[1], q[2], r, 0.85); if (low) weepers(q[0], q[1], q[2], r, 4); }
    }
  }
  for (const [x, y, z, r] of [[-30, 16.5, 0.8, 4.6], [-35, 17.5, 0.2, 4.2], [-33, 20, 3, 4.5], [-8, 17.5, 3.5, 3.6], [-16, 18.5, 4.5, 3.8], [-23.5, 18, 3.6, 3.6]]) crown(x, y, z, r, 0.7);      // on the loom's limb, clear of the web
  for (let k = 0; k < 16; k++) { const a = rnd() * TAU, d = 4 + rnd() * 15, y = 30 + rnd() * 12 - d * 0.5; crown(Math.cos(a) * d - 3, y, Math.sin(a) * d, 5 + rnd() * 3, 0.8); }                    // the head of the crown

  const barkMat = makePaint({ map: barkSheet(), color: '#fff0d4', brush: 0.12, brushScale: 0.6, rim: { color: '#ffe2a8', strength: 0.6, power: 3 }, fogScale: 0.5 });
  const leafMat = makePaint({ map: forest.sheet, cutout: true, alphaTest: 0.42, vertexLit: true, brush: 0, side: THREE.DoubleSide, inside: 0.92, backlight: 0.4, backColor: '#ffd070', emissive: '#5a3a10', fogScale: 0.5, sway: { amp: 0.35, speed: 1.0, flutter: 0.16 } });
  const grp = new THREE.Group(); grp.name = 'Glasir';
  { const b = new Builder(bk.nv); b.add(bk, F); grp.add(new THREE.Mesh(b.build({ bend: false }), barkMat)); const l = new Builder(lf.nv); l.add(lf, F); grp.add(new THREE.Mesh(l.build(), leafMat)); }
  const twin = ctx.world.add(grp, null, true);                                             // too big to belong to one stretch of the river: it is shown from the head of its reach
  { const p = at(0, 0, 0); ctx.obstacles.push({ x: p.x, z: p.z, r: 4.4 }); }

  // ---- the loom
  const X0 = XL + 1.3, X1 = -TREE.out - 1.7, ZL = 1.8, YB = 8.5, CW = 17, CH = CW * 40 / 256, CELL = CW / 256, CT = YB - 0.14;      // the cloth beam's ends; the web: 15 m of it, hung from the beam
  const lw = new Builder(1500), ws = new Builder(2500), rope = () => [0.78, 0.68, 0.46];
  const limbY = (x) => { let i = 0; while (i < LOOM.length - 2 && LOOM[i + 1][0] > x) i++; const a = LOOM[i], b = LOOM[i + 1], t = (x - a[0]) / (b[0] - a[0]); return a[1] + (b[1] - a[1]) * t - (a[3] + (b[3] - a[3]) * t) * 0.9; };
  tube(lw, [[X0 - 0.5, YB, ZL, 0.15], [X0 + 0.1, YB, ZL, 0.18], [(X0 + X1) / 2, YB - 0.05, ZL, 0.18], [X1 - 0.1, YB, ZL, 0.18], [X1 + 0.5, YB, ZL, 0.15]], 8, () => [0.86, 0.82, 0.76], null, [0.6, 0.56, 0.5], WOOD_U.carved, 0.9);
  for (let k = 0; k < 7; k++) { const x = X0 + 0.2 + (X1 - X0 - 0.4) * k / 6; tube(lw, [[x, limbY(x) + 0.1, ZL, 0.028], [x + 0.03, (limbY(x) + YB) / 2, ZL, 0.028], [x, YB + 0.16, ZL, 0.028]], 4, rope, null, false, WOOD_U.pale, 0.3); }
  // the heddle rod before the warp and the shed rod behind it, in two lengths each, and the cords they hang by
  for (const [x0, x1] of [[X0 + 0.1, XC - 2.5], [XC + 2.5, X1 - 0.1]]) {
    tube(lw, [[x0, 4.7, ZL + 0.24, 0.05], [x1, 4.7, ZL + 0.24, 0.05]], 6, () => [0.8, 0.76, 0.7], null, true, WOOD_U.pale, 1.5);
    tube(lw, [[x0, 2.5, ZL - 0.14, 0.045], [x1, 2.5, ZL - 0.14, 0.045]], 6, () => [0.74, 0.7, 0.66], null, true, WOOD_U.grey, 1.5);
    for (const x of [x0 + 0.15, x1 - 0.15]) tube(lw, [[x, YB - 0.15, ZL + 0.1, 0.014], [x, 4.75, ZL + 0.24, 0.014]], 3, rope, null, false, WOOD_U.pale, 0.3);
  }
  // the weaving sword, left in the shed where the last row was beaten up
  { const x = X0 + 238 * CELL, y = CT - 7 / 40 * CH; tube(lw, [[x - 1.5, y - 0.02, ZL + 0.05, 0.012], [x - 1.2, y, ZL + 0.05, 0.05], [x + 0.6, y + 0.02, ZL + 0.05, 0.045], [x + 1.0, y + 0.02, ZL + 0.05, 0.02], [x + 1.02, y + 0.02, ZL + 0.05, 0.035], [x + 1.3, y + 0.02, ZL + 0.05, 0.03]], 4, () => [1, 0.98, 0.9], null, true, WOOD_U.pale, 1); }
  // the web
  const cloth = new Builder(60);
  { const n = 24, row = []; for (let i = 0; i <= n; i++) { const x = X0 + CW * i / n, sag = 0.03 * Math.sin(i * 1.3); row.push([cloth.vert(x, CT, ZL, 0, 0, 1, [1, 1, 1], i / n, 0, 0), cloth.vert(x, CT - CH, ZL + sag, 0, 0, 1, [1, 1, 1], i / n, 1, 0.45)]); } for (let i = 0; i < n; i++) cloth.quad(row[i][0], row[i + 1][0], row[i + 1][1], row[i][1]); }
  // the warp, and the stones that hold it down: ringed, a bunch of threads to each
  const threads = [], ring = (x, y, r) => {                                 // a stone with a hole through it, no two alike, turned a little on its thread
    const pts = [], yaw = (rnd() - 0.5) * 1.4, cs = Math.cos(yaw), sn = Math.sin(yaw), ph = rnd() * TAU, ob = 0.75 + rnd() * 0.3, v0 = 0.24 + rnd() * 0.14;
    for (let i = 0; i <= 9; i++) { const a = i / 9 * TAU, rr = r * (1 + 0.16 * Math.sin(a * 2 + ph)), dx = Math.cos(a) * rr * ob; pts.push([x + dx * cs, y + Math.sin(a) * rr, ZL + dx * sn, r * (0.5 + 0.1 * Math.sin(a * 3 + ph))]); }
    tube(ws, pts, 5, (i, j) => { const v = v0 * (0.8 + 0.4 * ((i * 3 + j) % 4) / 4); return [v, v * 0.97, v * 0.92]; });
  };
  let n = 0, yBot = 1;
  for (let x = X0 + 0.04; x < X1 - 0.02; x += 0.06, n++) {
    const cx = (x - X0) / CELL, gap = Math.abs(x - XC) < 2.3;
    const top = cx < 206 ? CT - CH : cx < 244 ? CT - Math.min(40, 244 - cx) / 40 * CH : YB - 0.16;
    if (n % 8 === 0) { yBot = gap ? 3.9 + 0.25 * Math.sin(n) : 1.0 + 0.3 * rnd(); ring(x + 0.21, yBot - (gap ? 0.15 : 0.24), gap ? 0.12 : 0.2); }
    const p = at(x, top, ZL + (rnd() - 0.5) * 0.02);
    threads.push({ x: p.x, y: p.y, z: p.z, length: top - yBot, power: 1.5 + rnd() * 1.4, width: 0.009, sway: gap ? 0.012 : 0.03 + rnd() * 0.03 });
  }
  const warp = makeThreads(threads, '#ffd27a');
  const clothMat = makePaint({ map: loomCloth(), cutout: true, alphaTest: 0.5, brush: 0.2, brushScale: 0.8, side: THREE.DoubleSide, inside: 0.85, emissive: '#3a2008', sway: { amp: 0.1, speed: 0.6, flutter: 0.04 } });
  const loom = new THREE.Group(); loom.name = 'the loom';
  { const b = new Builder(lw.nv); b.add(lw, F); loom.add(new THREE.Mesh(b.build({ bend: false }), ctx.mats.wood)); const w = new Builder(ws.nv); w.add(ws, F); loom.add(new THREE.Mesh(w.build({ uv: false, bend: false }), ctx.mats.bare));
    const c = new Builder(cloth.nv); c.add(cloth, F); loom.add(new THREE.Mesh(c.build(), clothMat)); loom.add(warp); }
  ctx.world.add(loom, S, true);

  // ---- its light: on the water and the bole from the web, and in the air from the crown
  const web = { position: at(XC, 5.5, ZL + 1.5), color: new THREE.Color('#ffc24a'), radius: 21, intensity: 0.9 }, foot = { position: at(-4.5, 5, 3.5), color: new THREE.Color('#ffb040'), radius: 15, intensity: 0.7 };
  ctx.lights.push(web, foot);
  const halos = [[-6, 25, 2, 30, 0.07], [-16, 17, 2, 24, 0.07], [2, 34, 0, 26, 0.06], [-26, 20, 4, 20, 0.05], [XC, 5, ZL, 13, 0.1]].map(([x, y, z, size, power]) => ctx.glows.add({ position: at(x, y, z), size, color: new THREE.Color('#ffb030'), power }));
  const here = at(XC, 0, ZL);
  ctx.voice('gold', at(-8, 24, 2), 150, true).level = 1;                      // the leaves are gold, and sound like it
  const strings = ctx.voice('loom', at(XC, 4, ZL), 60);
  ctx.ticks.push((dt, time, boat, look, eye) => {
    const on = boat.s > 556 && boat.s < 880; grp.visible = on; if (twin) twin.visible = on;
    if (!on) return;
    const d = Math.hypot(eye.x - here.x, eye.z - here.z), near = smooth(34, 5, d), breath = 0.9 + 0.1 * Math.sin(time * 0.7);
    warp.userData.uniforms.uThreadGain.value.x = (0.7 + 0.8 * near) * breath;                 // the warp brightens as the canoe comes to it
    strings.level = boat.frozen ? 0 : near;
    web.intensity = (0.75 + 0.5 * near) * breath; halos[4].power = (0.08 + 0.1 * near) * breath;
  });
}

// ------------------------------------------------------------------------------------------------ the stag
function stag(ctx) {
  const S = STAG.s, hw = river.halfWidth(S), here = river.at(S), p = spot(S, -(hw - 1.4), -0.14);
  const body = new Builder(1200), head = new Builder(900), W = () => [1, 1, 1], BONE = () => [0.84, 0.88, 0.96];
  // He faces +z in his own frame. A red deer a quarter over life size: 1.6 m at the shoulder.
  lump(body, 0, 1.45, 0.0, 0.33, 0.4, 0.82, 2, 5, 0.03, W); lump(body, 0, 1.54, 0.5, 0.3, 0.44, 0.42, 1, 6, 0.03, W); lump(body, 0, 1.5, -0.52, 0.33, 0.42, 0.44, 1, 7, 0.03, W);
  tube(body, [[0, 1.48, 0.7, 0.31], [0, 1.85, 0.98, 0.23], [0, 2.2, 1.12, 0.165], [0, 2.44, 1.18, 0.13]], 8, W);
  tube(body, [[0, 1.3, 0.84, 0.16], [0, 1.6, 1.08, 0.13], [0, 1.95, 1.2, 0.07]], 5, W, null, true);                                      // the ruff under his neck
  for (const sx of [-1, 1]) {
    tube(body, [[sx * 0.17, 1.38, 0.52, 0.135], [sx * 0.17, 0.95, 0.56, 0.085], [sx * 0.17, 0.62, 0.53, 0.058], [sx * 0.17, 0.14, 0.5, 0.042], [sx * 0.17, 0.0, 0.53, 0.056], [sx * 0.17, -0.3, 0.53, 0.05]], 6, W);
    tube(body, [[sx * 0.19, 1.42, -0.58, 0.175], [sx * 0.2, 1.0, -0.66, 0.1], [sx * 0.2, 0.68, -0.84, 0.064], [sx * 0.2, 0.16, -0.74, 0.042], [sx * 0.2, 0.0, -0.71, 0.056], [sx * 0.2, -0.3, -0.71, 0.05]], 6, W);
  }
  tube(body, [[0, 1.74, -0.9, 0.06], [0, 1.62, -1.02, 0.045], [0, 1.46, -1.05, 0.02]], 4, W, null, true);
  // the head, about the top of the neck
  tube(head, [[0, -0.05, -0.08, 0.12], [0, 0.03, 0.1, 0.13], [0, 0.0, 0.26, 0.1], [0, -0.06, 0.4, 0.07], [0, -0.1, 0.5, 0.055], [0, -0.11, 0.545, 0.028]], 7, W, null, true);
  for (const sx of [-1, 1]) {
    tube(head, [[sx * 0.09, 0.08, 0.0, 0.04], [sx * 0.2, 0.15, -0.04, 0.046], [sx * 0.31, 0.2, -0.06, 0.012]], 4, W, null, true);          // an ear
    lump(head, sx * 0.112, 0.045, 0.17, 0.024, 0.028, 0.032, 0, 3, 0, () => [0.02, 0.03, 0.06]);                                      // an eye
    // Eikþyrnir, oak-thorn: beams that sweep out and back and up like boughs, and every tine forks as a twig does
    const main = [[sx * 0.07, 0.1, 0.0, 0.052], [sx * 0.25, 0.46, -0.15, 0.047], [sx * 0.5, 0.9, -0.28, 0.041], [sx * 0.72, 1.38, -0.24, 0.035], [sx * 0.8, 1.84, -0.04, 0.027], [sx * 0.7, 2.2, 0.2, 0.01]];
    tube(head, main, 5, BONE, null, true);
    const tine = (o, d, len, r, fork = 0) => {
      const m = [o[0] + d[0] * len * 0.55, o[1] + d[1] * len * 0.5, o[2] + d[2] * len * 0.55], e = [o[0] + d[0] * len, o[1] + d[1] * len + len * 0.14, o[2] + d[2] * len];
      tube(head, [[o[0], o[1], o[2], r], [m[0], m[1], m[2], r * 0.72], [e[0], e[1], e[2], r * 0.15]], 4, BONE, null, true);
      if (fork) tube(head, [[m[0], m[1], m[2], r * 0.6], [m[0] + sx * fork * 0.5 + d[0] * len * 0.2, m[1] + len * 0.34, m[2] - d[2] * len * 0.15, r * 0.12]], 4, BONE, null, true);
    };
    tine(main[0], [sx * 0.25, 0.5, 0.85], 0.52, 0.034); tine(main[1], [sx * 0.3, 0.45, 0.85], 0.5, 0.032, 0.3); tine(main[2], [sx * 0.2, 0.5, 0.85], 0.5, 0.03, 0.35);
    tine(main[3], [sx * 0.6, 0.7, -0.35], 0.56, 0.028, 0.4); tine(main[3], [sx * 0.1, 0.6, 0.8], 0.42, 0.026);
    tine(main[4], [-sx * 0.35, 0.85, -0.4], 0.5, 0.025, -0.3); tine(main[4], [sx * 0.6, 0.75, 0.3], 0.46, 0.025, 0.3); tine(main[4], [sx * 0.2, 0.5, -0.8], 0.4, 0.022);
  }
  lump(head, 0, -0.105, 0.54, 0.03, 0.025, 0.02, 0, 4, 0, () => [0.05, 0.05, 0.08]);
  const mat = makePaint({ color: '#eef2fa', brush: 0.25, brushScale: 0.9, emissive: '#3a4759', rim: { color: '#ffffff', strength: 0.9, power: 2.2 } });
  const K = 1.5;                                                         // half again the size of a red deer: he is not one
  const grp = new THREE.Group(); grp.name = 'Eikthyrnir'; grp.position.copy(p); grp.scale.setScalar(K);
  const dir = [here.rx * 0.8 - here.tx * 0.6, here.rz * 0.8 - here.tz * 0.6], yaw = Math.atan2(dir[0], dir[1]); grp.rotation.y = yaw;        // across the river and a little upstream: toward whoever is coming
  const hd = new THREE.Mesh(head.build({ uv: false, bend: false }), mat); hd.position.set(0, 2.44, 1.18);
  grp.add(new THREE.Mesh(body.build({ uv: false, bend: false }), mat), hd);
  ctx.world.addMoving(grp);
  ctx.obstacles.push({ x: p.x, z: p.z, r: 1.6 });
  ctx.lights.push({ position: V3(p.x + dir[0] * 2.6, 1.5, p.z + dir[1] * 2.6), color: new THREE.Color('#bcd4ff'), radius: 9, intensity: 0.6 });      // before him, over the water: his own whiteness given back
  // what drips from his antlers: three drops at a time, each ringing the water where it lands
  const cs = Math.cos(yaw), sn = Math.sin(yaw), tips = [[-0.72, 4.5, 1.3], [0.76, 4.55, 1.2], [0.22, 3.1, 1.85]].map(([x, y, z]) => V3(p.x + (x * cs + z * sn) * K, y * K + p.y, p.z + (-x * sn + z * cs) * K));
  const drops = tips.map((t, i) => ({ t, glow: ctx.glows.add({ position: t.clone(), size: 0.07, color: new THREE.Color('#cfe4ff'), power: 0 }), ph: i * 0.37, last: 0 }));
  let look = 0;
  ctx.ticks.push((dt, time, boat, lk, eye) => {
    const on = boat.s > 690 && boat.s < 860; grp.visible = on;
    if (!on) { for (const d of drops) d.glow.power = 0; return; }
    // his head comes round to the canoe when it is near enough to matter, and stays on it
    const dx = eye.x - p.x, dz = eye.z - p.z, dist = Math.hypot(dx, dz);
    let to = Math.atan2(dx, dz) - yaw; to = Math.atan2(Math.sin(to), Math.cos(to)); to = Math.max(-1.3, Math.min(1.3, to)) * smooth(70, 44, dist);
    look += (to - look) * Math.min(1, dt * 1.6); if (boat.frozen) look = to;
    hd.rotation.y = look + 0.03 * Math.sin(time * 0.4); hd.rotation.x = -0.12 * smooth(60, 20, dist) + 0.02 * Math.sin(time * 0.9);
    for (const d of drops) {
      const u = (time * 0.42 + d.ph) % 1, fall = Math.min(1, u * 2.2), y = d.t.y * (1 - fall * fall);
      d.glow.position.set(d.t.x, Math.max(0.02, y), d.t.z); d.glow.power = fall < 1 ? 0.9 : 0;
      if (fall >= 1 && d.last < 1 && dist < 60 && ctx.water.ripples.touch) { ctx.water.ripples.touch(d.t.x, d.t.z, 0.12, 0.35); ctx.hit('drop', { x: d.t.x, y: 0, z: d.t.z }, 0.8); }
      d.last = fall;
    }
  });
  const puffs = []; for (let k = 0; k < 4; k++) { const q = spot(S - 4 + k * 3, -(hw - 2 - k % 2 * 2), 0.5); puffs.push({ x: q.x, y: q.y, z: q.z, width: 7 + k, height: 1.2, opacity: 0.3, drift: 0.5 }); }
  ctx.world.add(makeMist(puffs), S, false);
}

// ------------------------------------------------------------------------------------------------ the air of the grove
function air(ctx, forest) {
  const rnd = rng(7001), tint = () => { const r = rnd(); return r < 0.15 ? [1.0, 0.5, 0.16] : r < 0.6 ? [1.0, 0.76, 0.22] : [1.0, 0.9, 0.4]; };
  // leaves coming down: all through the reach a few, and under the great tree a steady fall of them
  const fall = (s0, s1, n, h0, h1, at) => {
    const list = []; for (let k = 0; k < n; k++) { const s = s0 + rnd() * (s1 - s0), hw = river.halfWidth(s), q = spot(s, (rnd() * 2 - 1) * (hw + 2), 0.03); list.push({ x: q.x, y: q.y, z: q.z, fall: h0 + rnd() * (h1 - h0), size: 0.09 + rnd() * 0.06, speed: 0.7 + rnd() * 0.6, color: tint() }); }
    ctx.world.add(makeLeaves(list, forest.sheet), at, true);
  };
  fall(612, 680, 60, 7, 12, 646); fall(680, 722, 60, 8, 13, 700); fall(722, 772, 200, 9, 20, 746); fall(772, 806, 40, 7, 11, 790);
  // gold dust in the air under the crown, and a low gilded mist on the pool
  const motes = []; for (let k = 0; k < 70; k++) { const s = 720 + rnd() * 50, q = spot(s, (rnd() * 2 - 1) * river.halfWidth(s), 0.6 + rnd() * 6); motes.push({ x: q.x, y: q.y, z: q.z, roam: 1.5 + rnd() * 2.5, size: 0.02 + rnd() * 0.02, speed: 0.2 + rnd() * 0.3, kind: 0, color: [1.5, 1.05, 0.35] }); }
  ctx.world.add(makeMotes(motes), TREE.s, true);
  const puffs = []; for (let k = 0; k < 14; k++) { const s = 712 + rnd() * 64, hw = river.halfWidth(s), q = spot(s, (rnd() * 2 - 1) * hw * 0.9, 0.35 + rnd() * 0.3); puffs.push({ x: q.x, y: q.y, z: q.z, width: 9 + rnd() * 9, height: 0.8 + rnd() * 0.7, opacity: 0.2 + rnd() * 0.16, drift: 0.4 + rnd() * 0.6 }); }
  ctx.world.add(makeMist(puffs), TREE.s, false);
}
